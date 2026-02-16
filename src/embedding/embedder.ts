// ============================================================
// OpenClaw Memory System — Embedding Engine
// ============================================================
// Handles OpenAI embedding generation with smart caching.

import OpenAI from 'openai';
import { EmbeddingRecord } from '../types';
import { SQLiteStorage } from '../storage/sqlite';
import { hashContent } from '../utils/hasher';
import { logger } from '../utils/logger';

export class EmbeddingEngine {
    private client: OpenAI;
    private model: string;
    private dimensions: number;
    private storage: SQLiteStorage;

    // In-memory cache for hot embeddings (avoids DB reads)
    private hotCache = new Map<string, Float32Array>();
    private cacheHits = 0;
    private cacheMisses = 0;

    constructor(
        apiKey: string,
        model: string,
        dimensions: number,
        storage: SQLiteStorage
    ) {
        this.client = new OpenAI({ apiKey });
        this.model = model;
        this.dimensions = dimensions;
        this.storage = storage;
    }

    // ----------------------------------------------------------
    // Single Embedding
    // ----------------------------------------------------------

    /** Get or create embedding for a memory chunk */
    async getEmbedding(chunkId: string, content: string): Promise<Float32Array> {
        // Check hot cache first
        const cached = this.hotCache.get(chunkId);
        if (cached) {
            this.cacheHits++;
            return cached;
        }

        // Check DB cache
        if (this.storage.isEmbeddingFresh(chunkId, content)) {
            const record = this.storage.getEmbedding(chunkId);
            if (record) {
                this.hotCache.set(chunkId, record.embedding);
                this.cacheHits++;
                return record.embedding;
            }
        }

        // Generate new embedding
        this.cacheMisses++;
        const embedding = await this.generateEmbedding(content);

        // Store in DB + hot cache
        const record: EmbeddingRecord = {
            chunkId,
            embedding,
            model: this.model,
            contentHash: hashContent(content),
            createdAt: new Date().toISOString(),
        };
        this.storage.upsertEmbedding(record);
        this.hotCache.set(chunkId, embedding);

        return embedding;
    }

    // ----------------------------------------------------------
    // Batch Embedding
    // ----------------------------------------------------------

    /** Generate embeddings for multiple chunks at once (reduces API calls) */
    async batchEmbed(
        items: { chunkId: string; content: string }[]
    ): Promise<Map<string, Float32Array>> {
        const results = new Map<string, Float32Array>();
        const needsGeneration: { chunkId: string; content: string; index: number }[] =
            [];

        // Check caches first
        for (let i = 0; i < items.length; i++) {
            const { chunkId, content } = items[i];

            // Hot cache
            const cached = this.hotCache.get(chunkId);
            if (cached) {
                results.set(chunkId, cached);
                this.cacheHits++;
                continue;
            }

            // DB cache
            if (this.storage.isEmbeddingFresh(chunkId, content)) {
                const record = this.storage.getEmbedding(chunkId);
                if (record) {
                    results.set(chunkId, record.embedding);
                    this.hotCache.set(chunkId, record.embedding);
                    this.cacheHits++;
                    continue;
                }
            }

            needsGeneration.push({ chunkId, content, index: i });
        }

        if (needsGeneration.length === 0) return results;

        logger.info(
            `Generating ${needsGeneration.length} embeddings (${results.size} cache hits)`
        );

        // Batch API call — OpenAI supports up to 2048 inputs per call
        const batchSize = 100; // stay well under limit
        for (let i = 0; i < needsGeneration.length; i += batchSize) {
            const batch = needsGeneration.slice(i, i + batchSize);
            const texts = batch.map((b) => b.content);

            const response = await this.client.embeddings.create({
                model: this.model,
                input: texts,
                dimensions: this.dimensions,
            });

            for (let j = 0; j < batch.length; j++) {
                const { chunkId, content } = batch[j];
                const embedding = new Float32Array(response.data[j].embedding);

                // Store in DB + hot cache
                const record: EmbeddingRecord = {
                    chunkId,
                    embedding,
                    model: this.model,
                    contentHash: hashContent(content),
                    createdAt: new Date().toISOString(),
                };
                this.storage.upsertEmbedding(record);
                this.hotCache.set(chunkId, embedding);
                results.set(chunkId, embedding);
                this.cacheMisses++;
            }
        }

        return results;
    }

    // ----------------------------------------------------------
    // Query Embedding (not cached in DB)
    // ----------------------------------------------------------

    /** Generate embedding for a search query */
    async embedQuery(query: string): Promise<Float32Array> {
        return this.generateEmbedding(query);
    }

    // ----------------------------------------------------------
    // Internals
    // ----------------------------------------------------------

    private async generateEmbedding(text: string): Promise<Float32Array> {
        // Truncate if too long (8191 tokens max for text-embedding-3)
        const truncated = text.slice(0, 30000); // rough char limit

        const response = await this.client.embeddings.create({
            model: this.model,
            input: truncated,
            dimensions: this.dimensions,
        });

        return new Float32Array(response.data[0].embedding);
    }

    // ----------------------------------------------------------
    // Stats
    // ----------------------------------------------------------

    getCacheStats(): { hits: number; misses: number; hitRate: number } {
        const total = this.cacheHits + this.cacheMisses;
        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: total > 0 ? this.cacheHits / total : 0,
        };
    }

    clearHotCache(): void {
        this.hotCache.clear();
    }
}
