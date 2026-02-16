/**
 * OpenClaw Memory System - REST API Server
 * 
 * Run: node dist/server.js
 * or: docker-compose run --rm memory node dist/server.js
 * 
 * Endpoints:
 *   GET  /health          - Health check
 *   GET  /stats           - Memory statistics
 *   POST /facts           - Store a fact
 *     { "content": "...", "tags": ["..."], "importance": 0.8 }
 *   GET  /facts/:id       - Get fact by ID
 *   GET  /recall          - Search memories
 *     ?q=query&maxTokens=4000
 *   POST /sessions        - Start session
 *     { "sessionId": "..." }
 *   POST /sessions/:id/messages - Add message
 *     { "role": "user|assistant", "content": "..." }
 *   POST /sessions/:id/end     - End session
 *   GET  /recent          - Recent conversation context
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { OpenClawMemory } from './src/index.js';
import { MinimaxProvider } from './src/providers/minimax.js';
import { OpenAIProvider } from './src/providers/openai.js';
import * as dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'dashboard.html'));
});

// Create AI Provider
const createProvider = () => {
    if (process.env.MINIMAX_API_KEY) {
        return new MinimaxProvider({
            apiKey: process.env.MINIMAX_API_KEY,
            baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1',
            embedModel: process.env.EMBEDDING_MODEL || 'embo-01',
        });
    }
    if (process.env.OPENAI_API_KEY) {
        return new OpenAIProvider({
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        });
    }
    throw new Error('No AI provider configured. Set MINIMAX_API_KEY or OPENAI_API_KEY');
};

// Memory instance (lazy init)
let memory: OpenClawMemory;

const getMemory = () => {
    if (!memory) {
        const provider = createProvider();
        memory = new OpenClawMemory({
            aiProvider: provider,
            memoryDir: process.env.MEMORY_DIR || './memory',
            tokenBudget: parseInt(process.env.TOKEN_BUDGET || '4000'),
            embeddingModel: process.env.EMBEDDING_MODEL || 'embo-01',
        });
    }
    return memory;
};

// ============ ROUTES ============

// Health check
app.get('/health', async (req, res) => {
    try {
        const health = await getMemory().health();
        res.json(health);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Memory statistics
app.get('/stats', (req, res) => {
    try {
        const stats = getMemory().stats();
        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Store a fact
app.post('/facts', async (req, res) => {
    try {
        const { content, tags, importance } = req.body;
        if (!content) {
            return res.status(400).json({ error: 'content is required' });
        }
        
        await getMemory().rememberFact(content, tags || [], importance);
        res.json({ success: true, content, tags });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get fact by ID (future)
// app.get('/facts/:id', async (req, res) => { });

// Search/Recall memories
app.get('/recall', async (req, res) => {
    try {
        const query = req.query.q || req.query.query;
        const maxTokens = req.query.maxTokens 
            ? parseInt(req.query.maxTokens as string) 
            : undefined;
            
        if (!query) {
            return res.status(400).json({ error: 'q (query) parameter required' });
        }
        
        const result = await getMemory().recall(query as string, { maxTokens });
        res.json({
            query,
            context: result.context,
            results: result.results.map(r => ({
                content: r.chunk.content,
                score: r.score,
                tier: r.chunk.tier,
            })),
            tokensUsed: result.tokensUsed,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Start session
app.post('/sessions', (req, res) => {
    try {
        const { sessionId } = req.body;
        getMemory().startSession(sessionId || `session-${Date.now()}`);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Add message to session
app.post('/sessions/:id/messages', (req, res) => {
    try {
        const { role, content } = req.body;
        if (!role || !content) {
            return res.status(400).json({ error: 'role and content required' });
        }
        getMemory().addMessage(role, content);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// End session
app.post('/sessions/:id/end', async (req, res) => {
    try {
        await getMemory().endSession();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Recent conversation context
app.get('/recent', (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const context = getMemory().getRecentContext(limit);
        res.json({ context });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ SERVER ============

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
🧠 OpenClaw Memory System - REST API
======================================
Server running on http://localhost:${PORT}

Endpoints:
  GET  /health           - Health check
  GET  /stats            - Memory statistics
  POST /facts            - Store a fact
  GET  /recall?q=        - Search memories
  POST /sessions         - Start session
  POST /sessions/:id/messages - Add message
  POST /sessions/:id/end - End session
  GET  /recent           - Recent context
`);
});
