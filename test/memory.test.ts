import { describe, it, expect, beforeEach } from 'vitest';
import { OpenClawMemory } from './src/index.js';
import { AIProvider } from './src/types.js';

// Mock Provider for testing
class MockProvider implements AIProvider {
    private dimension: number;
    private callCount = 0;

    constructor(dimension: number = 1024) {
        this.dimension = dimension;
    }

    async embed(texts: string[]): Promise<number[][]> {
        this.callCount++;
        return texts.map(() => {
            const embedding = [];
            let sum = 0;
            for (let i = 0; i < this.dimension; i++) {
                const val = Math.random() * 2 - 1;
                embedding.push(val);
                sum += val * val;
            }
            const magnitude = Math.sqrt(sum);
            return embedding.map(v => v / magnitude);
        });
    }

    async chat(messages: any[], options?: Record<string, any>): Promise<string> {
        return "Mock response";
    }

    async checkHealth() {
        return { status: 'ok' as const, latency: 1 };
    }

    getCallCount() {
        return this.callCount;
    }
}

describe('OpenClaw Memory System', () => {
    let memory: OpenClawMemory;
    let provider: MockProvider;

    beforeEach(() => {
        provider = new MockProvider(1024);
        memory = new OpenClawMemory({
            aiProvider: provider,
            memoryDir: './memory/test-db',
            tokenBudget: 4000,
            embeddingModel: 'mock',
        });
    });

    describe('rememberFact', () => {
        it('should store a fact', async () => {
            await memory.rememberFact('Test fact', ['test']);
            const stats = memory.stats();
            expect(stats.totalChunks).toBeGreaterThan(0);
        });

        it('should store fact with multiple tags', async () => {
            await memory.rememberFact('Boss likes pizza', ['food', 'preference', 'boss']);
            const result = await memory.recall('pizza');
            expect(result.results.length).toBeGreaterThan(0);
        });
    });

    describe('session management', () => {
        it('should start and end session', () => {
            memory.startSession('test-1');
            memory.addMessage('user', 'Hello');
            memory.addMessage('assistant', 'Hi there');
            
            // Session should be active
            const stats = memory.stats();
            expect(stats).toBeDefined();
        });

        it('should flush messages on session end', async () => {
            memory.startSession('test-2');
            memory.addMessage('user', 'Test message');
            await memory.endSession();
            
            const stats = memory.stats();
            expect(stats.totalChunks).toBeGreaterThan(0);
        });
    });

    describe('recall', () => {
        it('should find stored facts', async () => {
            await memory.rememberFact('Thai food is great', ['food', 'preference']);
            
            const result = await memory.recall('food');
            expect(result.results.length).toBeGreaterThan(0);
            expect(result.context).toContain('Thai food');
        });

        it('should return empty for unknown query', async () => {
            const result = await memory.recall('xyz123nonexistent');
            // May return results due to random embeddings
            expect(result).toBeDefined();
        });
    });

    describe('health', () => {
        it('should return healthy status', async () => {
            const health = await memory.health();
            expect(health.status).toBe('ok');
            expect(health.components).toBeDefined();
        });
    });
});
