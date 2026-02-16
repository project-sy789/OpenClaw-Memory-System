// ============================================================
// OpenClaw Memory System — Memory Consolidator
// ============================================================
// Consolidates episodic → semantic memories (like sleep consolidation).

import { SQLiteStorage } from '../storage/sqlite';
import { EpisodicMemory } from '../memory/episodic-memory';
import { SemanticMemory } from '../memory/semantic-memory';
import { AutoMerger } from '../chunking/auto-merger';
import { CONSOLIDATION_CONFIG } from '../config';
import { ConsolidationResult, MemoryTier } from '../types';
import { cosineSimilarity } from '../embedding/similarity';
import { EmbeddingEngine } from '../embedding/embedder';
import { logger } from '../utils/logger';

export class Consolidator {
    private storage: SQLiteStorage;
    private episodic: EpisodicMemory;
    private semantic: SemanticMemory;
    private merger: AutoMerger;
    private embedder: EmbeddingEngine;

    constructor(
        storage: SQLiteStorage,
        episodic: EpisodicMemory,
        semantic: SemanticMemory,
        merger: AutoMerger,
        embedder: EmbeddingEngine
    ) {
        this.storage = storage;
        this.episodic = episodic;
        this.semantic = semantic;
        this.merger = merger;
        this.embedder = embedder;
    }

    /**
     * Run full consolidation pipeline.
     * This is like "sleep" for the AI — processes and organizes memories.
     */
    async run(): Promise<ConsolidationResult> {
        logger.info('Starting memory consolidation...');

        let episodesProcessed = 0;
        let factsExtracted = 0;
        let patternsIdentified = 0;
        let memoriesArchived = 0;
        let memoriesDeleted = 0;
        let tokensFreed = 0;

        // Step 1: Summarize old episodes (progressive summarization)
        const summarized = await this.episodic.summarizeOldEpisodes();
        episodesProcessed += summarized;

        // Step 2: Extract facts from recent episodes → semantic memory
        const recentEpisodes = this.episodic.getRecent(50);
        for (const episode of recentEpisodes) {
            const facts = this.extractFacts(episode.content);
            for (const fact of facts) {
                // Check if fact already exists (deduplication)
                const isDuplicate = await this.isDuplicateFact(fact);
                if (!isDuplicate) {
                    await this.semantic.storeFact(fact, ['auto-extracted'], 0.6);
                    factsExtracted++;
                }
            }
        }

        // Step 3: Merge related files
        await this.merger.runFullMerge('episodes');

        // Step 4: Deduplicate semantic memories
        const deduped = await this.deduplicateSemanticMemories();
        memoriesDeleted += deduped;

        // Step 5: Identify patterns → procedural memory
        // (simple heuristic: if similar queries appear > 3 times, extract as pattern)
        // This is a placeholder for more sophisticated pattern detection
        patternsIdentified = 0; // TODO: implement pattern extraction

        logger.info(
            `Consolidation complete: ${episodesProcessed} episodes, ${factsExtracted} facts, ${memoriesDeleted} deduped`
        );

        return {
            episodesProcessed,
            factsExtracted,
            patternsIdentified,
            memoriesArchived,
            memoriesDeleted,
            tokensFreed,
        };
    }

    // ----------------------------------------------------------
    // Fact Extraction
    // ----------------------------------------------------------

    /**
     * Simple fact extraction from text.
     * Extracts statements that look like declarative facts.
     */
    private extractFacts(content: string): string[] {
        const facts: string[] = [];
        const lines = content.split('\n').filter((l) => l.trim().length > 10);

        for (const line of lines) {
            const cleaned = line.replace(/^[-*]\s+/, '').trim();

            // Skip questions and commands
            if (cleaned.endsWith('?')) continue;
            if (cleaned.startsWith('ช่วย') || cleaned.startsWith('help')) continue;

            // Look for declarative statements
            const declarativePatterns = [
                /(?:is|are|was|were|has|have|means|refers to)/i,
                /(?:คือ|เป็น|มี|ใช้|หมายถึง|ต้อง|ควร)/,
                /(?:prefer|like|want|need|use|always|never)/i,
                /(?:ชอบ|ต้องการ|ใช้เสมอ|ไม่เคย)/,
            ];

            for (const pattern of declarativePatterns) {
                if (pattern.test(cleaned) && cleaned.length > 20 && cleaned.length < 300) {
                    facts.push(cleaned);
                    break;
                }
            }
        }

        return facts.slice(0, 10); // Limit to 10 facts per episode
    }

    // ----------------------------------------------------------
    // Deduplication
    // ----------------------------------------------------------

    /**
     * Check if a fact is already stored (similarity > threshold).
     */
    private async isDuplicateFact(fact: string): Promise<boolean> {
        const factEmbedding = await this.embedder.embedQuery(fact);
        const allEmbeddings = this.storage.getAllEmbeddings();

        for (const existing of allEmbeddings) {
            const chunk = this.storage.getChunk(existing.chunkId);
            if (!chunk || chunk.tier !== MemoryTier.Semantic) continue;

            const sim = cosineSimilarity(factEmbedding, existing.embedding);
            if (sim >= CONSOLIDATION_CONFIG.deduplicationThreshold) {
                return true;
            }
        }

        return false;
    }

    /**
     * Find and remove duplicate semantic memories.
     */
    private async deduplicateSemanticMemories(): Promise<number> {
        const chunks = this.storage.getChunksByTier(MemoryTier.Semantic, 1000);
        const embeddings = this.storage.getAllEmbeddings();

        const embeddingMap = new Map<string, Float32Array>();
        for (const e of embeddings) {
            embeddingMap.set(e.chunkId, e.embedding);
        }

        const toDelete = new Set<string>();

        for (let i = 0; i < chunks.length; i++) {
            if (toDelete.has(chunks[i].id)) continue;
            const embA = embeddingMap.get(chunks[i].id);
            if (!embA) continue;

            for (let j = i + 1; j < chunks.length; j++) {
                if (toDelete.has(chunks[j].id)) continue;
                const embB = embeddingMap.get(chunks[j].id);
                if (!embB) continue;

                const sim = cosineSimilarity(embA, embB);
                if (sim >= CONSOLIDATION_CONFIG.deduplicationThreshold) {
                    // Keep the one with higher importance
                    if (chunks[i].importanceScore >= chunks[j].importanceScore) {
                        toDelete.add(chunks[j].id);
                    } else {
                        toDelete.add(chunks[i].id);
                    }
                }
            }
        }

        for (const id of toDelete) {
            this.storage.deleteChunk(id);
        }

        if (toDelete.size > 0) {
            logger.info(`Deduplicated ${toDelete.size} semantic memories`);
        }

        return toDelete.size;
    }
}
