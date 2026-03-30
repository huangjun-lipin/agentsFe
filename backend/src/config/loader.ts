import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Config } from './types.js';
import { validateConfig } from './schema.js';

const DEFAULT_CONFIG: Config = {
    llm: {
        default_model: 'default',
        active_model_alias: 'default',
        models: [
            {
                alias: 'default',
                provider: 'openai',
                base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                api_key: process.env.OPENAI_API_KEY || '',
            },
        ],
    },
    agent: {
        workspace: './workspace',
        skills_dir: './workspace/skills',
        recursion_limit: 50,
        compaction: {
            enabled: true,
            auto_compact_threshold: 80000,
            context_window: 128000,
            reserve_tokens: 8000,
            max_history_share: 0.7,
        },
    },
    mcp: {
        enabled: false,
        servers: {},
    },
};

export function loadConfig(configPath?: string): Config {
    const filePath = configPath || resolve(process.cwd(), 'config.json');

    if (!existsSync(filePath)) {
        console.warn(`[Config] ${filePath} not found, using defaults`);
        return DEFAULT_CONFIG;
    }

    try {
        const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
        const merged = deepMerge(DEFAULT_CONFIG, raw);
        return validateConfig(merged) as Config;
    } catch (error) {
        console.warn(`[Config] Failed to load ${filePath}, using defaults:`, error);
        return DEFAULT_CONFIG;
    }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        const sourceVal = source[key];
        const targetVal = target[key];
        if (
            sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
            targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)
        ) {
            result[key] = deepMerge(
                targetVal as Record<string, unknown>,
                sourceVal as Record<string, unknown>,
            );
        } else {
            result[key] = sourceVal;
        }
    }
    return result;
}

export type { Config } from './types.js';
export { DEFAULT_CONFIG };
