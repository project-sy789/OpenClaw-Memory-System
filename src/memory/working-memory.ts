// ============================================================
// OpenClaw Memory System — Working Memory (Tier 1)
// ============================================================
// In-memory ring buffer for current session context.

import { WorkingMemoryEntry, SessionState } from '../types';
import { estimateTokens } from '../utils/tokenizer';
import { logger } from '../utils/logger';

export class WorkingMemory {
    private maxSize: number;
    private maxTokens: number;
    private entries: WorkingMemoryEntry[] = [];
    private sessionId: string | null = null;
    private startedAt: string | null = null;
    private totalTokens = 0;

    constructor(maxSize = 20, maxTokens = 8000) {
        this.maxSize = maxSize;
        this.maxTokens = maxTokens;
    }

    // ----------------------------------------------------------
    // Session Management
    // ----------------------------------------------------------

    startSession(sessionId: string): void {
        this.sessionId = sessionId;
        this.startedAt = new Date().toISOString();
        this.entries = [];
        this.totalTokens = 0;
        logger.info(`Working memory session started: ${sessionId}`);
    }

    getSessionState(): SessionState | null {
        if (!this.sessionId) return null;
        return {
            sessionId: this.sessionId,
            startedAt: this.startedAt!,
            messageCount: this.entries.length,
            tokenCount: this.totalTokens,
            workingMemory: [...this.entries],
        };
    }

    isActive(): boolean {
        return this.sessionId !== null;
    }

    // ----------------------------------------------------------
    // Add / Evict
    // ----------------------------------------------------------

    add(role: 'user' | 'assistant' | 'system', content: string): void {
        const tokenCount = estimateTokens(content);
        const entry: WorkingMemoryEntry = {
            role,
            content,
            tokenCount,
            timestamp: new Date().toISOString(),
        };

        this.entries.push(entry);
        this.totalTokens += tokenCount;

        // Evict oldest entries if over limits
        while (this.entries.length > this.maxSize) {
            const evicted = this.entries.shift()!;
            this.totalTokens -= evicted.tokenCount;
            logger.debug(
                `Evicted oldest entry (${evicted.role}, ${evicted.tokenCount} tokens)`
            );
        }

        while (this.totalTokens > this.maxTokens && this.entries.length > 1) {
            const evicted = this.entries.shift()!;
            this.totalTokens -= evicted.tokenCount;
            logger.debug(
                `Evicted entry for token budget (${evicted.role}, ${evicted.tokenCount} tokens)`
            );
        }
    }

    // ----------------------------------------------------------
    // Retrieval
    // ----------------------------------------------------------

    /** Get all entries in order */
    getAll(): WorkingMemoryEntry[] {
        return [...this.entries];
    }

    /** Get entries within a token budget */
    getWithinBudget(maxTokens: number): WorkingMemoryEntry[] {
        const result: WorkingMemoryEntry[] = [];
        let tokens = 0;

        // Start from most recent
        for (let i = this.entries.length - 1; i >= 0; i--) {
            if (tokens + this.entries[i].tokenCount > maxTokens) break;
            result.unshift(this.entries[i]);
            tokens += this.entries[i].tokenCount;
        }

        return result;
    }

    /** Get a summary of the working memory */
    getSummary(): string {
        if (this.entries.length === 0) return '';

        const lines: string[] = [];
        for (const entry of this.entries) {
            const preview =
                entry.content.length > 100
                    ? entry.content.slice(0, 100) + '…'
                    : entry.content;
            lines.push(`[${entry.role}] ${preview}`);
        }
        return lines.join('\n');
    }

    // ----------------------------------------------------------
    // Flush (for session end)
    // ----------------------------------------------------------

    /** Get all entries and clear the buffer. Used when flushing to episodic memory. */
    flush(): {
        sessionId: string;
        entries: WorkingMemoryEntry[];
    } {
        const result = {
            sessionId: this.sessionId ?? 'unknown',
            entries: [...this.entries],
        };

        this.entries = [];
        this.totalTokens = 0;
        this.sessionId = null;
        this.startedAt = null;

        logger.info(`Working memory flushed: ${result.entries.length} entries`);
        return result;
    }

    // ----------------------------------------------------------
    // Stats
    // ----------------------------------------------------------

    getStats(): {
        entryCount: number;
        totalTokens: number;
        maxSize: number;
        maxTokens: number;
        utilization: number;
    } {
        return {
            entryCount: this.entries.length,
            totalTokens: this.totalTokens,
            maxSize: this.maxSize,
            maxTokens: this.maxTokens,
            utilization: this.maxTokens > 0 ? this.totalTokens / this.maxTokens : 0,
        };
    }
}
