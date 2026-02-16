// ============================================================
// OpenClaw Memory System — Token Budget Manager
// ============================================================
// Controls context size to stay within LLM token limits.

import { MemoryChunk, RetrievalResult, TokenBudget } from '../types';
import { estimateTokens } from '../utils/tokenizer';
import { TOKEN_PRESETS } from '../config';
import { logger } from '../utils/logger';

export class TokenBudgetManager {
    private defaultBudget: number;

    constructor(defaultBudget = 4000) {
        this.defaultBudget = defaultBudget;
    }

    /**
     * Create a budget from a preset name.
     */
    fromPreset(preset: keyof typeof TOKEN_PRESETS): TokenBudget {
        const p = TOKEN_PRESETS[preset];
        return {
            ...p,
            availableForContext: p.maxTokens - p.reservedForSystem - p.reservedForResponse,
        };
    }

    /**
     * Create a custom budget.
     */
    createBudget(maxTokens?: number): TokenBudget {
        const total = maxTokens ?? this.defaultBudget;
        return {
            maxTokens: total,
            reservedForSystem: 500,
            reservedForResponse: Math.floor(total * 0.3),
            availableForContext: Math.floor(total * 0.7) - 500,
        };
    }

    /**
     * Allocate retrieval results within the token budget.
     *
     * Strategy:
     * 1. Sort by combined relevance × importance × recency
     * 2. Greedily fill until budget exhausted
     * 3. For remaining chunks, include only headers (progressive detail)
     */
    allocate(
        results: RetrievalResult[],
        budget: TokenBudget
    ): {
        included: RetrievalResult[];
        headerOnly: RetrievalResult[];
        totalTokens: number;
        budgetUsed: number;
    } {
        const available = budget.availableForContext;
        if (available <= 0) {
            return { included: [], headerOnly: [], totalTokens: 0, budgetUsed: 0 };
        }

        // Score each result by combined metric
        const scored = results.map((r) => ({
            ...r,
            combinedScore: this.computeAllocationScore(r),
        }));

        // Sort by combined score (descending)
        scored.sort((a, b) => b.combinedScore - a.combinedScore);

        const included: RetrievalResult[] = [];
        const headerOnly: RetrievalResult[] = [];
        let usedTokens = 0;

        for (const result of scored) {
            const chunkTokens = result.chunk.tokenCount;

            if (usedTokens + chunkTokens <= available) {
                // Full content fits in budget
                included.push(result);
                usedTokens += chunkTokens;
            } else {
                // Only include as header (very token-efficient)
                const headerTokens = estimateTokens(
                    result.chunk.semanticHeader ?? result.chunk.content.slice(0, 50)
                );
                if (usedTokens + headerTokens <= available) {
                    headerOnly.push(result);
                    usedTokens += headerTokens;
                }
                // If even header doesn't fit, skip entirely
            }
        }

        logger.debug(
            `Budget: ${usedTokens}/${available} tokens | ${included.length} full + ${headerOnly.length} headers`
        );

        return {
            included,
            headerOnly,
            totalTokens: usedTokens,
            budgetUsed: available > 0 ? usedTokens / available : 0,
        };
    }

    /**
     * Format allocated results as context string for the LLM.
     */
    formatContext(allocation: {
        included: RetrievalResult[];
        headerOnly: RetrievalResult[];
    }): string {
        const sections: string[] = [];

        // Full content chunks
        if (allocation.included.length > 0) {
            sections.push('## Relevant Memories\n');
            for (const r of allocation.included) {
                const header = r.chunk.semanticHeader ?? 'Memory';
                const score = (r.score * 100).toFixed(0);
                sections.push(
                    `### ${header} (relevance: ${score}%)\n${r.chunk.content}\n`
                );
            }
        }

        // Header-only chunks (progressive detail)
        if (allocation.headerOnly.length > 0) {
            sections.push('\n## Also Related (headers only)\n');
            for (const r of allocation.headerOnly) {
                const header = r.chunk.semanticHeader ?? r.chunk.content.slice(0, 60);
                sections.push(`- ${header}`);
            }
            sections.push('');
        }

        return sections.join('\n');
    }

    // ----------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------

    /**
     * Compute allocation priority score.
     * Higher = more likely to be included in context.
     */
    private computeAllocationScore(r: RetrievalResult): number {
        // Relevance (from search) — most important
        const relevance = r.score;

        // Importance (from metadata)
        const importance = r.chunk.importanceScore;

        // Recency (decay score as proxy)
        const recency = r.chunk.decayScore;

        // Weighted combination
        return relevance * 0.5 + importance * 0.3 + recency * 0.2;
    }
}
