import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type BootstrapFileName = 'AGENTS.md' | 'TOOLS.md' | 'SOUL.md' | 'HEARTBEAT.md';
type BootstrapTopic = 'agents' | 'tools' | 'soul' | 'heartbeat';

interface LoadedBootstrapFile {
    topic: BootstrapTopic;
    name: BootstrapFileName;
    absPath: string;
    missing: boolean;
    truncated: boolean;
    content: string;
}

const DEFAULT_BOOTSTRAP_FILE_MAX_CHARS = 4000;
const DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS = 12000;

function clipInjectedText(content: string, maxChars: number): { text: string; truncated: boolean } {
    const normalized = content.replace(/\r\n/g, '\n').trim();
    if (maxChars <= 0) return { text: '', truncated: normalized.length > 0 };
    if (normalized.length <= maxChars) return { text: normalized, truncated: false };
    return {
        text: `${normalized.slice(0, Math.max(0, maxChars - 1))}…`,
        truncated: true,
    };
}

function getBootstrapCandidates(workspacePath: string): Array<{ topic: BootstrapTopic; name: BootstrapFileName; absPath: string }> {
    const files: Array<{ topic: BootstrapTopic; name: BootstrapFileName }> = [
        { topic: 'agents', name: 'AGENTS.md' },
        { topic: 'tools', name: 'TOOLS.md' },
        { topic: 'soul', name: 'SOUL.md' },
        { topic: 'heartbeat', name: 'HEARTBEAT.md' },
    ];

    return files.map(f => ({
        ...f,
        absPath: join(workspacePath, f.name),
    }));
}

async function loadBootstrapFiles(workspacePath: string): Promise<LoadedBootstrapFile[]> {
    const candidates = getBootstrapCandidates(workspacePath);
    const loaded: LoadedBootstrapFile[] = [];

    for (const candidate of candidates) {
        if (!existsSync(candidate.absPath)) {
            loaded.push({
                topic: candidate.topic,
                name: candidate.name,
                absPath: candidate.absPath,
                missing: true,
                truncated: false,
                content: '',
            });
            continue;
        }

        try {
            const raw = await readFile(candidate.absPath, 'utf-8');
            const { text, truncated } = clipInjectedText(raw, DEFAULT_BOOTSTRAP_FILE_MAX_CHARS);
            loaded.push({
                topic: candidate.topic,
                name: candidate.name,
                absPath: candidate.absPath,
                missing: false,
                truncated,
                content: text,
            });
        } catch {
            loaded.push({
                topic: candidate.topic,
                name: candidate.name,
                absPath: candidate.absPath,
                missing: true,
                truncated: false,
                content: '',
            });
        }
    }

    return loaded;
}

export async function buildPromptBootstrapMessage(options: {
    workspacePath: string;
}): Promise<{ role: 'user'; content: string } | null> {
    const files = await loadBootstrapFiles(options.workspacePath);
    const availableFiles = files.filter(f => !f.missing && f.content);

    if (availableFiles.length === 0) return null;

    let totalChars = 0;
    const sections: string[] = [];

    for (const file of availableFiles) {
        if (totalChars + file.content.length > DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS) {
            const remaining = DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS - totalChars;
            if (remaining > 100) {
                const { text } = clipInjectedText(file.content, remaining);
                sections.push(`### ${file.name}\n${text}`);
            }
            break;
        }
        sections.push(`### ${file.name}\n${file.content}`);
        totalChars += file.content.length;
    }

    if (sections.length === 0) return null;

    const content = `[Prompt Bootstrap — 项目上下文注入]\n\n${sections.join('\n\n---\n\n')}`;
    return { role: 'user', content };
}
