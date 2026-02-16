// ============================================================
// OpenClaw Memory System — Episodic Memory (Tier 2)
// ============================================================
// Stores conversation episodes with progressive summarization.

import { SQLiteStorage } from '../storage/sqlite';
import { MarkdownManager } from '../storage/markdown';
import { Episode, EpisodeInput, WorkingMemoryEntry } from '../types';
import { CONSOLIDATION_CONFIG } from '../config';
import { logger } from '../utils/logger';

export class EpisodicMemory {
    private storage: SQLiteStorage;
    private markdown: MarkdownManager;

    constructor(storage: SQLiteStorage, markdown: MarkdownManager) {
        this.storage = storage;
        this.markdown = markdown;
    }

    // ----------------------------------------------------------
    // Store Episodes
    // ----------------------------------------------------------

    /** Store a single episode */
    addEpisode(input: EpisodeInput): Episode {
        return this.storage.insertEpisode(input);
    }

    /** Store a batch of working memory entries as episodes */
    storeFromWorkingMemory(
        sessionId: string,
        entries: WorkingMemoryEntry[]
    ): Episode[] {
        const episodes: Episode[] = [];

        for (const entry of entries) {
            const episode = this.storage.insertEpisode({
                sessionId,
                role: entry.role,
                content: entry.content,
                importanceScore: this.estimateImportance(entry),
            });
            episodes.push(episode);
        }

        // Also flush to markdown file
        this.markdown.flushSession(
            sessionId,
            entries.map((e) => ({
                role: e.role,
                content: e.content,
                timestamp: e.timestamp,
            }))
        );

        logger.info(
            `Stored ${entries.length} episodes from session ${sessionId}`
        );
        return episodes;
    }

    // ----------------------------------------------------------
    // Retrieval
    // ----------------------------------------------------------

    /** Get episodes from a specific session */
    getSession(sessionId: string): Episode[] {
        return this.storage.getEpisodesBySession(sessionId);
    }

    /** Get recent episodes across all sessions */
    getRecent(limit = 50): Episode[] {
        return this.storage.getRecentEpisodes(limit);
    }

    /** Get recent context as formatted text */
    getRecentContext(limit = 10): string {
        const episodes = this.storage.getRecentEpisodes(limit);
        return episodes
            .map((e) => {
                const content = e.summary ?? e.content;
                return `[${e.role}] ${content}`;
            })
            .join('\n');
    }

    // ----------------------------------------------------------
    // Progressive Summarization
    // ----------------------------------------------------------

    /**
     * Summarize old episodes to reduce token usage.
     * - Day 1-7: Keep raw content
     * - Day 8-30: Summarize to key points
     * - Day 31+: Compress to 1-2 paragraphs
     *
     * Note: This uses a simple extractive approach.
     * For better quality, connect to an LLM.
     */
    async summarizeOldEpisodes(): Promise<number> {
        let summarized = 0;

        // Find episodes older than summarizeAfterDays that haven't been summarized
        const oldEpisodes = this.storage.getEpisodesOlderThan(
            CONSOLIDATION_CONFIG.summarizeAfterDays
        );

        for (const episode of oldEpisodes) {
            const summary = this.extractiveSummarize(episode.content);
            this.storage.updateEpisodeSummary(episode.id, summary);
            summarized++;
        }

        if (summarized > 0) {
            logger.info(`Summarized ${summarized} old episodes`);
        }

        return summarized;
    }

    // ----------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------

    /** Estimate importance of a working memory entry */
    private estimateImportance(entry: WorkingMemoryEntry): number {
        let score = 0.5;

        // User messages are slightly more important (they contain the task)
        if (entry.role === 'user') score += 0.1;

        // Longer messages tend to be more important
        if (entry.tokenCount > 100) score += 0.1;
        if (entry.tokenCount > 300) score += 0.1;

        // Messages containing questions are important
        if (entry.content.includes('?')) score += 0.05;

        // Messages with code blocks are important
        if (entry.content.includes('```')) score += 0.1;

        // Messages mentioning key terms
        const keywords = [
            'important',
            'critical',
            'remember',
            'always',
            'never',
            'preference',
            'สำคัญ',
            'จำไว้',
            'เสมอ',
        ];
        for (const kw of keywords) {
            if (entry.content.toLowerCase().includes(kw)) {
                score += 0.05;
            }
        }

        return Math.min(1.0, score);
    }

    /**
     * Simple extractive summarization:
     * Keep the first sentence, any sentences with keywords, and the last sentence.
     */
    private extractiveSummarize(content: string): string {
        const sentences = content
            .split(/(?<=[.!?。\n])\s+/)
            .filter((s) => s.trim().length > 0);

        if (sentences.length <= 3) return content;

        const importantKeywords = [
            'important',
            'key',
            'must',
            'should',
            'always',
            'never',
            'note',
            'remember',
            'todo',
            'สำคัญ',
            'ต้อง',
            'ควร',
            'จำ',
            'หมายเหตุ',
        ];

        const selected = new Set<number>();
        selected.add(0); // First sentence
        selected.add(sentences.length - 1); // Last sentence

        // Keep sentences with important keywords
        for (let i = 0; i < sentences.length; i++) {
            const lower = sentences[i].toLowerCase();
            for (const kw of importantKeywords) {
                if (lower.includes(kw)) {
                    selected.add(i);
                    break;
                }
            }
        }

        // Keep at most 5 sentences total
        const sorted = [...selected].sort((a, b) => a - b).slice(0, 5);
        return sorted.map((i) => sentences[i]).join(' ');
    }
}
