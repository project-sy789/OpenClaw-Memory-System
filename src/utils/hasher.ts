// ============================================================
// OpenClaw Memory System — Content Hasher
// ============================================================

import { createHash } from 'crypto';

/**
 * Create a SHA-256 hash of content.
 * Used for embedding cache invalidation — if content hash changes,
 * the embedding needs to be regenerated.
 */
export function hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

/**
 * Create a short fingerprint for quick comparison.
 */
export function fingerprint(content: string): string {
    return createHash('md5').update(content, 'utf-8').digest('hex').slice(0, 8);
}
