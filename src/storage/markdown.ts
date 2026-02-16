// ============================================================
// OpenClaw Memory System — Markdown File Manager
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface MarkdownFile {
    filePath: string;
    filename: string;
    frontmatter: Record<string, unknown>;
    content: string;
    sections: MarkdownSection[];
}

export interface MarkdownSection {
    header: string;
    level: number;     // 1 = #, 2 = ##, 3 = ###
    content: string;
    lineStart: number;
    lineEnd: number;
}

export class MarkdownManager {
    private memoryDir: string;

    constructor(memoryDir: string) {
        this.memoryDir = memoryDir;
        fs.mkdirSync(memoryDir, { recursive: true });
    }

    // ----------------------------------------------------------
    // Read Operations
    // ----------------------------------------------------------

    /** Read and parse a markdown file */
    readFile(filePath: string): MarkdownFile {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter, content } = this.parseFrontmatter(raw);
        const sections = this.parseSections(content);
        return {
            filePath,
            filename: path.basename(filePath),
            frontmatter,
            content,
            sections,
        };
    }

    /** List all markdown files in memory directory */
    listFiles(subDir?: string): string[] {
        const dir = subDir ? path.join(this.memoryDir, subDir) : this.memoryDir;
        if (!fs.existsSync(dir)) return [];
        return fs
            .readdirSync(dir, { recursive: true })
            .filter((f) => String(f).endsWith('.md'))
            .map((f) => path.join(dir, String(f)));
    }

    // ----------------------------------------------------------
    // Write Operations
    // ----------------------------------------------------------

    /** Write a markdown file with YAML frontmatter */
    writeFile(
        filename: string,
        content: string,
        frontmatter: Record<string, unknown> = {},
        subDir?: string
    ): string {
        const dir = subDir ? path.join(this.memoryDir, subDir) : this.memoryDir;
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, filename);

        const fm = this.serializeFrontmatter(frontmatter);
        fs.writeFileSync(filePath, fm + content, 'utf-8');
        logger.debug(`Wrote memory file: ${filePath}`);
        return filePath;
    }

    /** Append content to an existing file */
    appendToFile(filePath: string, content: string): void {
        fs.appendFileSync(filePath, '\n\n' + content, 'utf-8');
    }

    /** Merge multiple files into one */
    mergeFiles(
        filePaths: string[],
        outputFilename: string,
        frontmatter: Record<string, unknown> = {},
        subDir?: string
    ): string {
        const sections: string[] = [];
        for (const fp of filePaths) {
            const file = this.readFile(fp);
            sections.push(
                `<!-- source: ${file.filename} -->\n${file.content}`
            );
        }
        const merged = sections.join('\n\n---\n\n');
        return this.writeFile(outputFilename, merged, frontmatter, subDir);
    }

    // ----------------------------------------------------------
    // Session Flush
    // ----------------------------------------------------------

    /** Flush a session's working memory to a markdown file */
    flushSession(
        sessionId: string,
        messages: { role: string; content: string; timestamp: string }[],
        metadata: Record<string, unknown> = {}
    ): string {
        const date = new Date().toISOString().split('T')[0];
        const filename = `session-${date}-${sessionId.slice(0, 8)}.md`;

        const content = messages
            .map(
                (m) =>
                    `### ${m.role.toUpperCase()} (${m.timestamp})\n\n${m.content}`
            )
            .join('\n\n---\n\n');

        const frontmatter = {
            type: 'session',
            session_id: sessionId,
            date,
            message_count: messages.length,
            ...metadata,
        };

        return this.writeFile(filename, content, frontmatter, 'episodes');
    }

    // ----------------------------------------------------------
    // Parsing Helpers
    // ----------------------------------------------------------

    private parseFrontmatter(raw: string): {
        frontmatter: Record<string, unknown>;
        content: string;
    } {
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        if (!fmMatch) {
            return { frontmatter: {}, content: raw };
        }

        const fmBlock = fmMatch[1];
        const content = fmMatch[2];

        // Simple YAML parser for flat key-value pairs
        const frontmatter: Record<string, unknown> = {};
        for (const line of fmBlock.split('\n')) {
            const match = line.match(/^(\w[\w_-]*)\s*:\s*(.+)$/);
            if (match) {
                const key = match[1];
                let value: unknown = match[2].trim();
                // Parse arrays
                if (typeof value === 'string' && value.startsWith('[')) {
                    try {
                        value = JSON.parse(value);
                    } catch {
                        // keep as string
                    }
                }
                // Parse numbers
                if (typeof value === 'string' && !isNaN(Number(value))) {
                    value = Number(value);
                }
                frontmatter[key] = value;
            }
        }

        return { frontmatter, content };
    }

    private serializeFrontmatter(fm: Record<string, unknown>): string {
        if (Object.keys(fm).length === 0) return '';
        const lines = Object.entries(fm).map(([k, v]) => {
            if (Array.isArray(v)) return `${k}: ${JSON.stringify(v)}`;
            return `${k}: ${v}`;
        });
        return `---\n${lines.join('\n')}\n---\n\n`;
    }

    parseSections(content: string): MarkdownSection[] {
        const lines = content.split('\n');
        const sections: MarkdownSection[] = [];
        let current: MarkdownSection | null = null;

        for (let i = 0; i < lines.length; i++) {
            const headerMatch = lines[i].match(/^(#{1,6})\s+(.+)$/);
            if (headerMatch) {
                if (current) {
                    current.lineEnd = i - 1;
                    current.content = lines
                        .slice(current.lineStart + 1, i)
                        .join('\n')
                        .trim();
                    sections.push(current);
                }
                current = {
                    header: headerMatch[2],
                    level: headerMatch[1].length,
                    content: '',
                    lineStart: i,
                    lineEnd: lines.length - 1,
                };
            }
        }

        if (current) {
            current.lineEnd = lines.length - 1;
            current.content = lines
                .slice(current.lineStart + 1)
                .join('\n')
                .trim();
            sections.push(current);
        }

        // If no sections found, treat entire content as one section
        if (sections.length === 0 && content.trim()) {
            sections.push({
                header: '(untitled)',
                level: 1,
                content: content.trim(),
                lineStart: 0,
                lineEnd: lines.length - 1,
            });
        }

        return sections;
    }
}
