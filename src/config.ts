// ============================================================
// OpenClaw Memory System — Configuration
// ============================================================

import { OpenClawMemoryConfig } from './types';

/** Default configuration values */
export const DEFAULT_CONFIG: Required<OpenClawMemoryConfig> = {
    openaiApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    memoryDir: './memory',
    dbPath: undefined as any, // handled belowry.db',
    tokenBudget: 4000,
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    workingMemorySize: 20,
    chunkSizeMin: 100,
    chunkSizeMax: 1500,
    decayRetentionRate: 0.95,
    mergeThreshold: 0.85,
    logLevel: 'info',
};

/** Resolved (merged) config */
export function resolveConfig(
    userConfig: OpenClawMemoryConfig
): Required<OpenClawMemoryConfig> {
    return {
        ...DEFAULT_CONFIG,
        ...userConfig,
        // Derive dbPath from memoryDir if not explicitly set
        dbPath:
            userConfig.dbPath ??
            `${userConfig.memoryDir ?? DEFAULT_CONFIG.memoryDir}/openclaw-memory.db`,
    };
}

/** Token budget presets */
export const TOKEN_PRESETS = {
    /** Minimal context — fast, cheap */
    minimal: { maxTokens: 1000, reservedForSystem: 500, reservedForResponse: 1000 },
    /** Standard context — balanced */
    standard: { maxTokens: 4000, reservedForSystem: 500, reservedForResponse: 2000 },
    /** Extended context — rich recall */
    extended: { maxTokens: 8000, reservedForSystem: 500, reservedForResponse: 4000 },
    /** Maximum context — full detail */
    maximum: { maxTokens: 16000, reservedForSystem: 500, reservedForResponse: 4000 },
} as const;

/** Embedding model specs */
export const EMBEDDING_MODELS = {
    'text-embedding-3-small': {
        maxInput: 8191,
        defaultDimensions: 1536,
        costPer1MTokens: 0.02,
    },
    'text-embedding-3-large': {
        maxInput: 8191,
        defaultDimensions: 3072,
        costPer1MTokens: 0.13,
    },
} as const;

/** Memory decay parameters */
export const DECAY_CONFIG = {
    /** Score below which memory is archived (moved out of active search) */
    archiveThreshold: 0.1,
    /** Score below which memory is permanently deleted */
    deleteThreshold: 0.01,
    /** Boost factor when memory is accessed (multiplicative) */
    accessBoost: 1.5,
    /** Maximum decay score */
    maxScore: 1.0,
} as const;

/** Consolidation parameters */
export const CONSOLIDATION_CONFIG = {
    /** Days before raw episodes are summarized */
    summarizeAfterDays: 7,
    /** Days before summaries are further compressed */
    compressAfterDays: 30,
    /** Minimum episodes to trigger consolidation */
    minEpisodesForConsolidation: 10,
    /** Similarity threshold for merging similar semantic memories */
    deduplicationThreshold: 0.92,
} as const;

/** Chunking parameters */
export const CHUNKING_CONFIG = {
    /** Overlap ratio between consecutive chunks */
    overlapRatio: 0.12,
    /** Maximum number of sentences in a single chunk */
    maxSentencesPerChunk: 25,
    /** Minimum semantic similarity for topic continuity */
    topicContinuityThreshold: 0.7,
} as const;

/** Retrieval parameters */
export const RETRIEVAL_CONFIG = {
    /** Default top-K for each search source */
    defaultTopK: 20,
    /** Reciprocal Rank Fusion constant */
    rrfK: 60,
    /** Weight for vector search in fusion */
    vectorWeight: 0.5,
    /** Weight for keyword search in fusion */
    keywordWeight: 0.3,
    /** Weight for graph search in fusion */
    graphWeight: 0.2,
    /** Minimum relevance score to include in results */
    minRelevanceScore: 0.15,
    /** Semantic cache similarity threshold */
    semanticCacheThreshold: 0.92,
} as const;
