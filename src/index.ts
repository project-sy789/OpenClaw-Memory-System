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
    HealthStatus,
    SearchMode,
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
import { MetaMemory, MetaInsights } from './memory/meta-memory';

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
    private metaMemory: MetaMemory;

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

        // --- Load Persistent Config ---
        const persistedConfig = this.storage.getAllSystemConfig();
        if (Object.keys(persistedConfig).length > 0) {
            logger.debug('Applying persisted system settings...');
            // Merge peristed config over initial config, then re-resolve
            this.config = resolveConfig({ ...this.config, ...persistedConfig });
            // Re-apply log level
            setLogLevel(this.config.logLevel);
        }

        // Initialize embedding engine (Delegated)
        this.embedder = new EmbeddingEngine(
            this.config.aiProvider,
            this.config.embeddingModel || 'default',
            this.config.embeddingDimensions || 1536,
            this.storage
        );

        // Configure internal logic
        this.embedder.configure(
            this.config.maxRetries,
            this.config.retryDelay,
            this.config.batchSize
        );

        // Initialize chunking
        this.chunker = new SmartChunker({
            minChunkSize: this.config.chunkSizeMin,
            maxChunkSize: this.config.chunkSizeMax,
        });

        // Initialize header injector (Delegated)
        this.headerInjector = new HeaderInjector(this.config.aiProvider, true);

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

        // Initialize Meta-Memory (self-reflective tier)
        this.metaMemory = new MetaMemory(this.storage);

        // Initialize retrieval (with brain search support)
        const searchMode = (this.config.searchMode ?? 'auto') as SearchMode;
        this.search = new HybridSearch(
            this.storage,
            this.embedder,
            this.config.aiProvider, // Enables brain-powered search
            searchMode
        );
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

        logger.info(`OpenClaw Memory System v2 initialized (mode: ${searchMode})`);
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
        const startTime = Date.now();

        // Search across all tiers
        const results = await this.search.search(query, options);

        // Apply token budget
        const maxTokens = options.maxTokens ?? this.config.tokenBudget;
        const budget = this.budgetManager.createBudget(maxTokens);
        const allocation = this.budgetManager.allocate(results, budget);

        // Format as context string
        const context = this.budgetManager.formatContext(allocation);

        // Meta-Memory: log this recall for self-reflection
        const latencyMs = Date.now() - startTime;
        const modeUsed = options.searchMode ?? this.search.searchMode ?? 'hybrid';
        try {
            this.metaMemory.logQuery(query, results, modeUsed, latencyMs);
        } catch {
            // Don't fail the recall if meta-logging fails
        }

        return {
            results: [...allocation.included, ...allocation.headerOnly],
            context,
            tokensUsed: allocation.totalTokens,
        };
    }

    /**
     * Unified Chat API: Recalls memory, formats context, and generates a response.
     * This is the recommended entry point for chatbots (Telegram, Discord, etc.)
     */
    async chat(message: string, sessionId?: string): Promise<string> {
        const sid = sessionId || 'default-chat';

        // 1. Ensure session is started
        if (!this.workingMemory.isActive() || this.workingMemory.getSessionState()?.sessionId !== sid) {
            this.startSession(sid);
        }

        // 2. Add user message to working memory
        this.addMessage('user', message);

        // 3. Recall relevant context from memory tiers
        const { context } = await this.recall(message);

        // 4. Construct prompt for AI
        const messages = [
            {
                role: 'system',
                content: `You are a helpful AI assistant with access to a memory system.
Your goal is to answer questions using the provided context.
If the context doesn't contain the answer, use your general knowledge but mention it's not in your specific memory.

## Relevant Context from Memory:
${context}

## Recent Conversation History:
${this.getWorkingContext(2000)}`
            }
        ];

        // 5. Generate response from AI Provider
        const response = await this.config.aiProvider.chat(messages);

        // 6. Add assistant response to working memory
        this.addMessage('assistant', response);

        return response;
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

    /** Get meta-memory insights (self-reflection on memory usage) */
    getMetaInsights(): MetaInsights {
        return this.metaMemory.getInsights();
    }

    /** Get recommended search weights based on usage history */
    getRecommendedWeights(): { vector: number; keyword: number; graph: number; brain: number } {
        return this.metaMemory.getRecommendedWeights();
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

    // ============================================================
    // Health Check
    // ============================================================

    /**
     * Check system health (Database + Delegated AI Providers)
     */
    async health(): Promise<HealthStatus> {
        const dbStatus: 'ok' | 'error' = this.storage ? 'ok' : 'error';

        // Use delegated provider's health check
        const providerHealth = await this.config.aiProvider.checkHealth();

        return {
            status: (dbStatus === 'ok' && providerHealth.status === 'ok') ? 'ok' : 'degraded',
            components: {
                database: { status: dbStatus },
                embeddingProvider: providerHealth,
                llmProvider: providerHealth,
            },
            version: '2.0.0-brain',
            timestamp: new Date().toISOString(),
            searchMode: this.search.searchMode,
        };
    }

    // ============================================================
    // Runtime Config Update
    // ============================================================

    /**
     * Update configuration at runtime.
     * Note: In the delegated architecture, provider-level changes (API keys) are managed by the host.
     */
    async updateConfig(newConfig: Partial<OpenClawMemoryConfig>): Promise<void> {
        logger.info('Updating system configuration...');

        // 1. Merge Config
        this.config = { ...this.config, ...newConfig } as Required<OpenClawMemoryConfig>;

        // --- Persist to Database ---
        for (const [key, value] of Object.entries(newConfig)) {
            // Don't persist the provider object itself
            if (key === 'aiProvider') continue;
            this.storage.setSystemConfig(key, value);
        }

        // 2. Update Log Level
        if (newConfig.logLevel) {
            setLogLevel(newConfig.logLevel);
        }

        logger.info('Configuration updated successfully.');
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
    AIProvider,
    SearchMode,
} from './types';

export { MetaMemory, MetaInsights } from './memory/meta-memory';
export { Procedure } from './memory/procedural-memory';
export { TOKEN_PRESETS, EMBEDDING_MODELS, BRAIN_SEARCH_CONFIG } from './config';
export { OpenAIProvider } from './providers/openai';
export { MinimaxProvider } from './providers/minimax';
