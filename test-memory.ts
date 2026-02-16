// Simple test script for OpenClaw Memory System
import { OpenClawMemory } from './src/index.js';
import { MinimaxProvider } from './src/providers/minimax.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('🧠 Testing OpenClaw Memory System...\n');

    // Create Minimax provider
    const minimax = new MinimaxProvider({
        apiKey: process.env.MINIMAX_API_KEY || '',
        baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1',
        embedModel: process.env.EMBEDDING_MODEL || 'embo-01',
    });

    // Check health
    console.log('📡 Checking AI Provider health...');
    const health = await minimax.checkHealth();
    console.log('   Health:', health);
    console.log('');

    // Create memory instance
    const memory = new OpenClawMemory({
        aiProvider: minimax,
        memoryDir: process.env.MEMORY_DIR || './memory',
        tokenBudget: parseInt(process.env.TOKEN_BUDGET || '4000'),
        embeddingModel: process.env.EMBEDDING_MODEL || 'embo-01',
    });

    // Test 1: Remember a fact
    console.log('💾 Test 1: Storing facts...');
    await memory.rememberFact('Boss likes Thai food', ['preference', 'food']);
    await memory.rememberFact('Boss works as developer', ['work', 'person']);
    await memory.rememberFact('Boss timezone is UTC+7', ['preference', 'time']);
    console.log('   ✅ Stored 3 facts\n');

    // Test 2: Start session and add messages
    console.log('💬 Test 2: Session management...');
    memory.startSession('test-session-1');
    memory.addMessage('user', 'Hello Arina!');
    memory.addMessage('assistant', 'Hi Boss! How can I help you?');
    memory.addMessage('user', 'Remember I love coffee');
    await memory.endSession();
    console.log('   ✅ Session saved\n');

    // Test 3: Recall facts
    console.log('🔍 Test 3: Recall facts...');
    const result = await memory.recall('what does boss like?');
    console.log('   Result:', JSON.stringify(result, null, 2));
    console.log('');

    // Test 4: Get stats
    console.log('📊 Test 4: Memory stats...');
    const stats = await memory.getStats();
    console.log('   Stats:', JSON.stringify(stats, null, 2));
    console.log('');

    console.log('✅ All tests passed!');
}

main().catch(console.error);
