/**
 * OpenClaw Memory System - Import/Export Utility
 * 
 * Export all memories to JSON
 * Import memories from JSON
 * 
 * Usage:
 *   node dist/export.js export
 *   node dist/export.js import <file.json>
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.MEMORY_DIR 
    ? join(process.env.MEMORY_DIR, 'openclaw-memory.db')
    : join(__dirname, 'memory', 'openclaw-memory.db');

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
    console.log(`
🧠 OpenClaw Memory - Import/Export

Usage:
  node dist/export.js export [output.json]
  node dist/export.js import <input.json>
  
Examples:
  node dist/export.js export backup.json
  node dist/export.js import backup.json
`);
    process.exit(1);
}

const db = new Database(DB_PATH);

if (command === 'export') {
    const outputFile = args[1] || 'memory-export.json';
    
    console.log(`📤 Exporting to ${outputFile}...`);
    
    // Get all chunks
    const chunks = db.prepare(`
        SELECT id, tier, content, importance, decay_score, 
               created_at, updated_at, tags, metadata
        FROM memory_chunks
    `).all();
    
    // Get all episodes
    const episodes = db.prepare(`
        SELECT id, session_id, summary, message_count, 
               created_at, messages
        FROM episodes
    `).all();
    
    // Get knowledge edges
    const edges = db.prepare(`
        SELECT id, source_id, target_id, relation, weight, created_at
        FROM knowledge_edges
    `).all();
    
    const exportData = {
        version: '1.1.0',
        exportedAt: new Date().toISOString(),
        chunks,
        episodes,
        knowledgeEdges: edges,
    };
    
    writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
    console.log(`✅ Exported ${chunks.length} chunks, ${episodes.length} episodes`);
    console.log(`💾 Saved to: ${outputFile}`);
    
} else if (command === 'import') {
    const inputFile = args[1];
    
    if (!inputFile) {
        console.log('❌ Please specify input file');
        process.exit(1);
    }
    
    console.log(`📥 Importing from ${inputFile}...`);
    
    const data = JSON.parse(readFileSync(inputFile, 'utf-8'));
    
    let chunksImported = 0;
    let episodesImported = 0;
    
    // Import chunks
    if (data.chunks && Array.isArray(data.chunks)) {
        const insertChunk = db.prepare(`
            INSERT OR REPLACE INTO memory_chunks 
            (id, tier, content, importance, decay_score, created_at, updated_at, tags, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const chunk of data.chunks) {
            insertChunk.run(
                chunk.id,
                chunk.tier,
                chunk.content,
                chunk.importance,
                chunk.decay_score,
                chunk.created_at,
                chunk.updated_at,
                chunk.tags,
                chunk.metadata
            );
            chunksImported++;
        }
    }
    
    // Import episodes
    if (data.episodes && Array.isArray(data.episodes)) {
        const insertEpisode = db.prepare(`
            INSERT OR REPLACE INTO episodes
            (id, session_id, summary, message_count, created_at, messages)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        for (const ep of data.episodes) {
            insertEpisode.run(
                ep.id,
                ep.session_id,
                ep.summary,
                ep.message_count,
                ep.created_at,
                ep.messages
            );
            episodesImported++;
        }
    }
    
    console.log(`✅ Imported ${chunksImported} chunks, ${episodesImported} episodes`);
    
} else {
    console.log(`Unknown command: ${command}`);
}

db.close();
