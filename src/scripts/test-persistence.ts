
import { OpenClawMemory } from '../index';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load env (optional)
dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_PATH = './memory/test-persistence.db';

async function main() {
    console.log('💾 Testing Persistent Configuration (Value Persistence Only)...\n');

    // Clean up old test DB if exists
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

    // --- PHASE 1: INITIAL SETTING ---
    console.log('1. Phase 1: Initializing with DUMMY keys...');
    const memory1 = new OpenClawMemory({
        dbPath: DB_PATH,
        openaiApiKey: 'initial-dummy-key',
        logLevel: 'error'
    });

    console.log('\n2. Updating to PERSISTENT dummy keys (Saving to DB)...');
    await memory1.updateConfig({
        openaiApiKey: 'persistent-key-from-db',
        openaiBaseUrl: 'https://custom-proxy.com/v1',
        logLevel: 'warn'
    });

    console.log('   Closing memory1...');
    memory1.close();

    console.log('\n------------------------------------------------');

    // --- PHASE 2: PERSISTENCE CHECK ---
    console.log('3. Phase 2: Initializing NEW instance with INITIAL dummy keys...');
    console.log('   (It should automatically load the PERSISTENT keys from DB)');
    const memory2 = new OpenClawMemory({
        dbPath: DB_PATH,
        openaiApiKey: 'initial-dummy-key', // This should be overridden by DB
        logLevel: 'error'
    });

    // Check internal config state (using any to access protected member)
    const currentConfig = (memory2 as any).config;
    console.log('\n🔍 Current Config in new instance:');
    console.log(`   ApiKey:   ${currentConfig.openaiApiKey}`);
    console.log(`   BaseUrl:  ${currentConfig.openaiBaseUrl}`);
    console.log(`   LogLevel: ${currentConfig.logLevel}`);

    if (
        currentConfig.openaiApiKey === 'persistent-key-from-db' &&
        currentConfig.openaiBaseUrl === 'https://custom-proxy.com/v1' &&
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
