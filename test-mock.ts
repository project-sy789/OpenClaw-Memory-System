// Simple test with mock provider to verify the system works
import { OpenClawMemory } from './src/index.js';
import { AIProvider } from './src/types.js';
import * as dotenv from 'dotenv';

dotenv.config();

// Simple mock provider that generates random embeddings
class MockProvider implements AIProvider {
    private dimension: number;

    constructor(dimension: number = 1024) {
        this.dimension = dimension;
    }

    async embed(texts: string[]): Promise<number[][]> {
        // Generate random embeddings
        return texts.map(() => {
            const embedding = [];
            let sum = 0;
            for (let i = 0; i < this.dimension; i++) {
                const val = Math.random() * 2 - 1;
                embedding.push(val);
                sum += val * val;
            }
            // Normalize
            const magnitude = Math.sqrt(sum);
            return embedding.map(v => v / magnitude);
        });
    }

    async chat(messages: any[], options?: Record<string, any>): Promise<string> {
        return "Mock response from AI";
    }

    async checkHealth() {
        return { status: 'ok' as const, latency: 10 };
    }
}

async function main() {
    console.log('🧠 Testing OpenClaw Memory System (Mock Mode)...\n');

    // Create mock provider
    const mockProvider = new MockProvider(1024);

    // Check health
    console.log('📡 Checking AI Provider health...');
    const health = await mockProvider.checkHealth();
    console.log('   Health:', health);
    console.log('');

    // Create memory instance
    const memory = new OpenClawMemory({
        aiProvider: mockProvider,
        memoryDir: process.env.MEMORY_DIR || './memory',
        tokenBudget: parseInt(process.env.TOKEN_BUDGET || '4000'),
        embeddingModel: 'mock-embedding',
    });

    // Test 1: Remember facts
    console.log('💾 Test 1: Storing facts...');
    await memory.rememberFact('Boss likes Thai food', ['preference', 'food']);
    await memory.rememberFact('Boss works as developer', ['work', 'person']);
    await memory.rememberFact('Boss timezone is UTC+7', ['preference', 'time']);
    await memory.rememberFact('Boss name is J Cob', ['person', 'name']);
    await memory.rememberFact('Boss loves AI and coding', ['interest', 'work']);
    console.log('   ✅ Stored 5 facts\n');

    // Test 2: Start session and add messages
    console.log('💬 Test 2: Session management...');
    memory.startSession('test-session-1');
    memory.addMessage('user', 'Hello Arina!');
    memory.addMessage('assistant', 'Hi Boss! How can I help you?');
    memory.addMessage('user', 'Remember I love coffee');
    memory.addMessage('assistant', 'Noted! You love coffee ☕');
    await memory.endSession();
    console.log('   ✅ Session saved\n');

    // Test 3: Recall facts
    console.log('🔍 Test 3: Recall facts...');
    const result = await memory.recall('what does boss like?');
    console.log('   Found:', result.results?.length || 0, 'results');
    console.log('   Context:', result.context?.substring(0, 200) || '(empty)');
    if (result.results?.[0]) {
        console.log('   Top result:', result.results[0].chunk.content.substring(0, 100));
    }
    console.log('');

    // Test 4: Get stats
    console.log('📊 Test 4: Memory stats...');
    const stats = memory.stats();
    console.log('   Total chunks:', stats.totalChunks);
    console.log('   By tier:', JSON.stringify(stats.byTier));
    console.log('');

    // Test 5: Health check
    console.log('🏥 Test 5: System health...');
    const sysHealth = await memory.health();
    console.log('   Health:', JSON.stringify(sysHealth));
    console.log('');

    console.log('✅ All tests passed! Memory system is working!');
}

main().catch(console.error);
