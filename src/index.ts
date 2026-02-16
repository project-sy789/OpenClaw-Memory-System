// ============================================================
// OpenClaw Memory System — Main Entry Point
// ============================================================
// This is the public API that OpenClaw imports and uses.

import * as fs from 'fs';
import {
    OpenClawMemoryConfig,
    MemoryInput,
    MemoryChunk,
    MemoryTier,
    RecallOptions,
    RetrievalResult,
    MemoryStats,
    ConsolidationResult,
    DecayResult,
    SessionState,
} from './types';
import { resolveConfig } from './config';
import { setLogLevel } from './utils/logger';
import { logger } from './utils/logger';

// Storage
import { SQLiteStorage } from './storage/sqlite';
import { MarkdownManager } from './storage/markdown';

// Embedding
import { EmbeddingEngine } from './embedding/embedder';

// Chunking
import { SmartChunker } from './chunking/smart-chunker';
import { HeaderInjector } from './chunking/header-injector';
import { AutoMerger } from './chunking/auto-merger';

// Memory Tiers
import { WorkingMemory } from './memory/working-memory';
import { EpisodicMemory } from './memory/episodic-memory';
import { SemanticMemory } from './memory/semantic-memory';
import { ProceduralMemory, Procedure } from './memory/procedural-memory';

// Retrieval
import { HybridSearch } from './retrieval/hybrid-search';
import { TokenBudgetManager } from './retrieval/token-budget';

// Lifecycle
import { DecayManager } from './lifecycle/decay-manager';
import { Consolidator } from './lifecycle/consolidator';

export class OpenClawMemory {
    private config: Required<OpenClawMemoryConfig>;

    // Storage layer
    private storage: SQLiteStorage;
    private markdown: MarkdownManager;

    // Engine components
    private embedder: EmbeddingEngine;
    private chunker: SmartChunker;
    private headerInjector: HeaderInjector;
    private merger: AutoMerger;

    // Memory tiers
    private workingMemory: WorkingMemory;
    private episodicMemory: EpisodicMemory;
    private semanticMemory: SemanticMemory;
    private proceduralMemory: ProceduralMemory;

    // Retrieval
    private search: HybridSearch;
    private budgetManager: TokenBudgetManager;

    // Lifecycle
    private decayManager: DecayManager;
    private consolidator: Consolidator;

    constructor(userConfig: OpenClawMemoryConfig) {
        this.config = resolveConfig(userConfig);

        // Set log level
        setLogLevel(this.config.logLevel);

        // Ensure memory directory exists
        fs.mkdirSync(this.config.memoryDir, { recursive: true });

        // Initialize storage
        this.storage = new SQLiteStorage(this.config.dbPath);
        this.markdown = new MarkdownManager(this.config.memoryDir);

        // Initialize embedding engine
        this.embedder = new EmbeddingEngine(
            this.config.openaiApiKey,
            this.config.embeddingModel,
            this.config.embeddingDimensions,
            this.storage
        );

        // Initialize chunking
        this.chunker = new SmartChunker({
            minChunkSize: this.config.chunkSizeMin,
            maxChunkSize: this.config.chunkSizeMax,
        });
        this.headerInjector = new HeaderInjector(this.config.openaiApiKey);
        this.merger = new AutoMerger(
            this.markdown,
            this.embedder,
            this.config.mergeThreshold
        );

        // Initialize memory tiers
        this.workingMemory = new WorkingMemory(this.config.workingMemorySize);
        this.episodicMemory = new EpisodicMemory(this.storage, this.markdown);
        this.semanticMemory = new SemanticMemory(
            this.storage,
            this.embedder,
            this.chunker,
            this.headerInjector
        );
        this.proceduralMemory = new ProceduralMemory(this.storage, this.embedder);

        // Initialize retrieval
        this.search = new HybridSearch(this.storage, this.embedder);
        this.budgetManager = new TokenBudgetManager(this.config.tokenBudget);

        // Initialize lifecycle managers
        this.decayManager = new DecayManager(
            this.storage,
            this.config.decayRetentionRate
        );
        this.consolidator = new Consolidator(
            this.storage,
            this.episodicMemory,
            this.semanticMemory,
            this.merger,
            this.embedder
        );

        logger.info('OpenClaw Memory System initialized');
    }

