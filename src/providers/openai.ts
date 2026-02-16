
import OpenAI from 'openai';
import { AIProvider } from '../types';

/**
 * Standard OpenAI Provider implementation.
 * Use this as a reference or as the default client for the host system.
 */
export class OpenAIProvider implements AIProvider {
    private client: OpenAI;
    private model: string;
    private embeddingModel: string;

    constructor(apiKey: string, baseUrl?: string, chatModel = 'gpt-4o-mini', embeddingModel = 'text-embedding-3-small') {
        this.client = new OpenAI({
            apiKey,
            baseURL: baseUrl
        });
        this.model = chatModel;
        this.embeddingModel = embeddingModel;
    }

    async embed(texts: string[]): Promise<number[][]> {
        const response = await this.client.embeddings.create({
            model: this.embeddingModel,
            input: texts,
        });
        return response.data.map(d => d.embedding);
    }

    async chat(messages: any[], options?: Record<string, any>): Promise<string> {
        const response = await this.client.chat.completions.create({
            model: this.model,
            messages,
            ...options
        });
        return response.choices[0]?.message?.content || '';
    }

    async checkHealth() {
        try {
            const start = Date.now();
            await this.embed(['ping']);
            return { status: 'ok' as const, latency: Date.now() - start };
        } catch (e: any) {
            return { status: 'error' as const, message: e.message };
        }
    }
}
