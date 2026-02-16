// ============================================================
// OpenClaw Memory System — Procedural Memory (Tier 4)
// ============================================================
// Stores skills, patterns, and learned procedures.

import { SQLiteStorage } from '../storage/sqlite';
import { MemoryChunk, MemoryTier } from '../types';
import { EmbeddingEngine } from '../embedding/embedder';
import { logger } from '../utils/logger';

export interface Procedure {
    name: string;
    description: string;
    steps: string[];
    triggerPattern: string;  // when to use this procedure
    successRate: number;     // 0.0 - 1.0 based on reinforcement
    usageCount: number;
}

export class ProceduralMemory {
    private storage: SQLiteStorage;
    private embedder: EmbeddingEngine;

    constructor(storage: SQLiteStorage, embedder: EmbeddingEngine) {
        this.storage = storage;
        this.embedder = embedder;
    }

    // ----------------------------------------------------------
    // Store Procedures
    // ----------------------------------------------------------

    /** Store a new procedure/skill */
    async storeProcedure(procedure: Procedure): Promise<MemoryChunk> {
        const content = this.formatProcedure(procedure);
        const chunk = this.storage.insertChunk({
            content,
            tier: MemoryTier.Procedural,
            tags: ['procedure', procedure.name],
            importanceScore: 0.7,
        });

        // Generate embedding
        await this.embedder.getEmbedding(chunk.id, content);

        logger.info(`Stored procedure: ${procedure.name}`);
        return chunk;
    }

    /** Store a learned pattern */
    async storePattern(
        trigger: string,
        action: string,
        tags: string[] = []
    ): Promise<MemoryChunk> {
        const content = `## Pattern\n**When:** ${trigger}\n**Then:** ${action}`;
        const chunk = this.storage.insertChunk({
            content,
            tier: MemoryTier.Procedural,
            tags: ['pattern', ...tags],
            importanceScore: 0.6,
        });

        await this.embedder.getEmbedding(chunk.id, content);
        logger.info(`Stored pattern: ${trigger} → ${action}`);
        return chunk;
    }

    // ----------------------------------------------------------
    // Retrieval
    // ----------------------------------------------------------

    /** Get all active procedures */
    getAll(): MemoryChunk[] {
        return this.storage.getChunksByTier(MemoryTier.Procedural, 100);
    }

    /** Parse a stored chunk back into a Procedure object */
    parseProcedure(chunk: MemoryChunk): Procedure | null {
        try {
            const lines = chunk.content.split('\n');
            const name = (lines.find((l) => l.startsWith('## Procedure:'))?.replace('## Procedure:', '').trim()) ?? 'Unknown';
            const desc = (lines.find((l) => l.startsWith('**Description:**'))?.replace('**Description:**', '').trim()) ?? '';
            const trigger = (lines.find((l) => l.startsWith('**Trigger:**'))?.replace('**Trigger:**', '').trim()) ?? '';

            const stepsStart = lines.findIndex((l) => l.startsWith('**Steps:**'));
            const steps: string[] = [];
            if (stepsStart >= 0) {
                for (let i = stepsStart + 1; i < lines.length; i++) {
                    const stepMatch = lines[i].match(/^\d+\.\s+(.+)$/);
                    if (stepMatch) steps.push(stepMatch[1]);
                    else if (lines[i].trim() && !lines[i].startsWith('-')) break;
                }
            }

            return {
                name,
                description: desc,
                steps,
                triggerPattern: trigger,
                successRate: chunk.importanceScore,
                usageCount: chunk.accessCount,
            };
        } catch {
            return null;
        }
    }

    // ----------------------------------------------------------
    // Reinforcement
    // ----------------------------------------------------------

    /** Reinforce a procedure (increase importance/success rate) */
    reinforce(chunkId: string, positive = true): void {
        const chunk = this.storage.getChunk(chunkId);
        if (!chunk) return;

        const delta = positive ? 0.05 : -0.05;
        const newScore = Math.max(0.1, Math.min(1.0, chunk.importanceScore + delta));

        this.storage.updateChunk(chunkId, { importanceScore: newScore });
        this.storage.touchChunk(chunkId);

        logger.debug(
            `Reinforced procedure ${chunkId}: ${chunk.importanceScore.toFixed(2)} → ${newScore.toFixed(2)}`
        );
    }

    // ----------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------

    private formatProcedure(p: Procedure): string {
        const steps = p.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
        return [
            `## Procedure: ${p.name}`,
            `**Description:** ${p.description}`,
            `**Trigger:** ${p.triggerPattern}`,
            `**Steps:**`,
            steps,
        ].join('\n');
    }
}
