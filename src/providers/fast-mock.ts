/**
 * Fast Mock Provider for testing without API
 * Uses simple hash-based embeddings (deterministic, fast)
 */

export class FastMockProvider {
    private dimension: number;

    constructor(dimension: number = 1024) {
        this.dimension = dimension;
    }

    // Simple hash to create deterministic "embedding-like" vectors
    private simpleHash(text: string): number[] {
        const hash: number[] = [];
        let h = 0x811c9dc5;
        
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        
        // Generate pseudo-random but deterministic vector
        const seed = Math.abs(h);
        let rng = seed;
        
        for (let i = 0; i < this.dimension; i++) {
            rng = (rng * 1103515245 + 12345) & 0x7fffffff;
            hash.push((rng / 0x7fffffff) * 2 - 1);
        }
        
        // Normalize
        const mag = Math.sqrt(hash.reduce((sum, v) => sum + v * v, 0));
        return hash.map(v => v / mag);
    }

    async embed(texts: string[]): Promise<number[][]> {
        // Fast deterministic embeddings
        return texts.map(text => this.simpleHash(text));
    }

    async chat(messages: any[], options?: Record<string, any>): Promise<string> {
        // Return contextual mock response
        const lastMsg = messages[messages.length - 1]?.content || '';
        
        if (lastMsg.toLowerCase().includes('hello') || lastMsg.toLowerCase().includes('hi')) {
            return 'Hello! How can I help you today?';
        }
        if (lastMsg.toLowerCase().includes('remember')) {
            return 'I will remember that for you.';
        }
        
        return 'I understand. Let me help you with that.';
    }

    async checkHealth() {
        return { 
            status: 'ok' as const, 
            latency: 1,
            provider: 'fast-mock'
        };
    }
}
