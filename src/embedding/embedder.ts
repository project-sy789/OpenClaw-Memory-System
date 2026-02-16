// ============================================================
// OpenClaw Memory System — Embedding Engine
// ============================================================
// Handles OpenAI embedding generation with smart caching.

import { EmbeddingRecord, AIProvider } from '../types';
import { SQLiteStorage } from '../storage/sqlite';
import { hashContent } from '../utils/hasher';
import { logger } from '../utils/logger';

export class EmbeddingEngine {
    private provider: AIProvider;
    private model: string;
    private dimensions: number;
    private storage: SQLiteStorage;

    // In-memory cache for hot embeddings (avoids DB reads)
    private hotCache = new Map<string, Float32Array>();
    private cacheHits = 0;
    private cacheMisses = 0;

    constructor(
        provider: AIProvider,
        model: string,
        dimensions: number,
        storage: SQLiteStorage
    ) {
        this.provider = provider;
        this.model = model;
        this.dimensions = dimensions;
        this.storage = storage;
        this.maxRetries = 3; // Default
        this.retryDelay = 1000; // Default
        this.batchSize = 50; // Default
    }

    configure(maxRetries: number, retryDelay: number, batchSize: number) {
        this.maxRetries = maxRetries;
        this.retryDelay = retryDelay;
        this.batchSize = batchSize;
    }

    private maxRetries: number;
    private retryDelay: number;
    private batchSize: number;

    /**
     * Exponential backoff retry wrapper
     */
    private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: any;
        for (let i = 0; i <= this.maxRetries; i++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;
                // Only retry on 429 (Rate Limit) or 5xx (Server Error)
                const status = error?.status || error?.response?.status;
                if (status !== 429 && (!status || status < 500)) {
                    throw error;
                }

                if (i === this.maxRetries) break;

                // Exponential backoff + jitter (±20%)
                const baseDelay = this.retryDelay * Math.pow(2, i);
                const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
                const delay = Math.max(0, baseDelay + jitter);

                logger.warn(`API Error ${status}. Retrying in ${Math.round(delay)}ms (attempt ${i + 1}/${this.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
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

        // Batch call to host provider
        const batchSize = this.batchSize;
        for (let i = 0; i < needsGeneration.length; i += batchSize) {
            const batch = needsGeneration.slice(i, i + batchSize);
            const texts = batch.map((b) => b.content);

            const embeddings = await this.withRetry(() => this.provider.embed(texts));

            for (let j = 0; j < batch.length; j++) {
                const { chunkId, content } = batch[j];
                const embedding = new Float32Array(embeddings[j]);

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

    /**
     * Internal embedding generation via delegating to the host's AI Provider.
     */
    private async generateEmbedding(text: string): Promise<Float32Array> {
        // Truncate if too long (optional safety measure)
        const truncated = text.slice(0, 30000);

        const results = await this.withRetry(() => this.provider.embed([truncated]));

        if (!results || results.length === 0) {
            throw new Error('AI Provider failed to generate embedding');
        }

        return new Float32Array(results[0]);
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
