// ============================================================
// OpenClaw Memory System — Token Counter
// ============================================================
// Uses tiktoken for accurate GPT token counting.
// Falls back to a simple estimator if tiktoken fails.

import { logger } from './logger';

let encoder: { encode: (text: string) => number[] } | null = null;
let encoderInitialized = false;

async function getEncoder(): Promise<typeof encoder> {
    if (encoderInitialized) return encoder;
    encoderInitialized = true;
    try {
        const tiktoken = await import('tiktoken');
        encoder = tiktoken.encoding_for_model('gpt-4o') as unknown as typeof encoder;
        logger.debug('tiktoken encoder initialized');
    } catch {
        logger.warn('tiktoken not available, using estimate (~4 chars/token)');
        encoder = null;
    }
    return encoder;
}

/**
 * Count tokens in a string.
 * Uses tiktoken when available, otherwise estimates at ~4 chars/token.
 */
export async function countTokens(text: string): Promise<number> {
    const enc = await getEncoder();
    if (enc) {
        return enc.encode(text).length;
    }
    // Estimation: ~4 characters per token for English,
    // ~2 characters per token for Thai/CJK
    const thaiPattern = /[\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF]/g;
    const thaiMatches = text.match(thaiPattern);
    const thaiCharCount = thaiMatches ? thaiMatches.length : 0;
    const otherCharCount = text.length - thaiCharCount;
    return Math.ceil(otherCharCount / 4 + thaiCharCount / 2);
}

/**
 * Synchronous token estimation (no tiktoken, pure heuristic).
 * Use when async is not possible.
 */
export function estimateTokens(text: string): number {
    const thaiPattern = /[\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF]/g;
    const thaiMatches = text.match(thaiPattern);
    const thaiCharCount = thaiMatches ? thaiMatches.length : 0;
    const otherCharCount = text.length - thaiCharCount;
    return Math.ceil(otherCharCount / 4 + thaiCharCount / 2);
}

/**
 * Truncate text to fit within a token budget.
 */
export async function truncateToTokens(
    text: string,
    maxTokens: number
): Promise<string> {
    const tokens = await countTokens(text);
    if (tokens <= maxTokens) return text;

    // Binary search for the right truncation point
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        const count = await countTokens(text.slice(0, mid));
        if (count <= maxTokens) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return text.slice(0, lo) + '…';
}
