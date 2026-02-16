
import { AIProvider } from '../types';

/**
 * A Mock AI Provider for testing consolidation and embeddings without network calls.
 */
export class MockAIProvider implements AIProvider {
    async embed(texts: string[]): Promise<number[][]> {
        // Return dummy vectors of dimension 1536
        return texts.map(() => new Array(1536).fill(0).map(() => Math.random()));
    }

    async chat(messages: any[]): Promise<string> {
        // Return a dummy semantic header
        return "Mock Topic — Mock Subtopic";
    }

    async checkHealth() {
        return { status: 'ok' as const, latency: 5 };
    }
}
