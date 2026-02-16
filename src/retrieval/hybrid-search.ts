// ============================================================
// OpenClaw Memory System — Hybrid Search Engine
// ============================================================
// Combines Vector Search + BM25 Keyword + Knowledge Graph.

import { SQLiteStorage } from '../storage/sqlite';
import { EmbeddingEngine } from '../embedding/embedder';
import { topKSimilar, normalizeScore } from '../embedding/similarity';
import { MemoryChunk, MemoryTier, RetrievalResult, RecallOptions } from '../types';
import { RETRIEVAL_CONFIG } from '../config';
import { hashContent } from '../utils/hasher';
import { logger } from '../utils/logger';

export class HybridSearch {
    private storage: SQLiteStorage;
    private embedder: EmbeddingEngine;

    constructor(storage: SQLiteStorage, embedder: EmbeddingEngine) {
        this.storage = storage;
        this.embedder = embedder;
    }

    /**
     * Main search method — fuses results from multiple search strategies.
     */
    async search(
        query: string,
        options: RecallOptions = {}
    ): Promise<RetrievalResult[]> {
        const topK = options.topK ?? RETRIEVAL_CONFIG.defaultTopK;
        const minRelevance =
            options.minRelevance ?? RETRIEVAL_CONFIG.minRelevanceScore;

        // Check semantic cache first
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
                    source: 'fused',
                });
            }
            return results;
        }

        // 1. Vector Search — semantic similarity
        const vectorResults = await this.vectorSearch(query, topK, options);

        // 2. BM25 Keyword Search — exact keyword matching
        const keywordResults = this.keywordSearch(query, topK, options);

        // 3. Knowledge Graph Traversal
        const graphResults = this.graphSearch(vectorResults, options);

        // 4. Reciprocal Rank Fusion
        const fused = this.reciprocalRankFusion(
            [
                { results: vectorResults, weight: RETRIEVAL_CONFIG.vectorWeight },
                { results: keywordResults, weight: RETRIEVAL_CONFIG.keywordWeight },
                { results: graphResults, weight: RETRIEVAL_CONFIG.graphWeight },
            ],
            topK
        );

        // 5. Filter by minimum relevance
        const filtered = fused.filter((r) => r.score >= minRelevance);

        // 6. Touch accessed chunks (boost decay score)
        for (const r of filtered) {
            this.storage.touchChunk(r.chunk.id);
        }

        // 7. Cache results
        const queryEmbedding = await this.embedder.embedQuery(query);
        this.storage.setSemanticCache(
            queryHash,
            queryEmbedding,
            filtered.map((r) => r.chunk.id),
            filtered.map((r) => r.score)
        );

        // 8. Log retrieval for meta-memory
        this.storage.logRetrieval({
            query,
            chunksRetrieved: filtered.map((r) => r.chunk.id),
            relevanceScores: filtered.map((r) => r.score),
            wasUseful: null, // will be updated by feedback
        });

        logger.info(
            `Search "${query.slice(0, 40)}..." → ${filtered.length} results (V:${vectorResults.length} K:${keywordResults.length} G:${graphResults.length})`
        );

        return filtered;
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
                } else {
                    fusedScores.set(r.chunk.id, {
                        chunk: r.chunk,
                        score: rrfScore,
                        vectorScore: r.vectorScore,
                        keywordScore: r.keywordScore,
                        graphScore: r.graphScore,
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
