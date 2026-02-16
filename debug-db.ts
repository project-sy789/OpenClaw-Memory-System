// Debug: Check embeddings and recall
import Database from 'better-sqlite3';

const db = new Database('./memory/openclaw-memory.db');

console.log('📊 Embeddings:');
const embeddings = db.prepare('SELECT COUNT(*) as count FROM embeddings').get();
console.log(`   Total: ${(embeddings as any).count}`);

console.log('\n📊 Schema:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach((t: any) => console.log(`   - ${t.name}`));

db.close();
