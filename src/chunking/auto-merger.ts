// ============================================================
// OpenClaw Memory System — Auto-Merger
// ============================================================
// Merges related memory files to improve embedding quality.

import { MarkdownManager, MarkdownFile } from '../storage/markdown';
import { EmbeddingEngine } from '../embedding/embedder';
import { cosineSimilarity } from '../embedding/similarity';
import { MergeResult } from '../types';
import { logger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

export class AutoMerger {
    private markdown: MarkdownManager;
    private embedder: EmbeddingEngine;
    private mergeThreshold: number;

    constructor(
        markdown: MarkdownManager,
        embedder: EmbeddingEngine,
        mergeThreshold = 0.85
    ) {
        this.markdown = markdown;
        this.embedder = embedder;
        this.mergeThreshold = mergeThreshold;
    }

    // ----------------------------------------------------------
    // Strategy 1: Merge by Date
    // ----------------------------------------------------------
    // Merge session files from the same date into a single file.

    async mergeByDate(subDir = 'episodes'): Promise<MergeResult[]> {
        const files = this.markdown.listFiles(subDir);
        const results: MergeResult[] = [];

        // Group files by date
        const dateGroups = new Map<string, string[]>();
        for (const file of files) {
            const parsed = this.markdown.readFile(file);
            const date =
                (parsed.frontmatter.date as string) ??
                this.extractDateFromFilename(parsed.filename);
            if (!date) continue;

            const group = dateGroups.get(date) ?? [];
            group.push(file);
            dateGroups.set(date, group);
        }

        // Merge groups with multiple files
        for (const [date, groupFiles] of dateGroups) {
            if (groupFiles.length <= 1) continue;

            const outputFilename = `merged-${date}.md`;
            const outputPath = this.markdown.mergeFiles(
                groupFiles,
                outputFilename,
                {
                    type: 'merged-session',
                    date,
                    source_count: groupFiles.length,
                    merged_at: new Date().toISOString(),
                },
                subDir
            );

            // Count original chunks
            let originalChunks = 0;
            for (const f of groupFiles) {
                const parsed = this.markdown.readFile(f);
                originalChunks += parsed.sections.length;
            }

            // Remove original files
            for (const f of groupFiles) {
                if (f !== outputPath) {
                    fs.unlinkSync(f);
                }
            }

            const merged = this.markdown.readFile(outputPath);
            results.push({
                mergedFiles: groupFiles.map((f) => path.basename(f)),
                outputFile: outputFilename,
                originalChunks,
                resultChunks: merged.sections.length,
                strategy: 'date',
            });

            logger.info(
                `Date merge: ${groupFiles.length} files → ${outputFilename}`
            );
        }

        return results;
    }

    // ----------------------------------------------------------
    // Strategy 2: Merge by Topic Similarity
    // ----------------------------------------------------------
    // Find and merge files with high semantic similarity.

    async mergeByTopic(subDir?: string): Promise<MergeResult[]> {
        const files = this.markdown.listFiles(subDir);
        if (files.length < 2) return [];

        const results: MergeResult[] = [];

        // Generate embeddings for each file's content
        const fileEmbeddings: {
            file: string;
            filename: string;
            embedding: Float32Array;
            parsed: MarkdownFile;
        }[] = [];

        for (const file of files) {
            const parsed = this.markdown.readFile(file);
            // Use first 1000 chars as representative content
            const repr = parsed.content.slice(0, 1000);
            const embedding = await this.embedder.embedQuery(repr);
            fileEmbeddings.push({
                file,
                filename: parsed.filename,
                embedding,
                parsed,
            });
        }

        // Find pairs with high similarity
        const merged = new Set<string>();
        for (let i = 0; i < fileEmbeddings.length; i++) {
            if (merged.has(fileEmbeddings[i].file)) continue;

            const group = [fileEmbeddings[i]];

            for (let j = i + 1; j < fileEmbeddings.length; j++) {
                if (merged.has(fileEmbeddings[j].file)) continue;

                const sim = cosineSimilarity(
                    fileEmbeddings[i].embedding,
                    fileEmbeddings[j].embedding
                );

                if (sim >= this.mergeThreshold) {
                    group.push(fileEmbeddings[j]);
                    merged.add(fileEmbeddings[j].file);
                }
            }

            if (group.length > 1) {
                merged.add(fileEmbeddings[i].file);
                const groupFiles = group.map((g) => g.file);
                const outputFilename = `topic-merge-${Date.now()}.md`;

                const outputPath = this.markdown.mergeFiles(
                    groupFiles,
                    outputFilename,
                    {
                        type: 'topic-merge',
                        source_count: groupFiles.length,
                        merged_at: new Date().toISOString(),
                    },
                    subDir
                );

                let originalChunks = 0;
                for (const g of group) {
                    originalChunks += g.parsed.sections.length;
                }

                // Remove original files
                for (const f of groupFiles) {
                    if (f !== outputPath) {
                        try {
                            fs.unlinkSync(f);
                        } catch {
                            // file might already be removed
                        }
                    }
                }

                const mergedFile = this.markdown.readFile(outputPath);
                results.push({
                    mergedFiles: group.map((g) => g.filename),
                    outputFile: outputFilename,
                    originalChunks,
                    resultChunks: mergedFile.sections.length,
                    strategy: 'topic',
                });

                logger.info(
                    `Topic merge: ${group.length} files → ${outputFilename} (similarity ≥ ${this.mergeThreshold})`
                );
            }
        }

        return results;
    }

    // ----------------------------------------------------------
    // Combined Merge Pipeline
    // ----------------------------------------------------------

    async runFullMerge(subDir = 'episodes'): Promise<MergeResult[]> {
        logger.info('Starting full merge pipeline...');

        // Step 1: Date merge
        const dateResults = await this.mergeByDate(subDir);
        logger.info(`Date merge: ${dateResults.length} groups merged`);

        // Step 2: Topic merge (on already date-merged files)
        const topicResults = await this.mergeByTopic(subDir);
        logger.info(`Topic merge: ${topicResults.length} groups merged`);

        return [...dateResults, ...topicResults];
    }

    // ----------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------

    private extractDateFromFilename(filename: string): string | null {
        const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : null;
    }
}
