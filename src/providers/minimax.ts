import { AIProvider } from '../types';
import { logger } from '../utils/logger';

/**
 * Specialized Minimax Provider.
 * Supports Minimax International/Domestic and Anthropic-compatible gateways.
 * Handles Minimax-specific parameter names (texts) and response formats.
 * Includes robust retry logic for rate limits.
 */
export class MinimaxProvider implements AIProvider {
    private apiKey: string;
    private chatUrl: string;
    private embedUrl: string;
    private chatModel: string;
    private embedModel: string;
    private maxRetries: number = 5;
    private baseDelay: number = 5000; // Start with 5 seconds

    constructor(options: {
        apiKey: string;
        baseUrl?: string;
        chatUrl?: string;
        embedUrl?: string;
        chatModel?: string;
        embedModel?: string;
    }) {
        this.apiKey = options.apiKey;

        const base = options.baseUrl || 'https://api.minimaxi.chat/v1';
        this.chatUrl = options.chatUrl || `${base}/chat/completions`;
        this.embedUrl = options.embedUrl || `${base}/embeddings`;

        this.chatModel = options.chatModel || 'MiniMax-M2.5';
        this.embedModel = options.embedModel || 'embo-01';
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async withRetry<T>(fn: () => Promise<T>, operationName: string): Promise<T> {
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;
                
                // Check if it's a rate limit error (1002 = rate limit)
                const isRateLimit = error.message?.includes('1002') || 
                                   error.message?.includes('rate limit') ||
                                   error.status === 429;
                
                if (isRateLimit && attempt < this.maxRetries) {
                    // Exponential backoff with jitter
                    const delay = this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 2000;
                    logger.warn(`Minimax ${operationName} rate limited. Retrying in ${Math.round(delay/1000)}s (attempt ${attempt}/${this.maxRetries})...`);
                    await this.sleep(delay);
                    continue;
                }
                
                // Not a rate limit or max retries reached
                throw error;
            }
        }
        
        throw lastError;
    }

    async embed(texts: string[]): Promise<number[][]> {
        return this.withRetry(async () => {
            const response = await fetch(this.embedUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.embedModel,
                    texts: texts,
                    type: 'db',
                }),
            });

            if (!response.ok) {
                const errorData: any = await response.json().catch(() => ({}));
                const msg = errorData.base_resp?.status_msg || errorData.error?.message || response.statusText;
                throw new Error(`Minimax Embedding HTTP Error (${response.status}): ${msg}`);
            }

            const data: any = await response.json();

            if (data.base_resp && data.base_resp.status_code !== 0) {
                const error: any = new Error(`Minimax API Error (${data.base_resp.status_code}): ${data.base_resp.status_msg}`);
                if (data.base_resp.status_code === 1002) error.status = 429;
                throw error;
            }

            if (data.vectors && Array.isArray(data.vectors)) {
                return data.vectors;
            }

            if (data.data && Array.isArray(data.data)) {
                return data.data.map((d: any) => d.embedding || d.vector);
            }

            throw new Error(`Minimax API Error: Unexpected response format: ${JSON.stringify(data)}`);
        }, 'Embedding');
    }

    async chat(messages: any[], options?: Record<string, any>): Promise<string> {
        return this.withRetry(async () => {
            const response = await fetch(this.chatUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.chatModel,
                    messages,
                    ...options,
                }),
            });

            if (!response.ok) {
                const errorData: any = await response.json().catch(() => ({}));
                const msg = errorData.base_resp?.status_msg || errorData.error?.message || response.statusText;
                throw new Error(`Minimax Chat HTTP Error (${response.status}): ${msg}`);
            }

            const data: any = await response.json();

            if (data.base_resp && data.base_resp.status_code !== 0) {
                const error: any = new Error(`Minimax API Error (${data.base_resp.status_code}): ${data.base_resp.status_msg}`);
                if (data.base_resp.status_code === 1002) error.status = 429;
                throw error;
            }

            return data.choices?.[0]?.message?.content || '';
        }, 'Chat');
    }

    async checkHealth() {
        try {
            const start = Date.now();
            await this.embed(['health check']);
            return { status: 'ok' as const, latency: Date.now() - start };
        } catch (e: any) {
            return { status: 'error' as const, message: e.message };
        }
    }
}
