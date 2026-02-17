// ============================================================
// OpenClaw Memory System — Meta-Memory (Tier 5)
// ============================================================
// Memory-about-memory: tracks retrieval patterns, co-access
// clusters, and tunes search weights automatically.

import { SQLiteStorage } from '../storage/sqlite';
import { RetrievalResult } from '../types';
import { logger } from '../utils/logger';

export interface MetaQueryEntry {
    query: string;
    resultCount: number;
    avgScore: number;
    bestSource: string | null;
    modeUsed: string;
    latencyMs: number;
}

export interface MetaInsights {
    totalQueries: number;
    avgResultCount: number;
    avgScore: number;
    topCoAccessPairs: { chunkA: string; chunkB: string; count: number }[];
    weightRecommendations: { source: string; weight: number; samples: number }[];
    queryHistory: { query: string; resultCount: number; avgScore: number; mode: string; createdAt: string }[];
    modeDistribution: Record<string, number>;
    healthReport: string;
}

export class MetaMemory {
    private storage: SQLiteStorage;

    constructor(storage: SQLiteStorage) {
        this.storage = storage;
    }

    // ----------------------------------------------------------
    // Record & Learn
    // ----------------------------------------------------------

    /**
     * Log a recall query and update co-access patterns + weight tuning.
     * Called automatically after every recall() operation.
     */
    logQuery(
        query: string,
        results: RetrievalResult[],
        modeUsed: string,
        latencyMs: number
    ): void {
        // 1. Log the query
        const avgScore = results.length > 0
            ? results.reduce((sum, r) => sum + r.score, 0) / results.length
            : 0;

        const bestSource = results.length > 0
            ? results.reduce((best, r) => r.score > best.score ? r : best, results[0]).source
            : null;

        this.storage.logMetaQuery({
            query,
            resultCount: results.length,
            avgScore,
            bestSource,
            modeUsed,
            latencyMs,
        });

        // 2. Record co-access patterns
        const chunkIds = results.map(r => r.chunk.id);
        this.storage.recordCoAccess(chunkIds);

        // 3. Update weight tuning per source
        for (const result of results) {
            if (result.vectorScore > 0) {
                this.storage.updateWeightTuning('vector', result.vectorScore);
            }
            if (result.keywordScore > 0) {
                this.storage.updateWeightTuning('keyword', result.keywordScore);
            }
            if (result.graphScore > 0) {
                this.storage.updateWeightTuning('graph', result.graphScore);
            }
            if ((result as any).brainScore > 0) {
                this.storage.updateWeightTuning('brain', (result as any).brainScore);
            }
        }

        logger.debug(
            `Meta-Memory logged query "${query.slice(0, 50)}..." → ${results.length} results, avg=${avgScore.toFixed(3)}, mode=${modeUsed}`
        );
    }

    // ----------------------------------------------------------
    // Insights & Reflection
    // ----------------------------------------------------------

    /** Get comprehensive meta-memory insights with health report */
    getInsights(): MetaInsights {
        const raw = this.storage.getMetaInsights();

        // Generate health report
        const healthReport = this.generateHealthReport(raw);

        return {
            ...raw,
            healthReport,
        };
    }

    /**
     * Get recommended search weights based on historical performance.
     * Returns weights normalized to sum to 1.0.
     */
    getRecommendedWeights(): { vector: number; keyword: number; graph: number; brain: number } {
        const raw = this.storage.getMetaInsights();
        const defaults = { vector: 0.5, keyword: 0.3, graph: 0.2, brain: 0 };

        if (raw.weightRecommendations.length === 0) return defaults;

        // Get raw weights from tuning data
        const rawWeights: Record<string, number> = {};
        let totalSamples = 0;
        for (const rec of raw.weightRecommendations) {
            rawWeights[rec.source] = rec.weight * rec.samples; // weighted average
            totalSamples += rec.samples;
        }

        if (totalSamples < 10) return defaults; // Not enough data yet

        // Normalize
        const total = Object.values(rawWeights).reduce((s, w) => s + w, 0);
        if (total === 0) return defaults;

        return {
            vector: (rawWeights['vector'] ?? 0) / total,
            keyword: (rawWeights['keyword'] ?? 0) / total,
            graph: (rawWeights['graph'] ?? 0) / total,
            brain: (rawWeights['brain'] ?? 0) / total,
        };
    }

    // ----------------------------------------------------------
    // Health Report
    // ----------------------------------------------------------

    private generateHealthReport(insights: Omit<MetaInsights, 'healthReport'>): string {
        const lines: string[] = [];
        lines.push('## 🧠 Memory Health Report');
        lines.push('');

        // Query activity
        if (insights.totalQueries === 0) {
            lines.push('📊 **No queries recorded yet.** Start using `recall()` to build insights.');
        } else {
            lines.push(`📊 **${insights.totalQueries} queries** recorded | Avg ${insights.avgResultCount.toFixed(1)} results/query | Avg score ${insights.avgScore.toFixed(3)}`);
        }

        // Mode distribution
        if (Object.keys(insights.modeDistribution).length > 0) {
            lines.push('');
            lines.push('### Search Mode Usage');
            for (const [mode, count] of Object.entries(insights.modeDistribution)) {
                const pct = ((count / insights.totalQueries) * 100).toFixed(0);
                lines.push(`- **${mode}**: ${count} queries (${pct}%)`);
            }
        }

        // Weight recommendations
        if (insights.weightRecommendations.length > 0) {
            lines.push('');
            lines.push('### Recommended Search Weights');
            for (const rec of insights.weightRecommendations) {
                lines.push(`- **${rec.source}**: ${rec.weight.toFixed(3)} (${rec.samples} samples)`);
            }
        }

        // Co-access hotspots
        if (insights.topCoAccessPairs.length > 0) {
            lines.push('');
            lines.push('### Knowledge Clusters');
            lines.push(`Found ${insights.topCoAccessPairs.length} frequently co-accessed pairs.`);
        }

        return lines.join('\n');
    }
}
