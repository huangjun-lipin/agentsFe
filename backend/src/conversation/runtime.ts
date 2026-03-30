import type { Config } from '../config/index.js';
import { MemorySaver } from '@langchain/langgraph';
import { buildPromptBootstrapMessage } from '../prompt/bootstrap.js';
import {
    getActiveModelAlias,
    getActiveModelName,
    hasModelAlias,
    setActiveModelAlias,
    createChatModel,
} from '../llm.js';
import { createTodoAgent, type AgentContext } from '../agent.js';

export interface ConversationRuntimeOptions {
    config: Config;
}

export interface SwitchModelResult {
    alias: string;
    model: string;
}

export interface BuildBootstrapMessagesOptions {
    threadId: string;
    workspacePath: string;
}

export class ConversationRuntime {
    private readonly config: Config;
    private readonly checkpointer = new MemorySaver();
    private agentContext: AgentContext | null = null;
    private readonly bootstrappedThreads = new Set<string>();

    constructor(options: ConversationRuntimeOptions) {
        this.config = options.config;
    }

    async initialize(): Promise<void> {
        if (this.agentContext) return;
        this.agentContext = await this.createAgentContext();
    }

    getAgent() {
        const ctx = this.agentContext;
        if (!ctx) throw new Error('ConversationRuntime has not been initialized');
        return ctx.agent;
    }

    async close(): Promise<void> {
        if (!this.agentContext) return;
        const current = this.agentContext;
        this.agentContext = null;
        await current.cleanup();
    }

    async reloadAgent(): Promise<void> {
        const previousContext = this.agentContext;
        const nextContext = await this.createAgentContext();
        this.agentContext = nextContext;
        if (previousContext) await previousContext.cleanup();
    }

    async switchModel(alias: string): Promise<SwitchModelResult> {
        const trimmedAlias = alias.trim();
        if (!trimmedAlias) throw new Error('模型别名不能为空');
        if (!hasModelAlias(this.config, trimmedAlias)) {
            throw new Error(`未找到模型别名: ${trimmedAlias}`);
        }

        const previousAlias = getActiveModelAlias(this.config);
        if (previousAlias === trimmedAlias) {
            return { alias: trimmedAlias, model: getActiveModelName(this.config) };
        }

        const previousContext = this.agentContext;
        let nextContext: AgentContext | null = null;

        try {
            setActiveModelAlias(this.config, trimmedAlias);
            nextContext = await this.createAgentContext();
            this.agentContext = nextContext;
            if (previousContext) await previousContext.cleanup();
            return { alias: trimmedAlias, model: getActiveModelName(this.config) };
        } catch (error) {
            if (nextContext) await nextContext.cleanup().catch(() => undefined);
            try { setActiveModelAlias(this.config, previousAlias); } catch { /* ignore */ }
            this.agentContext = previousContext;
            throw error;
        }
    }

    async buildBootstrapMessages(options: BuildBootstrapMessagesOptions): Promise<Array<{ role: 'user'; content: string }>> {
        if (this.bootstrappedThreads.has(options.threadId)) return [];
        this.bootstrappedThreads.add(options.threadId);
        const bootstrapPromptMessage = await buildPromptBootstrapMessage({
            workspacePath: options.workspacePath,
        });
        if (!bootstrapPromptMessage) return [];
        return [bootstrapPromptMessage];
    }

    clearBootstrapFlag(threadId: string): void {
        this.bootstrappedThreads.delete(threadId);
    }

    private async createAgentContext(): Promise<AgentContext> {
        return createTodoAgent(this.config, { checkpointer: this.checkpointer });
    }
}
