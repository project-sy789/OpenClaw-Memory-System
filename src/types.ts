// ============================================================
// OpenClaw Memory System — Type Definitions
// ============================================================

/** Memory tier classification */
export enum MemoryTier {
    /** Tier 1: In-session buffer (ephemeral) */
    Working = 'working',
    /** Tier 2: Conversation logs with timestamps */
    Episodic = 'episodic',
    /** Tier 3: Factual knowledge, vector-indexed */
    Semantic = 'semantic',
    /** Tier 4: Skills, patterns, procedures */
    Procedural = 'procedural',
    /** Tier 5: Memory-about-memory (retrieval stats) */
    Meta = 'meta',
}

/** A single unit of memory with full metadata */
export interface MemoryChunk {
    id: string;
    tier: MemoryTier;
    sourceFile: string;
    content: string;
    semanticHeader: string | null;
    tokenCount: number;
    importanceScore: number;       // 0.0 - 1.0
    accessCount: number;
    lastAccessedAt: string | null;
    createdAt: string;
    updatedAt: string;
    decayScore: number;            // 0.0 - 1.0 (1.0 = fresh)
    tags: string[];
    parentChunkId: string | null;  // hierarchical parent
}

/** Input for creating a new memory chunk */
export interface MemoryInput {
    content: string;
    tier?: MemoryTier;
    tags?: string[];
    importanceScore?: number;
    sourceFile?: string;
    parentChunkId?: string;
}

/** A conversation episode entry */
export interface Episode {
    id: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    summary: string | null;
    tokenCount: number;
    createdAt: string;
    importanceScore: number;
}

/** Input for adding an episode */
export interface EpisodeInput {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    importanceScore?: number;
}

/** Embedding record stored in cache */
export interface EmbeddingRecord {
    chunkId: string;
    embedding: Float32Array;
    model: string;
    contentHash: string;
    createdAt: string;
}

/** Result from memory retrieval */
export interface RetrievalResult {
    chunk: MemoryChunk;
    score: number;           // 0.0 - 1.0 combined relevance
    vectorScore: number;     // cosine similarity
    keywordScore: number;    // BM25 score (normalized)
    graphScore: number;      // knowledge graph traversal score
    source: 'vector' | 'keyword' | 'graph' | 'fused';
}

/** Token budget configuration */
export interface TokenBudget {
    maxTokens: number;
    reservedForSystem: number;  // tokens reserved for system prompt
    reservedForResponse: number; // tokens reserved for response
    availableForContext: number; // = max - system - response
}

/** Retrieval query options */
export interface RecallOptions {
    maxTokens?: number;
    tiers?: MemoryTier[];
    tags?: string[];
    topK?: number;
    minRelevance?: number;     // 0.0 - 1.0
    includeDecayed?: boolean;
    timeRange?: {
        after?: string;  // ISO date
        before?: string; // ISO date
    };
}

/** Memory system statistics */
export interface MemoryStats {
    totalChunks: number;
    totalTokens: number;
    chunksByTier: Record<MemoryTier, number>;
    tokensByTier: Record<MemoryTier, number>;
    totalEpisodes: number;
    totalEmbeddings: number;
    cacheHitRate: number;      // 0.0 - 1.0
    avgImportance: number;
    avgDecayScore: number;
    oldestMemory: string | null;
    newestMemory: string | null;
    totalRetrievals: number;
    storageBytes: number;
}

/** Knowledge graph edge */
export interface KnowledgeEdge {
    fromChunkId: string;
    toChunkId: string;
    relation: string;   // 'related_to' | 'part_of' | 'causes' | 'depends_on'
    weight: number;      // 0.0 - 1.0
    createdAt: string;
}

/** Retrieval log entry for meta-memory */
export interface RetrievalLogEntry {
    id: number;
    query: string;
    chunksRetrieved: string[];
    relevanceScores: number[];
    wasUseful: boolean | null;
    createdAt: string;
}

/** Session state */
export interface SessionState {
    sessionId: string;
    startedAt: string;
    messageCount: number;
    tokenCount: number;
    workingMemory: WorkingMemoryEntry[];
}

/** Working memory entry */
export interface WorkingMemoryEntry {
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokenCount: number;
    timestamp: string;
}

/** Configuration for the OpenClaw Memory System */
export interface OpenClawMemoryConfig {
    /** OpenAI API key for embeddings */
    openaiApiKey: string;
    /** Optional Base URL for OpenAI-compatible providers (e.g., Minimax, OpenRouter) */
    openaiBaseUrl?: string;
    /** Directory for memory markdown files */
    memoryDir?: string;
    /** SQLite database path */
    dbPath?: string;
    /** Max tokens for retrieval context */
    tokenBudget?: number;
    /** Embedding model (default: text-embedding-3-small) */
    embeddingModel?: string;
    /** Embedding dimensions (default: 1536) */
    embeddingDimensions?: number;
    /** Working memory buffer size (default: 20 messages) */
    workingMemorySize?: number;
    /** Chunk size limits */
    chunkSizeMin?: number;
    chunkSizeMax?: number;
    /** Decay retention rate per day (0-1, default: 0.95) */
    decayRetentionRate?: number;
    /** Topic merge similarity threshold (0-1, default: 0.85) */
    mergeThreshold?: number;
    /** Log level */
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    /** Max retries for API calls (default: 3) */
    maxRetries?: number;
    /** Initial retry delay in ms (default: 1000) */
    retryDelay?: number;
    /** Max items per embedding batch (default: 50) */
    batchSize?: number;

    // --- Dual Provider Support ---
    /** LLM Provider (for text generation/reasoning) */
    llmProvider?: {
        apiKey: string;
        baseUrl?: string;
        model?: string;
    };
    /** Embedding Provider (for vector generation) */
    embeddingProvider?: {
        apiKey: string;
        baseUrl?: string;
        model?: string;
        dimensions?: number;
    };
}

/** Merge result from auto-merger */
export interface MergeResult {
    mergedFiles: string[];
    outputFile: string;
    originalChunks: number;
    resultChunks: number;
    strategy: 'date' | 'topic';
}

/** Consolidation result */
export interface ConsolidationResult {
    episodesProcessed: number;
    factsExtracted: number;
    patternsIdentified: number;
    memoriesArchived: number;
    memoriesDeleted: number;
    tokensFreed: number;
}

/** Decay result */
export interface DecayResult {
    memoriesDecayed: number;
    memoriesArchived: number;
    memoriesDeleted: number;
    tokensFreed: number;
}
