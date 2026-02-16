// ============================================================
// OpenClaw Memory System — Semantic Memory (Tier 3)
// ============================================================
// Vector-indexed factual knowledge with knowledge graph.

import { SQLiteStorage } from '../storage/sqlite';
import { EmbeddingEngine } from '../embedding/embedder';
import { SmartChunker, ChunkResult } from '../chunking/smart-chunker';
import { HeaderInjector } from '../chunking/header-injector';
import { MemoryChunk, MemoryTier, MemoryInput, KnowledgeEdge } from '../types';
import { logger } from '../utils/logger';

export class SemanticMemory {
    private storage: SQLiteStorage;
    private embedder: EmbeddingEngine;
    private chunker: SmartChunker;
    private headerInjector: HeaderInjector;

    constructor(
        storage: SQLiteStorage,
        embedder: EmbeddingEngine,
        chunker: SmartChunker,
        headerInjector: HeaderInjector
    ) {
        this.storage = storage;
        this.embedder = embedder;
        this.chunker = chunker;
        this.headerInjector = headerInjector;
    }

    // ----------------------------------------------------------
    // Store Knowledge
    // ----------------------------------------------------------

    /** Store a piece of knowledge — chunks, injects headers, and embeds automatically */
    async store(input: MemoryInput): Promise<MemoryChunk[]> {
        // Step 1: Chunk the content
        const chunks = this.chunker.chunk(input.content);
        logger.debug(`Chunked into ${chunks.length} pieces`);

        // Step 2: Generate semantic headers for each chunk
        const headers = await this.headerInjector.injectHeaders(
            chunks.map((c) => ({
                content: c.content,
                sourceHeader: c.sourceHeader,
            }))
        );

        // Step 3: Store chunks with headers
        const storedChunks: MemoryChunk[] = [];
        const parentMap = new Map<number, string>(); // chunkIndex → chunkId

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const header = headers[i];

            // Combine header with content for embedding
            const contentWithHeader = this.headerInjector.formatChunkWithHeader(
                header,
                chunk.content
            );

            const stored = this.storage.insertChunk({
                content: chunk.content,
                tier: MemoryTier.Semantic,
                tags: input.tags ?? [],
                importanceScore: input.importanceScore ?? 0.5,
                sourceFile: input.sourceFile ?? '',
                parentChunkId: chunk.parentIndex !== null
                    ? parentMap.get(chunk.parentIndex) ?? undefined
                    : undefined,
            });

            // Update with semantic header
            this.storage.updateChunk(stored.id, {
                semanticHeader: header,
            });

            parentMap.set(i, stored.id);
            storedChunks.push({ ...stored, semanticHeader: header });
        }

        // Step 4: Generate embeddings
        const embedItems = storedChunks.map((c) => ({
            chunkId: c.id,
            content: this.headerInjector.formatChunkWithHeader(
                c.semanticHeader ?? '',
                c.content
            ),
        }));
        await this.embedder.batchEmbed(embedItems);

        logger.info(
            `Stored ${storedChunks.length} semantic chunks (${embedItems.length} embeddings generated)`
        );
        return storedChunks;
    }

    /**
     * Store a single fact (no chunking needed).
     * Use for structured knowledge items.
     */
    async storeFact(
        fact: string,
        tags: string[] = [],
        importance = 0.7
    ): Promise<MemoryChunk> {
        const header = await this.headerInjector.generateHeader(fact);
        const chunk = this.storage.insertChunk({
            content: fact,
            tier: MemoryTier.Semantic,
            tags,
            importanceScore: importance,
        });

        this.storage.updateChunk(chunk.id, { semanticHeader: header });

        // Embed with header
        const contentWithHeader = this.headerInjector.formatChunkWithHeader(
            header,
            fact
        );
        await this.embedder.getEmbedding(chunk.id, contentWithHeader);

        return { ...chunk, semanticHeader: header };
    }

    // ----------------------------------------------------------
    // Knowledge Graph Operations
    // ----------------------------------------------------------

    /** Add a relationship between two memory chunks */
    addRelation(
        fromId: string,
        toId: string,
        relation: string,
        weight = 0.5
    ): void {
        this.storage.addEdge({ fromChunkId: fromId, toChunkId: toId, relation, weight });
        logger.debug(`Added edge: ${fromId} -[${relation}]-> ${toId}`);
    }

    /** Auto-detect relationships between new chunk and existing chunks */
    async detectRelations(
        chunkId: string,
        topK = 5,
        minSimilarity = 0.7
    ): Promise<KnowledgeEdge[]> {
        const chunk = this.storage.getChunk(chunkId);
        if (!chunk) return [];

        const contentWithHeader = this.headerInjector.formatChunkWithHeader(
            chunk.semanticHeader ?? '',
            chunk.content
        );

        // Get all embeddings
        const allEmbeddings = this.storage.getAllEmbeddings();
        if (allEmbeddings.length === 0) return [];

        // Get embedding for this chunk
        const queryEmbedding = await this.embedder.getEmbedding(
            chunkId,
            contentWithHeader
        );

        // Import similarity function
        const { topKSimilar } = await import('../embedding/similarity');
        const similar = topKSimilar(
            queryEmbedding,
            allEmbeddings
                .filter((e) => e.chunkId !== chunkId)
                .map((e) => ({ id: e.chunkId, embedding: e.embedding })),
            topK
        );

        const edges: KnowledgeEdge[] = [];
        for (const s of similar) {
            if (s.score >= minSimilarity) {
                this.storage.addEdge({
                    fromChunkId: chunkId,
                    toChunkId: s.id,
                    relation: 'related_to',
                    weight: s.score,
                });
                edges.push({
                    fromChunkId: chunkId,
                    toChunkId: s.id,
                    relation: 'related_to',
                    weight: s.score,
                    createdAt: new Date().toISOString(),
                });
            }
        }

        return edges;
    }

    // ----------------------------------------------------------
    // Retrieval
    // ----------------------------------------------------------

    /** Get all active semantic chunks */
    getAll(): MemoryChunk[] {
        return this.storage.getChunksByTier(MemoryTier.Semantic, 1000);
    }

    /** Get chunks related to a specific chunk via knowledge graph */
    getRelated(chunkId: string, depth = 1): MemoryChunk[] {
        const relatedIds = this.storage.getRelatedChunks(chunkId, depth);
        return relatedIds
            .map((id) => this.storage.getChunk(id))
            .filter((c): c is MemoryChunk => c !== null);
    }
}
