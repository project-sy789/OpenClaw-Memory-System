// ============================================================
// OpenClaw Memory System — Decay Manager
// ============================================================
// Implements Ebbinghaus-inspired forgetting curve with spaced repetition.

import { SQLiteStorage } from '../storage/sqlite';
import { DECAY_CONFIG } from '../config';
import { DecayResult } from '../types';
import { logger } from '../utils/logger';

export class DecayManager {
    private storage: SQLiteStorage;
    private retentionRate: number;

    constructor(storage: SQLiteStorage, retentionRate = 0.95) {
        this.storage = storage;
        this.retentionRate = retentionRate;
    }

    /**
     * Apply decay to all memories.
     *
     * Formula (Ebbinghaus-inspired):
     *   decay_score = current_score × retention_rate^(days_since_access)
     *
     * When a memory is accessed, its decay timer resets (spaced repetition).
     */
    run(): DecayResult {
        logger.info('Running memory decay...');

        // Step 1: Apply decay formula
        const decayedCount = this.storage.applyDecay(this.retentionRate);

        // Step 2: Archive memories below archive threshold
        const archived = this.storage.getDecayedChunks(DECAY_CONFIG.archiveThreshold);
        let archivedCount = 0;
        let tokensFreed = 0;

        for (const chunk of archived) {
            // Don't archive procedural memories (skills last forever)
            if (chunk.tier === 'procedural') continue;

            // Mark as archived by setting very low score
            this.storage.updateChunk(chunk.id, { decayScore: 0.05 });
            archivedCount++;
        }

        // Step 3: Delete memories below delete threshold
        const deleteCount = this.storage.purgeDecayed(DECAY_CONFIG.deleteThreshold);
        tokensFreed += deleteCount * 50; // rough estimate

        logger.info(
            `Decay complete: ${decayedCount} decayed, ${archivedCount} archived, ${deleteCount} deleted`
        );

        return {
            memoriesDecayed: decayedCount,
            memoriesArchived: archivedCount,
            memoriesDeleted: deleteCount,
            tokensFreed,
        };
    }
}
