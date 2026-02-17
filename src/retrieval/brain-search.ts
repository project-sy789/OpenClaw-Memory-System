// ============================================================
// OpenClaw Memory System — Brain-Powered Search
// ============================================================
// Uses the AI's own "brain" (chat API) to judge memory relevance
// instead of vector embeddings. This eliminates embedding API
// rate limits entirely.
//
// Flow:
// 1. Retrieve candidate chunks via BM25 keyword search
// 2. Send candidates + query to LLM → get relevance scores
// 3. Merge with BM25 scores using RRF fusion

import { SQLiteStorage } from '../storage/sqlite';
import { MemoryChunk, RetrievalResult, RecallOptions, AIProvider } from '../types';
import { logger } from '../utils/logger';

export interface BrainSearchConfig {
    /** Maximum candidates to send to the brain per batch */
    batchSize: number;
    /** Maximum total candidates to evaluate */
    maxCandidates: number;
    /** Minimum relevance score (0-1) to include in results */
    minRelevance: number;
}

export const DEFAULT_BRAIN_CONFIG: BrainSearchConfig = {
    batchSize: 10,
    maxCandidates: 30,
    minRelevance: 0.2,
};

interface BrainJudgment {
    id: string;
    relevance: number;
    reason: string;
}

export class BrainSearch {
    private storage: SQLiteStorage;
    private provider: AIProvider;
    private config: BrainSearchConfig;

    constructor(
        storage: SQLiteStorage,
        provider: AIProvider,
        config: Partial<BrainSearchConfig> = {}
    ) {
        this.storage = storage;
        this.provider = provider;
        this.config = { ...DEFAULT_BRAIN_CONFIG, ...config };
    }

    // ----------------------------------------------------------
    // Main Search
    // ----------------------------------------------------------

