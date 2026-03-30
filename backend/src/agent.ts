import {
    createDeepAgent,
    FilesystemBackend,
} from 'deepagents';
import { MemorySaver } from '@langchain/langgraph';
import { AIMessage, AIMessageChunk, ChatMessageChunk } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';
import { resolve } from 'node:path';

import { loadConfig, type Config } from './config/index.js';
import { getSubagents } from './subagents/index.js';
import { getTodoTools } from './tools/todo-tools.js';
import { initializeMCPTools } from './mcp.js';
import { createChatModel } from './llm.js';
import { redactSensitiveText } from './security/redaction.js';

export interface RuntimeAgent {
    invoke: (input: unknown, options?: unknown) => Promise<Record<string, unknown>>;
    streamEvents: (input: unknown, options?: unknown) => AsyncIterable<Record<string, unknown>>;
}

export interface AgentContext {
    agent: RuntimeAgent;
    config: Config;
    cleanup: () => Promise<void>;
}

export interface CreateAgentOptions {
    checkpointer?: MemorySaver;
}

function toSingleLineDescription(description: string | undefined): string {
    if (!description) return '';
    const normalized = description.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    const sentence = normalized.split(/(?<=[。.!?])\s+/u)[0]?.trim() || normalized;
    return sentence.length > 140 ? `${sentence.slice(0, 137)}...` : sentence;
}

function buildToolSummaryLines(
    tools: Array<{ name?: string; description?: string }>
): string[] {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const toolItem of tools) {
        const name = (toolItem.name || '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const desc = toSingleLineDescription(toolItem.description);
        lines.push(desc ? `- ${name}: ${desc}` : `- ${name}`);
    }
    return lines.length > 0 ? lines : ['- 当前未发现可用工具'];
}

