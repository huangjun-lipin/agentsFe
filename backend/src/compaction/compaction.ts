import type { BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

const MESSAGE_TOKEN_OVERHEAD = 4;
const MIN_CONTEXT_BUDGET_TOKENS = 1;

type TokenAwareModel = BaseChatModel & {
    getNumTokens?: (text: string) => Promise<number>;
};

/**
 * 估算文本 token 数
 * 使用启发式规则：中文约 1 token/字，英文约 1.3 tokens/词
 */
export function estimateTokens(text: string): number {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = text.replace(/[\u4e00-\u9fa5a-zA-Z\s]/g, '').length;
    return Math.ceil(chineseChars + englishWords * 1.3 + otherChars * 0.5);
}

export function estimateMessageTokens(message: BaseMessage): number {
    const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
    return estimateTokens(content) + MESSAGE_TOKEN_OVERHEAD;
}

export function estimateTotalTokens(messages: BaseMessage[]): number {
    return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

export interface CompactionConfig {
    enabled: boolean;
    auto_compact_threshold: number;
    context_window: number;
    reserve_tokens: number;
    max_history_share: number;
}

function serializeMessageForTokenCount(message: BaseMessage): string {
    const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
    const type = message._getType();
    const role = type === 'human' ? 'user' : type === 'ai' ? 'assistant' : type === 'system' ? 'system' : type;
    return `[${role}]\n${content}`;
}

async function tryCountTokensByModel(text: string, model?: BaseChatModel): Promise<number | null> {
    if (!text) return 0;
    if (!model) return null;
    const tokenAwareModel = model as TokenAwareModel;
    if (typeof tokenAwareModel.getNumTokens !== 'function') return null;
    try {
        const counted = await tokenAwareModel.getNumTokens(text);
        if (Number.isFinite(counted) && counted >= 0) return Math.ceil(counted);
    } catch { /* fallback */ }
    return null;
}

export function getCompactionHardContextBudget(config: CompactionConfig): number {
    return Math.max(MIN_CONTEXT_BUDGET_TOKENS, config.context_window - config.reserve_tokens);
}

export function getEffectiveAutoCompactThreshold(config: CompactionConfig): number {
    return Math.min(config.auto_compact_threshold, getCompactionHardContextBudget(config));
}

export function getCompactionHistoryTokenBudget(config: CompactionConfig): number {
    return Math.max(
        MIN_CONTEXT_BUDGET_TOKENS,
        Math.floor(getCompactionHardContextBudget(config) * config.max_history_share),
    );
}

export async function countTokensWithModel(text: string, model?: BaseChatModel): Promise<number> {
    const normalized = text ?? '';
    const modelTokens = await tryCountTokensByModel(normalized, model);
    if (modelTokens !== null) return modelTokens;
    return estimateTokens(normalized);
}

export async function countMessageTokensWithModel(message: BaseMessage, model?: BaseChatModel): Promise<number> {
    const serialized = serializeMessageForTokenCount(message);
    const contentTokens = await countTokensWithModel(serialized, model);
    return contentTokens + MESSAGE_TOKEN_OVERHEAD;
}

export async function countTotalTokensWithModel(messages: BaseMessage[], model?: BaseChatModel): Promise<number> {
    if (messages.length === 0) return 0;
    const counts = await Promise.all(messages.map((message) => countMessageTokensWithModel(message, model)));
    return counts.reduce((sum, value) => sum + value, 0);
}

export function shouldAutoCompact(totalTokens: number, config: CompactionConfig): boolean {
    if (!config.enabled) return false;
    return totalTokens >= getEffectiveAutoCompactThreshold(config);
}

export function pruneMessages(
    messages: BaseMessage[],
    maxTokens: number,
): {
    kept: BaseMessage[];
    dropped: BaseMessage[];
    droppedTokens: number;
    keptTokens: number;
} {
    const result = {
        kept: [] as BaseMessage[],
        dropped: [] as BaseMessage[],
        droppedTokens: 0,
        keptTokens: 0,
    };

    if (messages.length === 0) return result;

    const systemMessages = messages.filter(m => m._getType() === 'system');
    const nonSystemMessages = messages.filter(m => m._getType() !== 'system');

    const systemTokens = estimateTotalTokens(systemMessages);
    const availableTokens = maxTokens - systemTokens;

    const keptNonSystem: BaseMessage[] = [];
    let currentTokens = 0;

    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
        const msg = nonSystemMessages[i];
        const msgTokens = estimateMessageTokens(msg);

        if (currentTokens + msgTokens <= availableTokens) {
            keptNonSystem.unshift(msg);
            currentTokens += msgTokens;
        } else {
            result.dropped.push(msg);
            result.droppedTokens += msgTokens;
        }
    }

    result.kept = [...systemMessages, ...keptNonSystem];
    result.keptTokens = systemTokens + currentTokens;

    return result;
}
