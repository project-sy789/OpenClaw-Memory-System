// ============================================================
// OpenClaw Memory System — Smart Chunker
// ============================================================
// 3-phase context-aware semantic chunking engine.

import { estimateTokens } from '../utils/tokenizer';
import { logger } from '../utils/logger';

export interface ChunkResult {
    content: string;
    tokenCount: number;
    isParent: boolean;       // parent chunks contain full context
    childIndices: number[];  // indices of child chunks
    parentIndex: number | null;
    overlapBefore: string;   // overlap text from previous chunk
    overlapAfter: string;    // overlap text for next chunk
    sourceHeader: string;    // original markdown header context
}

export interface ChunkerConfig {
    minChunkSize: number;    // min characters
    maxChunkSize: number;    // max characters
    overlapRatio: number;    // 0.0 - 0.5
    maxSentencesPerChunk: number;
}

const DEFAULT_CHUNKER_CONFIG: ChunkerConfig = {
    minChunkSize: 100,
    maxChunkSize: 1500,
    overlapRatio: 0.12,
    maxSentencesPerChunk: 25,
};

export class SmartChunker {
    private config: ChunkerConfig;

    constructor(config: Partial<ChunkerConfig> = {}) {
        this.config = { ...DEFAULT_CHUNKER_CONFIG, ...config };
    }

    /**
     * Main chunking method — 3-phase strategy:
     * Phase 1: Structural split by markdown headers
     * Phase 2: Semantic boundary detection within sections
     * Phase 3: Size normalization + parent-child hierarchy
     */
    chunk(content: string): ChunkResult[] {
        // Phase 1: Structural split
        const structuralChunks = this.structuralSplit(content);
        logger.debug(`Phase 1: ${structuralChunks.length} structural chunks`);

        // Phase 2: Semantic boundaries within each structural chunk
        const semanticChunks: ChunkResult[] = [];
        for (const sChunk of structuralChunks) {
            const subChunks = this.semanticBoundarySplit(sChunk);
            semanticChunks.push(...subChunks);
        }
        logger.debug(`Phase 2: ${semanticChunks.length} semantic chunks`);

        // Phase 3: Size normalization + parent-child + overlap
        const normalized = this.normalizeAndHierarchy(semanticChunks);
        logger.debug(`Phase 3: ${normalized.length} final chunks`);

        return normalized;
    }

    // ----------------------------------------------------------
    // Phase 1: Structural Split
    // ----------------------------------------------------------
    // Split content along markdown headers (##, ###, etc.)

    private structuralSplit(content: string): ChunkResult[] {
        const lines = content.split('\n');
        const chunks: ChunkResult[] = [];
        let currentHeader = '';
        let currentLines: string[] = [];
        let currentLevel = 0;

        const flush = () => {
            const text = currentLines.join('\n').trim();
            if (text.length > 0) {
                chunks.push({
                    content: text,
                    tokenCount: estimateTokens(text),
                    isParent: false,
                    childIndices: [],
                    parentIndex: null,
                    overlapBefore: '',
                    overlapAfter: '',
                    sourceHeader: currentHeader,
                });
            }
        };

        for (const line of lines) {
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headerMatch) {
                flush();
                currentLevel = headerMatch[1].length;
                currentHeader = headerMatch[2];
                currentLines = [line];
            } else {
                currentLines.push(line);
            }
        }
        flush();

        // If no headers found, treat entire content as one chunk
        if (chunks.length === 0 && content.trim()) {
            chunks.push({
                content: content.trim(),
                tokenCount: estimateTokens(content.trim()),
                isParent: false,
                childIndices: [],
                parentIndex: null,
                overlapBefore: '',
                overlapAfter: '',
                sourceHeader: '',
            });
        }

