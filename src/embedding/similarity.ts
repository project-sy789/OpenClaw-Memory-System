// ============================================================
// OpenClaw Memory System — Vector Similarity Functions
// ============================================================

/**
 * Cosine similarity between two vectors.
 * Returns value between -1 and 1 (1 = identical direction).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
        throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return dotProduct / denominator;
}

/**
 * Dot product of two vectors.
 */
export function dotProduct(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
        throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}

/**
 * Euclidean distance between two vectors.
 */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
        throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

/**
 * Find top-K most similar vectors by cosine similarity.
 * Returns indices and scores sorted by descending similarity.
 */
export function topKSimilar(
    query: Float32Array,
    vectors: { id: string; embedding: Float32Array }[],
    k: number
): { id: string; score: number }[] {
    const scored = vectors.map((v) => ({
        id: v.id,
        score: cosineSimilarity(query, v.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
}

/**
 * Normalize a score to 0-1 range.
 */
export function normalizeScore(score: number, min: number, max: number): number {
    if (max === min) return 0.5;
    return Math.max(0, Math.min(1, (score - min) / (max - min)));
}