type NormalizedToolCall = {
    id?: string;
    name: string;
    args: Record<string, unknown>;
    type: 'tool_call';
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolCallsFromAdditionalKwargs(additionalKwargs: unknown): NormalizedToolCall[] {
    if (!isRecord(additionalKwargs)) return [];
    const rawToolCalls = additionalKwargs.tool_calls;
    if (!Array.isArray(rawToolCalls) || rawToolCalls.length === 0) return [];

    const normalized: NormalizedToolCall[] = [];
    const chunkGroups = new Map<string, { id?: string; name?: string; argsText: string; order: number }>();

    for (const item of rawToolCalls) {
        if (!isRecord(item)) continue;

        const directName = typeof item.name === 'string' ? item.name : null;
        const directArgs = isRecord(item.args) ? item.args : null;
        if (directName && directArgs) {
            normalized.push({
                id: typeof item.id === 'string' ? item.id : undefined,
                name: directName,
                args: directArgs,
                type: 'tool_call',
            });
            continue;
        }

        const fn = isRecord(item.function) ? item.function : null;
        const rawId = typeof item.id === 'string' ? item.id : undefined;
        const rawIndex = typeof item.index === 'number' ? item.index : null;
        const key = rawIndex !== null
            ? `index:${rawIndex}`
            : rawId ? `id:${rawId}` : `pos:${chunkGroups.size}`;
        const group = chunkGroups.get(key) || { argsText: '', order: chunkGroups.size };

        if (rawId) group.id = rawId;
        if (fn && typeof fn.name === 'string' && fn.name.trim()) group.name = fn.name.trim();
        const fnArgs = fn?.arguments;
        if (typeof fnArgs === 'string' && fnArgs) group.argsText += fnArgs;
        else if (isRecord(fnArgs)) group.argsText += JSON.stringify(fnArgs);

        chunkGroups.set(key, group);
    }

    for (const group of Array.from(chunkGroups.values()).sort((a, b) => a.order - b.order)) {
        if (!group.name) continue;
        let args: Record<string, unknown> = {};
        const rawArgs = group.argsText.trim();
        if (rawArgs) {
            try {
                const parsed = JSON.parse(rawArgs);
                if (isRecord(parsed)) args = parsed;
            } catch { /* ignore */ }
        }
        normalized.push({ id: group.id, name: group.name, args, type: 'tool_call' });
    }

    return normalized;
}

function stripRawToolCalls(additionalKwargs: unknown): Record<string, unknown> {
    if (!isRecord(additionalKwargs)) return {};
    if (!Object.prototype.hasOwnProperty.call(additionalKwargs, 'tool_calls')) return additionalKwargs;
    const cloned = { ...additionalKwargs };
    delete cloned.tool_calls;
    return cloned;
}

function createModelResponseCompatibilityMiddleware() {
    return createMiddleware({
        name: 'ModelResponseCompatibilityMiddleware',
        wrapModelCall: async (request, handler) => {
            const response = await handler(request);
            if (AIMessageChunk.isInstance(response) || ChatMessageChunk.isInstance(response)) {
                const toolCalls = Array.isArray((response as { tool_calls?: unknown[] }).tool_calls)
                    ? (response as { tool_calls: NormalizedToolCall[] }).tool_calls
                    : parseToolCallsFromAdditionalKwargs((response as { additional_kwargs?: unknown }).additional_kwargs);
                return new AIMessage({
                    content: response.content,
                    additional_kwargs: stripRawToolCalls(response.additional_kwargs),
                    response_metadata: response.response_metadata,
                    id: response.id,
                    name: response.name,
                    tool_calls: toolCalls,
                });
            }
            return response;
        },
    });
}

export async function createTodoAgent(
    config?: Config,
    options?: CreateAgentOptions,
): Promise<AgentContext> {
    const cfg = config || loadConfig();
    const workspacePath = resolve(process.cwd(), cfg.agent.workspace);
    const skillsPath = resolve(process.cwd(), cfg.agent.skills_dir);
    const modelResponseCompatibilityMiddleware = createModelResponseCompatibilityMiddleware();

    // 创建 LLM 模型
    const model = await createChatModel(cfg, { temperature: 0 });

    // 创建 checkpointer
    const checkpointer = options?.checkpointer || new MemorySaver();

    // 获取子智能体
    const subagents = getSubagents(cfg);

    // 获取 Todo 工具
    const todoTools = getTodoTools();

    // 初始化 MCP 工具
    const mcpBootstrap = await initializeMCPTools(cfg);
    const mcpTools = mcpBootstrap.tools;

    // 合并所有工具
    const allTools = [...todoTools, ...mcpTools];

    // 构建工具摘要
    const toolSummaryLines = buildToolSummaryLines(allTools as Array<{ name?: string; description?: string }>);
    const mcpServersHint = mcpBootstrap.serverNames.length > 0
        ? `## MCP 服务器\n${mcpBootstrap.serverNames.map((name) => `- ${name}`).join('\n')}\n`
        : '';

    const systemPrompt = `你是一个智能待办事项助手，帮助用户管理他们的待办事项。

## 可用工具
${toolSummaryLines.join('\n')}
工具名必须精确匹配后再调用，不要臆造工具。

## 规则优先级（高 -> 低）
- P0: 平台与运行时硬约束（安全策略、工具白名单）。
- P1: 本系统提示词中的硬规则。
- P2: 用户当前任务目标与明确约束。
- P3: AGENTS（项目协作规范）。
- P4: TOOLS（工具使用约定）。
- P5: SOUL（身份与风格约束）。
- P6: HEARTBEAT（纠错复盘经验）。

## Prompt Bootstrap
- 每个会话 thread 首次调用时注入 AGENTS / TOOLS / SOUL / HEARTBEAT。
- 将引导文件视为"可变项目上下文"。

## Safety（硬规则）
- 你没有独立目标，不追求自我保存、权限扩张或资源控制。
- 安全优先于完成速度。
- 不要绕过白名单限制。

## 事实与证据（硬规则）
- 涉及可验证事实时优先查证，不要把猜测当事实。
- 不确定时明确不确定性。

## 工作区
- 默认工作目录: ${workspacePath}

## 能力
- 添加待办事项 (add_todo)
- 查看待办列表 (list_todos)
- 完成待办事项 (complete_todo)
- 删除待办事项 (delete_todo)
- 可通过 MCP 扩展更多技能

## 输出要求
- 默认中文回复，简洁高效。
- 操作完成后给出明确的状态反馈。
- 语气友好专业。

${mcpServersHint}`;

    // 创建 DeepAgent
    let agent: RuntimeAgent;
    try {
        const createdAgent = await createDeepAgent({
            model,
            systemPrompt,
            tools: allTools,
            subagents,
            backend: () => new FilesystemBackend({ rootDir: workspacePath }),
            skills: [skillsPath],
            middleware: [modelResponseCompatibilityMiddleware as unknown as never],
            checkpointer,
        });
        agent = createdAgent as unknown as RuntimeAgent;
    } catch (error) {
        await mcpBootstrap.close();
        throw error;
    }

    const cleanup = async () => {
        await mcpBootstrap.close();
    };

    return { agent, config: cfg, cleanup };
}