    /**
     * Brain-powered search: uses BM25 for candidate retrieval,
     * then LLM to judge relevance of each candidate to the query.
     */
    async search(
        query: string,
        options: RecallOptions = {}
    ): Promise<RetrievalResult[]> {
        const topK = options.topK ?? 10;

        // Step 1: Get candidates via BM25 keyword search
        logger.info(`🧠 Brain Search: retrieving candidates for "${query.slice(0, 50)}..."`);
        const candidates = this.getCandidates(query, options);

        if (candidates.length === 0) {
            logger.info('🧠 Brain Search: no candidates found via keyword search');
            return [];
        }

        logger.info(`🧠 Brain Search: ${candidates.length} candidates → sending to brain for judgment`);

        // Step 2: Ask the brain to judge relevance
        const judgments = await this.judgeRelevance(query, candidates);

        // Step 3: Build results with brain scores
        const results: RetrievalResult[] = [];
        for (const judgment of judgments) {
            if (judgment.relevance < this.config.minRelevance) continue;

            const chunk = candidates.find(c => c.id === judgment.id);
            if (!chunk) continue;

            results.push({
                chunk,
                score: judgment.relevance,
                vectorScore: 0,
                keywordScore: 0,
                graphScore: 0,
                brainScore: judgment.relevance,
                source: 'brain' as any,
            });

            // Touch the chunk to boost its decay score
            this.storage.touchChunk(chunk.id);
        }

        // Sort by relevance and take topK
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    // ----------------------------------------------------------
    // Candidate Retrieval
    // ----------------------------------------------------------

    private getCandidates(query: string, options: RecallOptions): MemoryChunk[] {
        // Use BM25 full-text search as the primary candidate source
        const ftsResults = this.storage.fullTextSearch(query, this.config.maxCandidates);
        const candidateIds = new Set<string>();
        const candidates: MemoryChunk[] = [];

        for (const fts of ftsResults) {
            if (candidateIds.has(fts.chunkId)) continue;
            const chunk = this.storage.getChunk(fts.chunkId);
            if (!chunk) continue;

            // Apply tier filter
            if (options.tiers && !options.tiers.includes(chunk.tier)) continue;

            // Apply tag filter
            if (options.tags && options.tags.length > 0) {
                const hasTag = options.tags.some(t => chunk.tags.includes(t));
                if (!hasTag) continue;
            }

            candidateIds.add(fts.chunkId);
            candidates.push(chunk);
        }

        // If BM25 returned too few, supplement with recent high-importance chunks
        if (candidates.length < 5) {
            const allChunks = this.storage.getAllActiveChunks();
            for (const chunk of allChunks) {
                if (candidateIds.has(chunk.id)) continue;
                if (options.tiers && !options.tiers.includes(chunk.tier)) continue;
                if (candidates.length >= this.config.maxCandidates) break;

                candidateIds.add(chunk.id);
                candidates.push(chunk);
            }
        }

        return candidates;
    }

    // ----------------------------------------------------------
    // LLM Relevance Judgment
    // ----------------------------------------------------------

    private async judgeRelevance(
        query: string,
        candidates: MemoryChunk[]
    ): Promise<BrainJudgment[]> {
        const allJudgments: BrainJudgment[] = [];

        // Process in batches
        for (let i = 0; i < candidates.length; i += this.config.batchSize) {
            const batch = candidates.slice(i, i + this.config.batchSize);

            try {
                const judgments = await this.judgeBatch(query, batch);
                allJudgments.push(...judgments);
            } catch (error: any) {
                logger.warn(`🧠 Brain Search batch ${i / this.config.batchSize + 1} failed: ${error.message}`);
                // Fallback: assign default scores based on position
                for (const chunk of batch) {
                    allJudgments.push({
                        id: chunk.id,
                        relevance: 0.3, // neutral fallback
                        reason: 'Fallback score (brain unavailable)',
                    });
                }
            }
        }

        return allJudgments;
    }

    private async judgeBatch(
        query: string,
        candidates: MemoryChunk[]
    ): Promise<BrainJudgment[]> {
        // Build the prompt
        const candidateList = candidates.map((c, i) => {
            const preview = c.content.length > 300
                ? c.content.slice(0, 300) + '...'
                : c.content;
            const header = c.semanticHeader ? `[${c.semanticHeader}] ` : '';
            return `[${i + 1}] ID: ${c.id}\n${header}${preview}`;
        }).join('\n\n');

        const messages = [
            {
                role: 'system',
                content: `You are a memory relevance judge. Given a query and a list of memory candidates, score each candidate's relevance from 0.0 to 1.0.

Respond ONLY with a JSON array. Each element must have:
- "index": the candidate number (1-based)
- "relevance": a float from 0.0 to 1.0
- "reason": a brief explanation (max 20 words)

Example response:
[{"index":1,"relevance":0.9,"reason":"Directly answers the query"},{"index":2,"relevance":0.2,"reason":"Tangentially related"}]`
            },
            {
                role: 'user',
                content: `**Query:** ${query}

**Candidates:**
${candidateList}

Score each candidate's relevance to the query. Respond with JSON array only.`
            }
        ];

        const response = await this.provider.chat(messages, {
            temperature: 0.1,
            max_tokens: 1000,
        });

        // Parse the response
        return this.parseJudgments(response, candidates);
    }

    private parseJudgments(
        response: string,
        candidates: MemoryChunk[]
    ): BrainJudgment[] {
        try {
            // Extract JSON from response (handle markdown code blocks)
            let jsonStr = response.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
            }

            const parsed = JSON.parse(jsonStr) as {
                index: number;
                relevance: number;
                reason: string;
            }[];

            return parsed.map(item => {
                const candidate = candidates[item.index - 1];
                if (!candidate) return null;
                return {
                    id: candidate.id,
                    relevance: Math.max(0, Math.min(1, item.relevance)),
                    reason: item.reason ?? '',
                };
            }).filter((j): j is BrainJudgment => j !== null);
        } catch (error) {
            logger.warn(`🧠 Brain Search: failed to parse LLM response — ${error}`);
            // Fallback: assign descending scores
            return candidates.map((c, i) => ({
                id: c.id,
                relevance: Math.max(0.1, 0.5 - i * 0.05),
                reason: 'Fallback score (parse error)',
            }));
        }
    }
}
