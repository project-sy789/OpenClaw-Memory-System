// ============================================================
// OpenClaw Memory System — Semantic Header Injector
// ============================================================
// Adds contextual headers to chunks for better embedding quality.

import OpenAI from 'openai';
import { hashContent } from '../utils/hasher';
import { logger } from '../utils/logger';

interface HeaderCache {
    contentHash: string;
    header: string;
}

export class HeaderInjector {
    private client: OpenAI;
    private cache = new Map<string, HeaderCache>();
    private useAI: boolean;

    constructor(apiKey: string, useAI = true, baseUrl?: string) {
        this.client = new OpenAI({
            apiKey,
            baseURL: baseUrl
        });
        this.useAI = useAI;
    }

    /**
     * Generate a semantic header for a chunk of content.
     * Combines rule-based extraction with optional LLM generation.
     */
    async generateHeader(
        content: string,
        existingHeader?: string
    ): Promise<string> {
        // If chunk already has a clear header, return it
        if (existingHeader && existingHeader !== '(untitled)') {
            return existingHeader;
        }

        // Check cache
        const hash = hashContent(content);
        const cached = this.cache.get(hash);
        if (cached && cached.contentHash === hash) {
            return cached.header;
        }

        let header: string;

        if (this.useAI) {
            header = await this.aiGenerateHeader(content);
        } else {
            header = this.ruleBasedHeader(content);
        }

        // Cache result
        this.cache.set(hash, { contentHash: hash, header });
        return header;
    }

    /**
     * Inject headers into multiple chunks in batch.
     */
    async injectHeaders(
        chunks: { content: string; sourceHeader: string }[]
    ): Promise<string[]> {
        const results: string[] = [];

        for (const chunk of chunks) {
            const header = await this.generateHeader(chunk.content, chunk.sourceHeader);
            results.push(header);
        }

        return results;
    }

    /**
     * Prepend a semantic header to chunk content.
     * This is the content that gets embedded.
     */
    formatChunkWithHeader(header: string, content: string): string {
        return `## ${header}\n\n${content}`;
    }

    // ----------------------------------------------------------
    // AI-Based Header Generation
    // ----------------------------------------------------------

    private async aiGenerateHeader(content: string): Promise<string> {
        try {
            // Use a very short prompt to minimize token usage (~50 tokens)
            const response = await this.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content:
                            'Generate a concise, descriptive header (max 10 words) for the following content. Format: "Topic — Subtopic". Reply with ONLY the header text, nothing else.',
                    },
                    {
                        role: 'user',
                        content: content.slice(0, 500), // Only send first 500 chars
                    },
                ],
                max_tokens: 30,
                temperature: 0.3,
            });

            const header =
                response.choices[0]?.message?.content?.trim() ?? this.ruleBasedHeader(content);
            logger.debug(`AI header: "${header}"`);
            return header;
        } catch (error) {
            logger.warn('AI header generation failed, falling back to rule-based');
            return this.ruleBasedHeader(content);
        }
    }

    // ----------------------------------------------------------
    // Rule-Based Header Generation (fallback)
    // ----------------------------------------------------------

    private ruleBasedHeader(content: string): string {
        // Strategy 1: Extract first meaningful line
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length === 0) return 'Untitled Memory';

        // Check for markdown header
        const headerMatch = lines[0].match(/^#{1,6}\s+(.+)$/);
        if (headerMatch) return headerMatch[1];

        // Strategy 2: Extract keywords from first sentence
        const firstLine = lines[0].replace(/^[-*]\s+/, '').trim();

        // Truncate to ~10 words
        const words = firstLine.split(/\s+/).slice(0, 10);
        const header = words.join(' ');

        // Add ellipsis if truncated
        if (words.length < firstLine.split(/\s+/).length) {
            return header + '…';
        }

        return header || 'Untitled Memory';
    }
}
