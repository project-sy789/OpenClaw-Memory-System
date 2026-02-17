// ============================================================
// OpenClaw Memory System — Hybrid Search Engine
// ============================================================
// Combines Vector Search + BM25 Keyword + Knowledge Graph.
// Supports 3 modes: 'hybrid' (embedding), 'brain' (LLM), 'auto'.

import { SQLiteStorage } from '../storage/sqlite';
import { EmbeddingEngine } from '../embedding/embedder';
import { topKSimilar, normalizeScore } from '../embedding/similarity';
import { MemoryChunk, MemoryTier, RetrievalResult, RecallOptions, AIProvider, SearchMode } from '../types';
import { RETRIEVAL_CONFIG } from '../config';
import { BrainSearch } from './brain-search';
import { hashContent } from '../utils/hasher';
import { logger } from '../utils/logger';

export class HybridSearch {
    private storage: SQLiteStorage;
    private embedder: EmbeddingEngine;
    private brainSearch: BrainSearch | null = null;
    private defaultSearchMode: SearchMode;

    constructor(
        storage: SQLiteStorage,
        embedder: EmbeddingEngine,
        provider?: AIProvider,
        searchMode: SearchMode = 'auto'
    ) {
        this.storage = storage;
        this.embedder = embedder;
        this.defaultSearchMode = searchMode;

        if (provider) {
            this.brainSearch = new BrainSearch(storage, provider);
        }
    }

    /**
     * Main search method — fuses results from multiple search strategies.
     * Supports 3 modes:
     * - 'hybrid': Vector + BM25 + Graph (requires embeddings)
     * - 'brain': BM25 + LLM relevance judging (no embeddings needed)
     * - 'auto': tries hybrid, falls back to brain on embedding errors
     */
    async search(
        query: string,
        options: RecallOptions = {}
    ): Promise<RetrievalResult[]> {
        const mode = options.searchMode ?? this.defaultSearchMode;
        const topK = options.topK ?? RETRIEVAL_CONFIG.defaultTopK;
        const minRelevance = options.minRelevance ?? RETRIEVAL_CONFIG.minRelevanceScore;

        // Check semantic cache first (works for all modes)
        const queryHash = hashContent(query);
        const cached = this.storage.getSemanticCache(queryHash);
        if (cached) {
            logger.debug(`Semantic cache hit for query: "${query.slice(0, 50)}..."`);
            const results: RetrievalResult[] = [];
            for (let i = 0; i < cached.chunkIds.length; i++) {
                const chunk = this.storage.getChunk(cached.chunkIds[i]);
                if (!chunk) continue;
                results.push({
                    chunk,
                    score: cached.scores[i],
                    vectorScore: cached.scores[i],
                    keywordScore: 0,
                    graphScore: 0,
                    brainScore: 0,
                    source: 'fused',
                });
            }
            return results;
        }

        // Route to the appropriate search mode
        let results: RetrievalResult[];
        let modeUsed: string;

        if (mode === 'brain') {
            results = await this.brainModeSearch(query, options);
            modeUsed = 'brain';
        } else if (mode === 'auto') {
            try {
                results = await this.hybridModeSearch(query, options);
                modeUsed = 'hybrid';
            } catch (error: any) {
                // Check if it's a rate-limit or embedding error
                const isRateLimit = error.message?.includes('rate') ||
                    error.message?.includes('429') ||
                    error.message?.includes('limit') ||
                    error.message?.includes('quota');

                if (isRateLimit && this.brainSearch) {
                    logger.warn(`⚡ Auto mode: embedding rate-limited, falling back to brain search`);
                    results = await this.brainModeSearch(query, options);
                    modeUsed = 'brain-fallback';
                } else {
                    throw error;
                }
            }
        } else {
            results = await this.hybridModeSearch(query, options);
            modeUsed = 'hybrid';
        }

        // Filter by minimum relevance
        const filtered = results.filter((r) => r.score >= minRelevance);

        // Touch accessed chunks
        for (const r of filtered) {
            this.storage.touchChunk(r.chunk.id);
        }

        // Cache results (only for hybrid mode with embeddings)
        if (modeUsed === 'hybrid') {
            try {
                const queryEmbedding = await this.embedder.embedQuery(query);
                this.storage.setSemanticCache(
                    queryHash,
                    queryEmbedding,
                    filtered.map((r) => r.chunk.id),
                    filtered.map((r) => r.score)
                );
            } catch {
                // Don't fail the whole search if caching fails
            }
        }

        // Log retrieval for meta-memory
        this.storage.logRetrieval({
            query,
            chunksRetrieved: filtered.map((r) => r.chunk.id),
            relevanceScores: filtered.map((r) => r.score),
            wasUseful: null,
        });

        logger.info(
            `Search "${query.slice(0, 40)}..." → ${filtered.length} results (mode: ${modeUsed})`
        );

        return filtered;
    }