    // ============================================================
    // Session Management
    // ============================================================

    /** Start a new conversation session */
    startSession(sessionId: string): void {
        this.workingMemory.startSession(sessionId);
        logger.info(`Session started: ${sessionId}`);
    }

    /** Add a message to the current session's working memory */
    addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
        this.workingMemory.add(role, content);
    }

    /** Get current session state */
    getSessionState(): SessionState | null {
        return this.workingMemory.getSessionState();
    }

    /**
     * End the current session.
     * Flushes working memory → episodic memory → triggers embedding.
     */
    async endSession(): Promise<void> {
        if (!this.workingMemory.isActive()) {
            logger.warn('No active session to end');
            return;
        }

        const { sessionId, entries } = this.workingMemory.flush();
        this.episodicMemory.storeFromWorkingMemory(sessionId, entries);
        logger.info(`Session ended: ${sessionId} (${entries.length} messages)`);
    }

    // ============================================================
    // Remember (Store)
    // ============================================================

    /**
     * Store a piece of memory.
     * Automatically chunks, injects headers, and generates embeddings.
     */
    async remember(input: MemoryInput): Promise<MemoryChunk[]> {
        const tier = input.tier ?? MemoryTier.Semantic;

        switch (tier) {
            case MemoryTier.Semantic:
                return this.semanticMemory.store(input);

            case MemoryTier.Procedural:
                const chunk = await this.proceduralMemory.storePattern(
                    input.content,
                    input.tags?.join(', ') ?? '',
                    input.tags
                );
                return [chunk];

            case MemoryTier.Episodic:
                const episode = this.episodicMemory.addEpisode({
                    sessionId: 'manual',
                    role: 'system',
                    content: input.content,
                    importanceScore: input.importanceScore,
                });
                // Also store as semantic for searchability
                return this.semanticMemory.store(input);

            default:
                return this.semanticMemory.store(input);
        }
    }

    /**
     * Store a single fact (shorthand for small knowledge items).
     */
    async rememberFact(
        fact: string,
        tags: string[] = [],
        importance = 0.7
    ): Promise<MemoryChunk> {
        return this.semanticMemory.storeFact(fact, tags, importance);
    }

    /**
     * Store a procedure/skill.
     */
    async rememberProcedure(procedure: Procedure): Promise<MemoryChunk> {
        return this.proceduralMemory.storeProcedure(procedure);
    }

    // ============================================================
    // Recall (Retrieve)
    // ============================================================

    /**
     * Search memory and return relevant results within token budget.
     * This is the main retrieval method.
     */
    async recall(
        query: string,
        options: RecallOptions = {}
    ): Promise<{
        results: RetrievalResult[];
        context: string;
        tokensUsed: number;
    }> {
        // Search across all tiers
        const results = await this.search.search(query, options);

        // Apply token budget
        const maxTokens = options.maxTokens ?? this.config.tokenBudget;
        const budget = this.budgetManager.createBudget(maxTokens);
        const allocation = this.budgetManager.allocate(results, budget);

        // Format as context string
        const context = this.budgetManager.formatContext(allocation);

        return {
            results: [...allocation.included, ...allocation.headerOnly],
            context,
            tokensUsed: allocation.totalTokens,
        };
    }

    /**
     * Quick recall — returns just the context string (most common usage).
     */
    async recallContext(
        query: string,
        maxTokens?: number
    ): Promise<string> {
        const { context } = await this.recall(query, { maxTokens });
        return context;
    }

    /**
     * Get recent conversation context (from episodic memory).
     */
    getRecentContext(limit = 10): string {
        return this.episodicMemory.getRecentContext(limit);
    }

    /**
     * Get current working memory entries formatted for context.
     */
    getWorkingContext(maxTokens = 2000): string {
        const entries = this.workingMemory.getWithinBudget(maxTokens);
        return entries
            .map((e) => `[${e.role}] ${e.content}`)
            .join('\n');
    }

    // ============================================================
    // Maintenance
    // ============================================================

    /**
     * Run memory consolidation (episodic → semantic, merge, deduplicate).
     * Call periodically (e.g., daily) or when memory is idle.
     */
    async consolidate(): Promise<ConsolidationResult> {
        return this.consolidator.run();
    }

    /**
     * Apply memory decay — reduces importance of old, unused memories.
     * Call periodically (e.g., daily).
     */
    decay(): DecayResult {
        return this.decayManager.run();
    }

    /**
     * Run file merging (date + topic based).
     */
    async merge(): Promise<void> {
        await this.merger.runFullMerge();
    }

    // ============================================================
    // Statistics
    // ============================================================

    /** Get comprehensive memory statistics */
    stats(): MemoryStats {
        return this.storage.getStats();
    }

    /** Get embedding cache statistics */
    cacheStats(): { hits: number; misses: number; hitRate: number } {
        return this.embedder.getCacheStats();
    }

    /** Print a human-readable stats summary */
    printStats(): string {
        const s = this.stats();
        const c = this.cacheStats();

        return [
            '╔══════════════════════════════════════════╗',
            '║    🧠 OpenClaw Memory System — Stats     ║',
            '╠══════════════════════════════════════════╣',
            `║ Total Chunks: ${String(s.totalChunks).padStart(25)} ║`,
            `║ Total Tokens: ${String(s.totalTokens).padStart(25)} ║`,
            `║ Total Episodes: ${String(s.totalEpisodes).padStart(23)} ║`,
            `║ Total Embeddings: ${String(s.totalEmbeddings).padStart(21)} ║`,
            '╠──────────────────────────────────────────╣',
            `║ Semantic Chunks: ${String(s.chunksByTier.semantic ?? 0).padStart(22)} ║`,
            `║ Episodic Chunks: ${String(s.chunksByTier.episodic ?? 0).padStart(22)} ║`,
            `║ Procedural Chunks: ${String(s.chunksByTier.procedural ?? 0).padStart(20)} ║`,
            '╠──────────────────────────────────────────╣',
            `║ Avg Importance: ${(s.avgImportance * 100).toFixed(1).padStart(21)}% ║`,
            `║ Avg Decay Score: ${(s.avgDecayScore * 100).toFixed(1).padStart(20)}% ║`,
            `║ Cache Hit Rate: ${(c.hitRate * 100).toFixed(1).padStart(21)}% ║`,
            `║ Total Retrievals: ${String(s.totalRetrievals).padStart(21)} ║`,
            '╠──────────────────────────────────────────╣',
            `║ Oldest Memory: ${(s.oldestMemory ?? 'N/A').slice(0, 24).padStart(24)} ║`,
            `║ Newest Memory: ${(s.newestMemory ?? 'N/A').slice(0, 24).padStart(24)} ║`,
            '╚══════════════════════════════════════════╝',
        ].join('\n');
    }

    // ============================================================
    // Cleanup
    // ============================================================

    /** Close database connection */
    close(): void {
        this.storage.close();
        logger.info('OpenClaw Memory System closed');
    }
}

// Re-export types for consumers
export {
    OpenClawMemoryConfig,
    MemoryInput,
    MemoryChunk,
    MemoryTier,
    RecallOptions,
    RetrievalResult,
    MemoryStats,
    ConsolidationResult,
    DecayResult,
    SessionState,
    TokenBudget,
    WorkingMemoryEntry,
    Episode,
    EpisodeInput,
    KnowledgeEdge,
} from './types';

export { Procedure } from './memory/procedural-memory';
export { TOKEN_PRESETS, EMBEDDING_MODELS } from './config';
