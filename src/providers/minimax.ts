
import { AIProvider } from '../types';
import { logger } from '../utils/logger';

/**
 * Specialized Minimax Provider.
 * Supports Minimax International/Domestic and Anthropic-compatible gateways.
 * Handles Minimax-specific parameter names (texts) and response formats.
 */
export class MinimaxProvider implements AIProvider {
    private apiKey: string;
    private chatUrl: string;
    private embedUrl: string;
    private chatModel: string;
    private embedModel: string;

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

    async embed(texts: string[]): Promise<number[][]> {
        try {
            // Minimax International/Domestic often expects 'texts' instead of 'input' 
            // even on OpenAI-compatible endpoints for certain models.
            const response = await fetch(this.embedUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.embedModel,
                    texts: texts, // Changed from 'input' to 'texts'
                    type: 'db',   // Required for Minimax embeddings
                }),
            });

            if (!response.ok) {
                const errorData: any = await response.json().catch(() => ({}));
                const msg = errorData.base_resp?.status_msg || errorData.error?.message || response.statusText;
                throw new Error(`Minimax Embedding HTTP Error (${response.status}): ${msg}`);
            }

            const data: any = await response.json();

            if (data.base_resp && data.base_resp.status_code !== 0) {
                throw new Error(`Minimax API Error (${data.base_resp.status_code}): ${data.base_resp.status_msg}`);
            }

            // Minimax returns 'vectors' or 'data[].embedding' depending on endpoint
            if (data.vectors && Array.isArray(data.vectors)) {
                return data.vectors;
            }

            if (data.data && Array.isArray(data.data)) {
                return data.data.map((d: any) => d.embedding || d.vector);
            }

            throw new Error(`Minimax API Error: Unexpected response format: ${JSON.stringify(data)}`);
        } catch (error: any) {
            logger.error(`Minimax Embedding failed: ${error.message}`);
            throw error;
        }
    }

    async chat(messages: any[], options?: Record<string, any>): Promise<string> {
        try {
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
                throw new Error(`Minimax API Error (${data.base_resp.status_code}): ${data.base_resp.status_msg}`);
            }

            return data.choices?.[0]?.message?.content || '';
        } catch (error: any) {
            logger.error(`Minimax Chat failed: ${error.message}`);
            throw error;
        }
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
