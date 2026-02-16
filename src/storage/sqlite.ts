// ============================================================
// OpenClaw Memory System — SQLite Storage Layer
// ============================================================

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
    MemoryChunk,
    MemoryTier,
    Episode,
    EpisodeInput,
    EmbeddingRecord,
    KnowledgeEdge,
    RetrievalLogEntry,
    MemoryStats,
    MemoryInput,
} from '../types';
import { hashContent } from '../utils/hasher';
import { estimateTokens } from '../utils/tokenizer';
import { logger } from '../utils/logger';

export class SQLiteStorage {
    private db: Database.Database;

    constructor(dbPath: string) {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.initialize();
    }

    // ----------------------------------------------------------
    // Schema Initialization
    // ----------------------------------------------------------

    private initialize(): void {
        this.db.exec(`
      -- Memory chunks with full metadata
      CREATE TABLE IF NOT EXISTS memory_chunks (
        id TEXT PRIMARY KEY,
        tier TEXT NOT NULL,
        source_file TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        semantic_header TEXT,
        token_count INTEGER NOT NULL DEFAULT 0,
        importance_score REAL NOT NULL DEFAULT 0.5,
        access_count INTEGER NOT NULL DEFAULT 0,
        last_accessed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        decay_score REAL NOT NULL DEFAULT 1.0,
        tags TEXT NOT NULL DEFAULT '[]',
        parent_chunk_id TEXT,
        FOREIGN KEY (parent_chunk_id) REFERENCES memory_chunks(id) ON DELETE SET NULL
      );

      -- Vector embeddings cache
      CREATE TABLE IF NOT EXISTS embeddings (
        chunk_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        model TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (chunk_id) REFERENCES memory_chunks(id) ON DELETE CASCADE
      );

      -- Episodic memory (conversation logs)
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        token_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        importance_score REAL NOT NULL DEFAULT 0.5
      );

      -- Knowledge graph edges
      CREATE TABLE IF NOT EXISTS knowledge_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_chunk_id TEXT NOT NULL,
        to_chunk_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 0.5,
        created_at TEXT NOT NULL,
        FOREIGN KEY (from_chunk_id) REFERENCES memory_chunks(id) ON DELETE CASCADE,
        FOREIGN KEY (to_chunk_id) REFERENCES memory_chunks(id) ON DELETE CASCADE,
        UNIQUE(from_chunk_id, to_chunk_id, relation)
      );

      -- Meta memory: retrieval statistics
      CREATE TABLE IF NOT EXISTS retrieval_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        query_embedding BLOB,
        chunks_retrieved TEXT NOT NULL DEFAULT '[]',
        relevance_scores TEXT NOT NULL DEFAULT '[]',
        was_useful INTEGER,
        created_at TEXT NOT NULL
      );

        -- Semantic cache for queries
        CREATE TABLE IF NOT EXISTS semantic_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query_hash TEXT NOT NULL UNIQUE,
          query_embedding BLOB NOT NULL,
          result_chunk_ids TEXT NOT NULL,
          result_scores TEXT NOT NULL,
          hit_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          last_hit_at TEXT
        );

        -- Persistent system configuration
        CREATE TABLE IF NOT EXISTS system_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_chunks_tier ON memory_chunks(tier);
      CREATE INDEX IF NOT EXISTS idx_chunks_decay ON memory_chunks(decay_score);
      CREATE INDEX IF NOT EXISTS idx_chunks_importance ON memory_chunks(importance_score);
      CREATE INDEX IF NOT EXISTS idx_chunks_created ON memory_chunks(created_at);
      CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_created ON episodes(created_at);
      CREATE INDEX IF NOT EXISTS idx_edges_from ON knowledge_edges(from_chunk_id);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON knowledge_edges(to_chunk_id);
      CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON embeddings(content_hash);
    `);

        // FTS5 full-text search index (create separately — can't do IF NOT EXISTS)
        try {
            this.db.exec(`
        CREATE VIRTUAL TABLE memory_fts USING fts5(
          chunk_id,
          content,
          semantic_header,
          tags
        );
      `);
        } catch {
            // Already exists — that's fine
        }

        logger.debug('SQLite schema initialized');
    }

    // ----------------------------------------------------------
    // Memory Chunks CRUD
    // ----------------------------------------------------------