    /** Get the search mode used */
    get searchMode(): SearchMode {
        return this.defaultSearchMode;
    }

    // ----------------------------------------------------------
    // Search Modes
    // ----------------------------------------------------------

    private async hybridModeSearch(
        query: string,
        options: RecallOptions
    ): Promise<RetrievalResult[]> {
        const topK = options.topK ?? RETRIEVAL_CONFIG.defaultTopK;

        // 1. Vector Search — semantic similarity
        const vectorResults = await this.vectorSearch(query, topK, options);

        // 2. BM25 Keyword Search — exact keyword matching
        const keywordResults = this.keywordSearch(query, topK, options);

        // 3. Knowledge Graph Traversal
        const graphResults = this.graphSearch(vectorResults, options);

        // 4. Reciprocal Rank Fusion
        return this.reciprocalRankFusion(
            [
                { results: vectorResults, weight: RETRIEVAL_CONFIG.vectorWeight },
                { results: keywordResults, weight: RETRIEVAL_CONFIG.keywordWeight },
                { results: graphResults, weight: RETRIEVAL_CONFIG.graphWeight },
            ],
            topK
        );
    }

    private async brainModeSearch(
        query: string,
        options: RecallOptions
    ): Promise<RetrievalResult[]> {
        if (!this.brainSearch) {
            logger.warn('Brain search requested but no AI provider available — falling back to keyword-only');
            return this.keywordSearch(query, options.topK ?? RETRIEVAL_CONFIG.defaultTopK, options);
        }

        return this.brainSearch.search(query, options);
    }

    // ----------------------------------------------------------
    // Search Strategies
    // ----------------------------------------------------------

    private async vectorSearch(
        query: string,
        topK: number,
        options: RecallOptions
    ): Promise<RetrievalResult[]> {
        const queryEmbedding = await this.embedder.embedQuery(query);

        // Get all embeddings
        const allEmbeddings = this.storage.getAllEmbeddings();
        if (allEmbeddings.length === 0) return [];

        // Filter by tiers if specified
        const tierFilter = options.tiers;
        let candidates = allEmbeddings;
        if (tierFilter) {
            const chunkTiers = new Map<string, MemoryTier>();
            for (const e of allEmbeddings) {
                const chunk = this.storage.getChunk(e.chunkId);
                if (chunk) chunkTiers.set(e.chunkId, chunk.tier);
            }
            candidates = candidates.filter(
                (e) => chunkTiers.has(e.chunkId) && tierFilter.includes(chunkTiers.get(e.chunkId)!)
            );
        }

        // Find top-K similar
        const similar = topKSimilar(
            queryEmbedding,
            candidates.map((e) => ({ id: e.chunkId, embedding: e.embedding })),
            topK
        );

        const vectorResults: RetrievalResult[] = [];
        for (const s of similar) {
            const chunk = this.storage.getChunk(s.id);
            if (!chunk) continue;
            if (!options.includeDecayed && chunk.decayScore < 0.01) continue;
            vectorResults.push({
                chunk,
                score: s.score,
                vectorScore: s.score,
                keywordScore: 0,
                graphScore: 0,
                brainScore: 0,
                source: 'vector',
            });
        }
        return vectorResults;
    }

