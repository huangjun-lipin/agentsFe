export type LLMProvider = 'openai' | 'anthropic';

export interface LLMModelConfig {
    alias: string;
    provider: LLMProvider;
    base_url: string;
    model: string;
    api_key: string;
    headers?: Record<string, string>;
    max_retries?: number;
}

export interface LLMConfig {
    default_model: string;
    active_model_alias: string;
    models: LLMModelConfig[];
}

export interface CompactionConfig {
    enabled: boolean;
    auto_compact_threshold: number;
    context_window: number;
    reserve_tokens: number;
    max_history_share: number;
}

export interface MCPServerStdioConfig {
    transport: 'stdio';
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    stderr?: 'overlapped' | 'pipe' | 'ignore' | 'inherit';
    restart?: { enabled?: boolean; maxAttempts?: number; delayMs?: number };
    defaultToolTimeout?: number;
    outputHandling?: string;
}

export interface MCPServerHttpConfig {
    transport: 'http' | 'sse';
    url: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    reconnect?: { enabled?: boolean; maxAttempts?: number; delayMs?: number };
    automaticSSEFallback?: boolean;
    defaultToolTimeout?: number;
    outputHandling?: string;
}

export type MCPServerConfig = MCPServerStdioConfig | MCPServerHttpConfig;

export interface MCPConfig {
    enabled: boolean;
    throwOnLoadError?: boolean;
    prefixToolNameWithServerName?: boolean;
    additionalToolNamePrefix?: string;
    useStandardContentBlocks?: boolean;
    onConnectionError?: 'throw' | 'ignore';
    servers: Record<string, MCPServerConfig>;
}

export interface AgentConfig {
    workspace: string;
    skills_dir: string;
    recursion_limit: number;
    compaction: CompactionConfig;
}

export interface Config {
    llm: LLMConfig;
    agent: AgentConfig;
    mcp: MCPConfig;
}