        return chunks;
    }

    // ----------------------------------------------------------
    // Phase 2: Semantic Boundary Split
    // ----------------------------------------------------------
    // Split large chunks at sentence boundaries based on topic shifts.
    // Uses a heuristic approach: detect topic shifts by looking for
    // paragraph breaks, bullet list changes, and sentence length patterns.

    private semanticBoundarySplit(chunk: ChunkResult): ChunkResult[] {
        if (chunk.content.length <= this.config.maxChunkSize) {
            return [chunk];
        }

        const paragraphs = this.splitIntoParagraphs(chunk.content);
        const results: ChunkResult[] = [];
        let currentParagraphs: string[] = [];
        let currentSize = 0;

        for (const para of paragraphs) {
            const paraSize = para.length;

            if (
                currentSize + paraSize > this.config.maxChunkSize &&
                currentSize >= this.config.minChunkSize
            ) {
                // Flush current accumulation
                const text = currentParagraphs.join('\n\n');
                results.push({
                    content: text,
                    tokenCount: estimateTokens(text),
                    isParent: false,
                    childIndices: [],
                    parentIndex: null,
                    overlapBefore: '',
                    overlapAfter: '',
                    sourceHeader: chunk.sourceHeader,
                });
                currentParagraphs = [];
                currentSize = 0;
            }

            currentParagraphs.push(para);
            currentSize += paraSize;
        }

        // Flush remainder
        if (currentParagraphs.length > 0) {
            const text = currentParagraphs.join('\n\n');
            // If too small, merge with last chunk
            if (text.length < this.config.minChunkSize && results.length > 0) {
                const last = results[results.length - 1];
                const merged = last.content + '\n\n' + text;
                results[results.length - 1] = {
                    ...last,
                    content: merged,
                    tokenCount: estimateTokens(merged),
                };
            } else {
                results.push({
                    content: text,
                    tokenCount: estimateTokens(text),
                    isParent: false,
                    childIndices: [],
                    parentIndex: null,
                    overlapBefore: '',
                    overlapAfter: '',
                    sourceHeader: chunk.sourceHeader,
                });
            }
        }

        return results;
    }

    // ----------------------------------------------------------
    // Phase 3: Size Normalization + Parent-Child Hierarchy
    // ----------------------------------------------------------

    private normalizeAndHierarchy(chunks: ChunkResult[]): ChunkResult[] {
        const results: ChunkResult[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            // Add overlap from neighboring chunks
            const overlapSize = Math.floor(
                chunk.content.length * this.config.overlapRatio
            );

            let overlapBefore = '';
            if (i > 0) {
                const prev = chunks[i - 1].content;
                overlapBefore = prev.slice(Math.max(0, prev.length - overlapSize));
            }

            let overlapAfter = '';
            if (i < chunks.length - 1) {
                const next = chunks[i + 1].content;
                overlapAfter = next.slice(0, overlapSize);
            }

            // Create child chunk (precise, for search)
            const childChunk: ChunkResult = {
                ...chunk,
                overlapBefore,
                overlapAfter,
            };

            results.push(childChunk);

            // If chunk is large enough, also create a parent chunk
            // that includes overlap context (for LLM consumption)
            if (chunk.content.length > this.config.minChunkSize * 2) {
                const parentContent = [
                    overlapBefore ? `[context before] ${overlapBefore}` : '',
                    chunk.content,
                    overlapAfter ? `[context after] ${overlapAfter}` : '',
                ]
                    .filter(Boolean)
                    .join('\n\n');

                const parentChunk: ChunkResult = {
                    content: parentContent,
                    tokenCount: estimateTokens(parentContent),
                    isParent: true,
                    childIndices: [results.length - 1],
                    parentIndex: null,
                    overlapBefore: '',
                    overlapAfter: '',
                    sourceHeader: chunk.sourceHeader,
                };

                // Link child to parent
                childChunk.parentIndex = results.length;
                results.push(parentChunk);
            }
        }

        return results;
    }

    // ----------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------

    private splitIntoParagraphs(text: string): string[] {
        // Split by double newlines (paragraphs) or markdown separators
        const raw = text.split(/\n{2,}|(?=^[-*]\s)/m);
        return raw
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
    }

    /**
     * Split text into sentences. Handles Thai and English.
     */
    splitIntoSentences(text: string): string[] {
        // Split on period+space, newline, Thai full stop (。), etc.
        const raw = text.split(/(?<=[.!?。\n])\s+/);
        return raw.filter((s) => s.trim().length > 0);
    }
}