    private keywordSearch(
        query: string,
        topK: number,
        options: RecallOptions
    ): RetrievalResult[] {
        const ftsResults = this.storage.fullTextSearch(query, topK);

        // Normalize BM25 ranks to 0-1 range
        if (ftsResults.length === 0) return [];

        const ranks = ftsResults.map((r) => Math.abs(r.rank));
        const minRank = Math.min(...ranks);
        const maxRank = Math.max(...ranks);

        const kwResults: RetrievalResult[] = [];
        for (const r of ftsResults) {
            const chunk = this.storage.getChunk(r.chunkId);
            if (!chunk) continue;
            if (!options.includeDecayed && chunk.decayScore < 0.01) continue;
            if (options.tiers && !options.tiers.includes(chunk.tier)) continue;

            const normalizedScore = normalizeScore(
                Math.abs(r.rank),
                minRank,
                maxRank
            );

            kwResults.push({
                chunk,
                score: normalizedScore,
                vectorScore: 0,
                keywordScore: normalizedScore,
                graphScore: 0,
                brainScore: 0,
                source: 'keyword',
            });
        }
        return kwResults;
    }

    private graphSearch(
        seedResults: RetrievalResult[],
        options: RecallOptions
    ): RetrievalResult[] {
        if (seedResults.length === 0) return [];

        // Use top vector results as seeds for graph traversal
        const seeds = seedResults.slice(0, 5);
        const seenIds = new Set(seedResults.map((r) => r.chunk.id));
        const graphResults: RetrievalResult[] = [];

        for (const seed of seeds) {
            const relatedIds = this.storage.getRelatedChunks(seed.chunk.id, 2);
            for (const relId of relatedIds) {
                if (seenIds.has(relId)) continue;
                seenIds.add(relId);

                const chunk = this.storage.getChunk(relId);
                if (!chunk) continue;
                if (!options.includeDecayed && chunk.decayScore < 0.01) continue;
                if (options.tiers && !options.tiers.includes(chunk.tier)) continue;

                // Graph score decays with distance from seed
                const edges = this.storage.getEdgesFrom(seed.chunk.id);
                const edge = edges.find(
                    (e) => e.toChunkId === relId
                );
                const graphScore = edge ? edge.weight * seed.score : seed.score * 0.5;

                graphResults.push({
                    chunk,
                    score: graphScore,
                    vectorScore: 0,
                    keywordScore: 0,
                    graphScore,
                    brainScore: 0,
                    source: 'graph' as const,
                });
            }
        }

        return graphResults;
    }

    // ----------------------------------------------------------
    // Reciprocal Rank Fusion
    // ----------------------------------------------------------

    private reciprocalRankFusion(
        sources: { results: RetrievalResult[]; weight: number }[],
        topK: number
    ): RetrievalResult[] {
        const k = RETRIEVAL_CONFIG.rrfK;
        const fusedScores = new Map<
            string,
            {
                chunk: MemoryChunk;
                score: number;
                vectorScore: number;
                keywordScore: number;
                graphScore: number;
                brainScore: number;
            }
        >();

        for (const { results, weight } of sources) {
            for (let rank = 0; rank < results.length; rank++) {
                const r = results[rank];
                const rrfScore = weight * (1 / (k + rank + 1));

                const existing = fusedScores.get(r.chunk.id);
                if (existing) {
                    existing.score += rrfScore;
                    existing.vectorScore = Math.max(existing.vectorScore, r.vectorScore);
                    existing.keywordScore = Math.max(existing.keywordScore, r.keywordScore);
                    existing.graphScore = Math.max(existing.graphScore, r.graphScore);
                    existing.brainScore = Math.max(existing.brainScore, r.brainScore);
                } else {
                    fusedScores.set(r.chunk.id, {
                        chunk: r.chunk,
                        score: rrfScore,
                        vectorScore: r.vectorScore,
                        keywordScore: r.keywordScore,
                        graphScore: r.graphScore,
                        brainScore: r.brainScore,
                    });
                }
            }
        }

        // Normalize scores
        const allScores = [...fusedScores.values()];
        if (allScores.length === 0) return [];
        const maxScore = Math.max(...allScores.map((r) => r.score));

        return allScores
            .map((r) => ({
                ...r,
                score: maxScore > 0 ? r.score / maxScore : 0,
                source: 'fused' as const,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }
}
