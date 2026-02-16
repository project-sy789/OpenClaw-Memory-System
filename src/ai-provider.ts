
/**
 * AI Provider Interface
 * OpenClaw Memory System delegates all AI tasks (embeddings and chat) to this provider.
 * This allows the library to be decoupled from specific API keys or providers.
 */
export interface AIProvider {
    /**
     * Generate embeddings for one or more strings.
     * @param texts Array of strings to embed.
     * @returns Array of embedding vectors (number arrays).
     */
    embed(texts: string[]): Promise<number[][]>;

    /**
     * Generate a chat completion.
     * Used for semantic header generation and memory consolidation.
     * @param messages AI messages array.
     * @param options Optional overrides (model, temperature, etc.)
     * @returns The generated response text.
     */
    chat(messages: any[], options?: Record<string, any>): Promise<string>;

    /**
     * Check if the provider is healthy.
     */
    checkHealth(): Promise<{ status: 'ok' | 'error'; message?: string; latency?: number }>;
}
