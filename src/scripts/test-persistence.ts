import { OpenClawMemory } from '../index';
import { MockAIProvider } from './mock-provider';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = './memory/test-persistence.db';

async function main() {
    console.log('💾 Testing Persistent Configuration (Delegated AI Architecture)...\n');

    // Clean up old test DB if exists
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

    // --- PHASE 1: INITIAL SETTING ---
    console.log('1. Phase 1: Initializing with Mock Provider...');
    const memory1 = new OpenClawMemory({
        dbPath: DB_PATH,
        aiProvider: new MockAIProvider(),
        logLevel: 'error'
    });

    console.log('\n2. Updating PERSISTENT settings (Saving to DB)...');
    await memory1.updateConfig({
        tokenBudget: 8000,
        logLevel: 'warn'
    });

    console.log('   Closing memory1...');
    memory1.close();

    console.log('\n------------------------------------------------');

    // --- PHASE 2: PERSISTENCE CHECK ---
    console.log('3. Phase 2: Initializing NEW instance with default config...');
    console.log('   (It should automatically load the PERSISTENT settings from DB)');
    const memory2 = new OpenClawMemory({
        dbPath: DB_PATH,
        aiProvider: new MockAIProvider(),
        logLevel: 'error' // This should be overridden by DB ('warn')
    });

    // Check internal config state (using any to access protected member)
    const currentConfig = (memory2 as any).config;
    console.log('\n🔍 Current Config in new instance:');
    console.log(`   TokenBudget: ${currentConfig.tokenBudget}`);
    console.log(`   LogLevel:    ${currentConfig.logLevel}`);

    if (
        currentConfig.tokenBudget === 8000 &&
        currentConfig.logLevel === 'warn'
    ) {
        console.log('\n✅ SUCCESS! Config persisted in SQLite and correctly reloaded.');
    } else {
        console.error('\n❌ FAILED: Config did not persist or reload properly.');
        process.exit(1);
    }

    memory2.close();
}

main().catch(console.error);
