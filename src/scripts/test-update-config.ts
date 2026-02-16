
import { OpenClawMemory } from '../index';
import { MockAIProvider } from './mock-provider';
import { logger } from '../utils/logger';

async function main() {
    console.log('🔄 Testing Dynamic Config Update (Delegated AI Architecture)...\n');

    // 1. Initialize with Mock Provider
    console.log('1. Initializing memory system...');
    const memory = new OpenClawMemory({
        aiProvider: new MockAIProvider(),
        logLevel: 'error',
        tokenBudget: 4000
    });

    // 2. Check initial state
    const initialConfig = (memory as any).config;
    console.log(`   Initial TokenBudget: ${initialConfig.tokenBudget}`);

    // 3. Update to New Config (Non-AI fields)
    console.log('\n2. Updating configuration (tokenBudget: 8000)...');
    await memory.updateConfig({
        tokenBudget: 8000,
        logLevel: 'info'
    });

    // 4. Verify update
    const updatedConfig = (memory as any).config;
    console.log(`   Updated TokenBudget: ${updatedConfig.tokenBudget}`);

    if (updatedConfig.tokenBudget === 8000) {
        console.log('\n✅ Success! Configuration updated dynamically.');
    } else {
        console.error('\n❌ Failed: Configuration was not updated.');
        process.exit(1);
    }

    // 5. Check health
    console.log('\n3. Verifying system health after update...');
    const health = await memory.health();
    if (health.status === 'ok') {
        console.log('✅ System is healthy.');
    } else {
        console.error('❌ System is unhealthy.', health);
    }

    memory.close();
}

main().catch(console.error);