    insertChunk(input: MemoryInput): MemoryChunk {
        const now = new Date().toISOString();
        const id = uuidv4();
        const tokenCount = estimateTokens(input.content);
        const chunk: MemoryChunk = {
            id,
            tier: input.tier ?? MemoryTier.Semantic,
            sourceFile: input.sourceFile ?? '',
            content: input.content,
            semanticHeader: null,
            tokenCount,
            importanceScore: input.importanceScore ?? 0.5,
            accessCount: 0,
            lastAccessedAt: null,
            createdAt: now,
            updatedAt: now,
            decayScore: 1.0,
            tags: input.tags ?? [],
            parentChunkId: input.parentChunkId ?? null,
        };

        this.db
            .prepare(
                `INSERT INTO memory_chunks
         (id, tier, source_file, content, semantic_header, token_count,
          importance_score, access_count, last_accessed_at, created_at,
          updated_at, decay_score, tags, parent_chunk_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                chunk.id,
                chunk.tier,
                chunk.sourceFile,
                chunk.content,
                chunk.semanticHeader,
                chunk.tokenCount,
                chunk.importanceScore,
                chunk.accessCount,
                chunk.lastAccessedAt,
                chunk.createdAt,
                chunk.updatedAt,
                chunk.decayScore,
                JSON.stringify(chunk.tags),
                chunk.parentChunkId
            );

        // Index in FTS
        this.db
            .prepare(
                `INSERT INTO memory_fts (chunk_id, content, semantic_header, tags)
         VALUES (?, ?, ?, ?)`
            )
            .run(id, chunk.content, chunk.semanticHeader ?? '', JSON.stringify(chunk.tags));

        logger.debug(`Inserted chunk ${id} (${chunk.tier}, ${tokenCount} tokens)`);
        return chunk;
    }

    getChunk(id: string): MemoryChunk | null {
        const row = this.db
            .prepare('SELECT * FROM memory_chunks WHERE id = ?')
            .get(id) as Record<string, unknown> | undefined;
        return row ? this.rowToChunk(row) : null;
    }

    getChunksByTier(tier: MemoryTier, limit = 100): MemoryChunk[] {
        const rows = this.db
            .prepare(
                `SELECT * FROM memory_chunks WHERE tier = ? AND decay_score > 0.01
         ORDER BY importance_score DESC, created_at DESC LIMIT ?`
            )
            .all(tier, limit) as Record<string, unknown>[];
        return rows.map((r) => this.rowToChunk(r));
    }

    getAllActiveChunks(): MemoryChunk[] {
        const rows = this.db
            .prepare(
                `SELECT * FROM memory_chunks WHERE decay_score > 0.01
         ORDER BY tier, importance_score DESC`
            )
            .all() as Record<string, unknown>[];
        return rows.map((r) => this.rowToChunk(r));
    }

    updateChunk(id: string, updates: Partial<MemoryChunk>): void {
        const now = new Date().toISOString();
        const sets: string[] = ['updated_at = ?'];
        const values: unknown[] = [now];

        if (updates.content !== undefined) {
            sets.push('content = ?');
            values.push(updates.content);
            sets.push('token_count = ?');
            values.push(estimateTokens(updates.content));
        }
        if (updates.semanticHeader !== undefined) {
            sets.push('semantic_header = ?');
            values.push(updates.semanticHeader);
        }
        if (updates.importanceScore !== undefined) {
            sets.push('importance_score = ?');
            values.push(updates.importanceScore);
        }
        if (updates.decayScore !== undefined) {
            sets.push('decay_score = ?');
            values.push(updates.decayScore);
        }
        if (updates.tags !== undefined) {
            sets.push('tags = ?');
            values.push(JSON.stringify(updates.tags));
        }
        if (updates.accessCount !== undefined) {
            sets.push('access_count = ?');
            values.push(updates.accessCount);
        }
        if (updates.lastAccessedAt !== undefined) {
            sets.push('last_accessed_at = ?');
            values.push(updates.lastAccessedAt);
        }

        values.push(id);
        this.db
            .prepare(`UPDATE memory_chunks SET ${sets.join(', ')} WHERE id = ?`)
            .run(...values);

        // Update FTS if content changed
        if (updates.content !== undefined || updates.semanticHeader !== undefined) {
            this.db.prepare('DELETE FROM memory_fts WHERE chunk_id = ?').run(id);
            const chunk = this.getChunk(id);
            if (chunk) {
                this.db
                    .prepare(
                        'INSERT INTO memory_fts (chunk_id, content, semantic_header, tags) VALUES (?, ?, ?, ?)'
                    )
                    .run(id, chunk.content, chunk.semanticHeader ?? '', JSON.stringify(chunk.tags));
            }
        }
    }

    deleteChunk(id: string): void {
        this.db.prepare('DELETE FROM memory_fts WHERE chunk_id = ?').run(id);
        this.db.prepare('DELETE FROM memory_chunks WHERE id = ?').run(id);
        logger.debug(`Deleted chunk ${id}`);
    }

    /** Mark a chunk as accessed — boosts decay score */
    touchChunk(id: string, boostFactor = 1.5): void {
        const now = new Date().toISOString();
        this.db
            .prepare(
                `UPDATE memory_chunks SET
           access_count = access_count + 1,
           last_accessed_at = ?,
           decay_score = MIN(1.0, decay_score * ?),
           updated_at = ?
         WHERE id = ?`
            )
            .run(now, boostFactor, now, id);
    }

    // ----------------------------------------------------------
    // Embeddings Cache
    // ----------------------------------------------------------

    getEmbedding(chunkId: string): EmbeddingRecord | null {
        const row = this.db
            .prepare('SELECT * FROM embeddings WHERE chunk_id = ?')
            .get(chunkId) as Record<string, unknown> | undefined;
        if (!row) return null;
        return {
            chunkId: row.chunk_id as string,
            embedding: new Float32Array((row.embedding as Buffer).buffer),
            model: row.model as string,
            contentHash: row.content_hash as string,
            createdAt: row.created_at as string,
        };
    }

    /** Check if an embedding is still valid (content hasn't changed) */
    isEmbeddingFresh(chunkId: string, currentContent: string): boolean {
        const row = this.db
            .prepare('SELECT content_hash FROM embeddings WHERE chunk_id = ?')
            .get(chunkId) as { content_hash: string } | undefined;
        if (!row) return false;
        return row.content_hash === hashContent(currentContent);
    }

    upsertEmbedding(record: EmbeddingRecord): void {
        const buffer = Buffer.from(record.embedding.buffer);
        this.db
            .prepare(
                `INSERT OR REPLACE INTO embeddings (chunk_id, embedding, model, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`
            )
            .run(record.chunkId, buffer, record.model, record.contentHash, record.createdAt);
    }

    getAllEmbeddings(): EmbeddingRecord[] {
        const rows = this.db.prepare('SELECT * FROM embeddings').all() as Record<
            string,
            unknown
        >[];
        return rows.map((row) => ({
            chunkId: row.chunk_id as string,
            embedding: new Float32Array((row.embedding as Buffer).buffer),
            model: row.model as string,
            contentHash: row.content_hash as string,
            createdAt: row.created_at as string,
        }));
    }

    // ----------------------------------------------------------
    // Episodes
    // ----------------------------------------------------------

    insertEpisode(input: EpisodeInput): Episode {
        const now = new Date().toISOString();
        const id = uuidv4();
        const tokenCount = estimateTokens(input.content);
        const episode: Episode = {
            id,
            sessionId: input.sessionId,
            role: input.role,
            content: input.content,
            summary: null,
            tokenCount,
            createdAt: now,
            importanceScore: input.importanceScore ?? 0.5,
        };

        this.db
            .prepare(
                `INSERT INTO episodes
         (id, session_id, role, content, summary, token_count, created_at, importance_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                episode.id,
                episode.sessionId,
                episode.role,
                episode.content,
                episode.summary,
                episode.tokenCount,
                episode.createdAt,
                episode.importanceScore
            );
        return episode;
    }

    getEpisodesBySession(sessionId: string): Episode[] {
        const rows = this.db
            .prepare('SELECT * FROM episodes WHERE session_id = ? ORDER BY created_at ASC')
            .all(sessionId) as Record<string, unknown>[];
        return rows.map((r) => this.rowToEpisode(r));
    }

    getRecentEpisodes(limit = 50): Episode[] {
        const rows = this.db
            .prepare('SELECT * FROM episodes ORDER BY created_at DESC LIMIT ?')
            .all(limit) as Record<string, unknown>[];
        return rows.map((r) => this.rowToEpisode(r));
    }

    getEpisodesOlderThan(days: number): Episode[] {
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();
        const rows = this.db
            .prepare(
                'SELECT * FROM episodes WHERE created_at < ? AND summary IS NULL ORDER BY created_at ASC'
            )
            .all(cutoff) as Record<string, unknown>[];
        return rows.map((r) => this.rowToEpisode(r));
    }

    updateEpisodeSummary(id: string, summary: string): void {
        this.db
            .prepare('UPDATE episodes SET summary = ?, token_count = ? WHERE id = ?')
            .run(summary, estimateTokens(summary), id);
    }

    deleteEpisode(id: string): void {
        this.db.prepare('DELETE FROM episodes WHERE id = ?').run(id);
    }

    // ----------------------------------------------------------
    // Knowledge Graph
    // ----------------------------------------------------------

    addEdge(edge: Omit<KnowledgeEdge, 'createdAt'>): void {
        const now = new Date().toISOString();
        this.db
            .prepare(
                `INSERT OR REPLACE INTO knowledge_edges
         (from_chunk_id, to_chunk_id, relation, weight, created_at)
         VALUES (?, ?, ?, ?, ?)`
            )
            .run(edge.fromChunkId, edge.toChunkId, edge.relation, edge.weight, now);
    }

    getEdgesFrom(chunkId: string): KnowledgeEdge[] {
        const rows = this.db
            .prepare('SELECT * FROM knowledge_edges WHERE from_chunk_id = ?')
            .all(chunkId) as Record<string, unknown>[];
        return rows.map((r) => ({
            fromChunkId: r.from_chunk_id as string,
            toChunkId: r.to_chunk_id as string,
            relation: r.relation as string,
            weight: r.weight as number,
            createdAt: r.created_at as string,
        }));
    }

    getEdgesTo(chunkId: string): KnowledgeEdge[] {
        const rows = this.db
            .prepare('SELECT * FROM knowledge_edges WHERE to_chunk_id = ?')
            .all(chunkId) as Record<string, unknown>[];
        return rows.map((r) => ({
            fromChunkId: r.from_chunk_id as string,
            toChunkId: r.to_chunk_id as string,
            relation: r.relation as string,
            weight: r.weight as number,
            createdAt: r.created_at as string,
        }));
    }

    getRelatedChunks(chunkId: string, depth = 1): string[] {
        const visited = new Set<string>();
        const queue = [chunkId];
        for (let d = 0; d < depth; d++) {
            const nextQueue: string[] = [];
            for (const cid of queue) {
                if (visited.has(cid)) continue;
                visited.add(cid);
                const edges = [...this.getEdgesFrom(cid), ...this.getEdgesTo(cid)];
                for (const e of edges) {
                    const neighbor =
                        e.fromChunkId === cid ? e.toChunkId : e.fromChunkId;
                    if (!visited.has(neighbor)) {
                        nextQueue.push(neighbor);
                    }
                }
            }
            queue.length = 0;
            queue.push(...nextQueue);
        }
        visited.delete(chunkId); // don't include self
        return [...visited];
    }

    // ----------------------------------------------------------
    // Retrieval Log (Meta-Memory)
    // ----------------------------------------------------------

    logRetrieval(entry: Omit<RetrievalLogEntry, 'id' | 'createdAt'>): void {
        const now = new Date().toISOString();
        this.db
            .prepare(
                `INSERT INTO retrieval_log (query, chunks_retrieved, relevance_scores, was_useful, created_at)
         VALUES (?, ?, ?, ?, ?)`
            )
            .run(
                entry.query,
                JSON.stringify(entry.chunksRetrieved),
                JSON.stringify(entry.relevanceScores),
                entry.wasUseful === null ? null : entry.wasUseful ? 1 : 0,
                now
            );
    }

    // ----------------------------------------------------------
    // Semantic Cache
    // ----------------------------------------------------------

    getSemanticCache(
        queryHash: string
    ): { chunkIds: string[]; scores: number[] } | null {
        const row = this.db
            .prepare('SELECT * FROM semantic_cache WHERE query_hash = ?')
            .get(queryHash) as Record<string, unknown> | undefined;
        if (!row) return null;
        // Update hit count
        this.db
            .prepare(
                `UPDATE semantic_cache SET hit_count = hit_count + 1, last_hit_at = ? WHERE query_hash = ?`
            )
            .run(new Date().toISOString(), queryHash);
        return {
            chunkIds: JSON.parse(row.result_chunk_ids as string),
            scores: JSON.parse(row.result_scores as string),
        };
    }

    setSemanticCache(
        queryHash: string,
        queryEmbedding: Float32Array,
        chunkIds: string[],
        scores: number[]
    ): void {
        const now = new Date().toISOString();
        const buffer = Buffer.from(queryEmbedding.buffer);
        this.db
            .prepare(
                `INSERT OR REPLACE INTO semantic_cache
         (query_hash, query_embedding, result_chunk_ids, result_scores, hit_count, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`
            )
            .run(queryHash, buffer, JSON.stringify(chunkIds), JSON.stringify(scores), now);
    }

    // ----------------------------------------------------------
    // BM25 Full-Text Search
    // ----------------------------------------------------------

    fullTextSearch(query: string, limit = 20): { chunkId: string; rank: number }[] {
        try {
            const rows = this.db
                .prepare(
                    `SELECT chunk_id, rank FROM memory_fts
           WHERE memory_fts MATCH ? ORDER BY rank LIMIT ?`
                )
                .all(query, limit) as { chunk_id: string; rank: number }[];
            return rows.map((r) => ({ chunkId: r.chunk_id, rank: r.rank }));
        } catch {
            // FTS query syntax error — fallback to LIKE
            const likeQuery = `%${query}%`;
            const rows = this.db
                .prepare(
                    `SELECT id as chunk_id, 0.5 as rank FROM memory_chunks
           WHERE content LIKE ? OR semantic_header LIKE ? LIMIT ?`
                )
                .all(likeQuery, likeQuery, limit) as { chunk_id: string; rank: number }[];
            return rows.map((r) => ({ chunkId: r.chunk_id, rank: r.rank }));
        }
    }

    // ----------------------------------------------------------
    // Statistics
    // ----------------------------------------------------------

    getStats(): MemoryStats {
        const totalChunks =
            (
                this.db
                    .prepare('SELECT COUNT(*) as c FROM memory_chunks')
                    .get() as { c: number }
            ).c ?? 0;

        const totalTokens =
            (
                this.db
                    .prepare('SELECT COALESCE(SUM(token_count), 0) as t FROM memory_chunks')
                    .get() as { t: number }
            ).t ?? 0;

        const totalEpisodes =
            (
                this.db
                    .prepare('SELECT COUNT(*) as c FROM episodes')
                    .get() as { c: number }
            ).c ?? 0;

        const totalEmbeddings =
            (
                this.db
                    .prepare('SELECT COUNT(*) as c FROM embeddings')
                    .get() as { c: number }
            ).c ?? 0;

        // Chunks and tokens by tier
        const tierRows = this.db
            .prepare(
                `SELECT tier, COUNT(*) as cnt, COALESCE(SUM(token_count), 0) as tok
         FROM memory_chunks GROUP BY tier`
            )
            .all() as { tier: string; cnt: number; tok: number }[];

        const chunksByTier = {} as Record<MemoryTier, number>;
        const tokensByTier = {} as Record<MemoryTier, number>;
        for (const t of Object.values(MemoryTier)) {
            chunksByTier[t] = 0;
            tokensByTier[t] = 0;
        }
        for (const row of tierRows) {
            chunksByTier[row.tier as MemoryTier] = row.cnt;
            tokensByTier[row.tier as MemoryTier] = row.tok;
        }

        // Averages
        const avgImportance =
            (
                this.db
                    .prepare(
                        'SELECT COALESCE(AVG(importance_score), 0) as a FROM memory_chunks'
                    )
                    .get() as { a: number }
            ).a ?? 0;

        const avgDecayScore =
            (
                this.db
                    .prepare(
                        'SELECT COALESCE(AVG(decay_score), 0) as a FROM memory_chunks'
                    )
                    .get() as { a: number }
            ).a ?? 0;

        // Date range
        const oldest = (
            this.db
                .prepare(
                    'SELECT MIN(created_at) as m FROM memory_chunks'
                )
                .get() as { m: string | null }
        ).m;

        const newest = (
            this.db
                .prepare(
                    'SELECT MAX(created_at) as m FROM memory_chunks'
                )
                .get() as { m: string | null }
        ).m;

        // Retrieval count
        const totalRetrievals =
            (
                this.db
                    .prepare('SELECT COUNT(*) as c FROM retrieval_log')
                    .get() as { c: number }
            ).c ?? 0;

        // Cache hit rate
        const totalCacheHits =
            (
                this.db
                    .prepare('SELECT COALESCE(SUM(hit_count), 0) as h FROM semantic_cache')
                    .get() as { h: number }
            ).h ?? 0;

        const cacheHitRate =
            totalRetrievals > 0 ? totalCacheHits / (totalRetrievals + totalCacheHits) : 0;

        return {
            totalChunks,
            totalTokens,
            chunksByTier,
            tokensByTier,
            totalEpisodes,
            totalEmbeddings,
            cacheHitRate,
            avgImportance,
            avgDecayScore,
            oldestMemory: oldest,
            newestMemory: newest,
            totalRetrievals,
            storageBytes: 0, // TODO: calculate file system usage
        };
    }

    // ----------------------------------------------------------
    // Bulk Operations
    // ----------------------------------------------------------

    /** Apply decay to all chunks based on time since last access */
    applyDecay(retentionRate: number): number {
        const now = Date.now();
        const chunks = this.db
            .prepare(
                'SELECT id, last_accessed_at, created_at, decay_score FROM memory_chunks WHERE decay_score > 0.01'
            )
            .all() as { id: string; last_accessed_at: string | null; created_at: string; decay_score: number }[];

        let decayedCount = 0;
        const update = this.db.prepare(
            'UPDATE memory_chunks SET decay_score = ?, updated_at = ? WHERE id = ?'
        );

        const transaction = this.db.transaction(() => {
            for (const chunk of chunks) {
                const refDate = chunk.last_accessed_at ?? chunk.created_at;
                const daysSince =
                    (now - new Date(refDate).getTime()) / 86400000;
                const newDecay =
                    chunk.decay_score * Math.pow(retentionRate, daysSince);
                if (newDecay !== chunk.decay_score) {
                    update.run(newDecay, new Date().toISOString(), chunk.id);
                    decayedCount++;
                }
            }
        });

        transaction();
        return decayedCount;
    }

    /** Get chunks below archive threshold */
    getDecayedChunks(threshold: number): MemoryChunk[] {
        const rows = this.db
            .prepare(
                'SELECT * FROM memory_chunks WHERE decay_score < ? AND decay_score > 0.01'
            )
            .all(threshold) as Record<string, unknown>[];
        return rows.map((r) => this.rowToChunk(r));
    }

    /** Delete chunks below delete threshold */
    purgeDecayed(threshold: number): number {
        // First clean FTS
        const ids = this.db
            .prepare('SELECT id FROM memory_chunks WHERE decay_score < ?')
            .all(threshold) as { id: string }[];
        for (const { id } of ids) {
            this.db.prepare('DELETE FROM memory_fts WHERE chunk_id = ?').run(id);
        }
        const result = this.db
            .prepare('DELETE FROM memory_chunks WHERE decay_score < ?')
            .run(threshold);
        return result.changes;
    }

    // ----------------------------------------------------------
    // System Configuration
    // ----------------------------------------------------------

    /** Set a system configuration value */
    setSystemConfig(key: string, value: any): void {
        const now = new Date().toISOString();
        const jsonValue = JSON.stringify(value);
        this.db
            .prepare(
                'INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, ?)'
            )
            .run(key, jsonValue, now);
    }

    /** Get a system configuration value */
    getSystemConfig<T>(key: string): T | null {
        const row = this.db
            .prepare('SELECT value FROM system_config WHERE key = ?')
            .get(key) as { value: string } | undefined;
        if (!row) return null;
        try {
            return JSON.parse(row.value) as T;
        } catch {
            return null;
        }
    }

    /** Get all system configuration values */
    getAllSystemConfig(): Record<string, any> {
        const rows = this.db.prepare('SELECT key, value FROM system_config').all() as {
            key: string;
            value: string;
        }[];
        const config: Record<string, any> = {};
        for (const row of rows) {
            try {
                config[row.key] = JSON.parse(row.value);
            } catch {
                // Ignore malformed values
            }
        }
        return config;
    }

    close(): void {
        this.db.close();
    }

    // ----------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------

    private rowToChunk(row: Record<string, unknown>): MemoryChunk {
        return {
            id: row.id as string,
            tier: row.tier as MemoryTier,
            sourceFile: row.source_file as string,
            content: row.content as string,
            semanticHeader: (row.semantic_header as string) || null,
            tokenCount: row.token_count as number,
            importanceScore: row.importance_score as number,
            accessCount: row.access_count as number,
            lastAccessedAt: (row.last_accessed_at as string) || null,
            createdAt: row.created_at as string,
            updatedAt: row.updated_at as string,
            decayScore: row.decay_score as number,
            tags: JSON.parse((row.tags as string) || '[]'),
            parentChunkId: (row.parent_chunk_id as string) || null,
        };
    }

    private rowToEpisode(row: Record<string, unknown>): Episode {
        return {
            id: row.id as string,
            sessionId: row.session_id as string,
            role: row.role as 'user' | 'assistant' | 'system',
            content: row.content as string,
            summary: (row.summary as string) || null,
            tokenCount: row.token_count as number,
            createdAt: row.created_at as string,
            importanceScore: row.importance_score as number,
        };
    }
}
