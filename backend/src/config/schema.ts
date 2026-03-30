import { z } from 'zod';

const mcpServerBaseSchema = z.object({
    env: z.record(z.string(), z.string()).optional(),
    defaultToolTimeout: z.number().int().nonnegative().optional(),
    outputHandling: z.string().optional(),
});

const mcpServerStdioSchema = mcpServerBaseSchema.extend({
    transport: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    stderr: z.enum(['overlapped', 'pipe', 'ignore', 'inherit']).optional(),
    restart: z.object({
        enabled: z.boolean().optional(),
        maxAttempts: z.number().int().nonnegative().optional(),
        delayMs: z.number().int().nonnegative().optional(),
    }).optional(),
});

const mcpServerHttpSchema = mcpServerBaseSchema.extend({
    transport: z.enum(['http', 'sse']),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    reconnect: z.object({
        enabled: z.boolean().optional(),
        maxAttempts: z.number().int().nonnegative().optional(),
        delayMs: z.number().int().nonnegative().optional(),
    }).optional(),
    automaticSSEFallback: z.boolean().optional(),
});

const mcpServerSchema = z.union([mcpServerStdioSchema, mcpServerHttpSchema]);

const llmModelSchema = z.object({
    alias: z.string().min(1),
    provider: z.enum(['openai', 'anthropic']),
    base_url: z.string().min(1),
    model: z.string().min(1),
    api_key: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    max_retries: z.number().int().nonnegative().optional(),
});

export const configSchema = z.object({
    llm: z.object({
        default_model: z.string().min(1),
        active_model_alias: z.string().min(1),
        models: z.array(llmModelSchema).min(1),
    }),
    agent: z.object({
        workspace: z.string().min(1),
        skills_dir: z.string().min(1),
        recursion_limit: z.number().int().positive(),
        compaction: z.object({
            enabled: z.boolean(),
            auto_compact_threshold: z.number().int().nonnegative(),
            context_window: z.number().int().positive(),
            reserve_tokens: z.number().int().nonnegative(),
            max_history_share: z.number().min(0).max(1),
        }),
    }),
    mcp: z.object({
        enabled: z.boolean(),
        throwOnLoadError: z.boolean().optional(),
        prefixToolNameWithServerName: z.boolean().optional(),
        additionalToolNamePrefix: z.string().optional(),
        useStandardContentBlocks: z.boolean().optional(),
        onConnectionError: z.enum(['throw', 'ignore']).optional(),
        servers: z.record(z.string(), mcpServerSchema),
    }),
});

export function validateConfig(raw: unknown) {
    return configSchema.parse(raw);
}
