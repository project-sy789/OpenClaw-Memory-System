
import { OpenClawMemory } from '../index';
import { MockAIProvider } from './mock-provider';
import { logger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

async function testDelegation() {
    logger.info('🧪 Testing AI Delegation Architecture...');

    const testDir = path.join(process.cwd(), 'test-memory-delegated');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });

    // 1. Initialize with Mock Provider (No API Keys!)
    const memory = new OpenClawMemory({
        aiProvider: new MockAIProvider(),
        memoryDir: testDir,
        logLevel: 'debug'
    });

    try {
        // 2. Test Health Check
        const health = await memory.health();
        console.log('✅ Health Check (Delegated):', JSON.stringify(health, null, 2));

        // 3. Test Store (Triggers Embeddings via Mock)
        logger.info('Storing memory...');
        await memory.rememberFact('The host system handles all AI logic.', ['test', 'delegation']);

        // 4. Test Recall (Triggers Query Embedding via Mock)
        logger.info('Recalling memory...');
        const { context } = await memory.recall('how does AI logic work?');

        console.log('📄 Retrieved Context:');
        console.log(context);

        if (context.includes('host system')) {
            console.log('\n✨ SUCCESS: Memory system successfully delegated tasks to the host provider!');
        } else {
            console.error('\n❌ FAILURE: Memory retrieval failed.');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        memory.close();
    }
}

testDelegation();
