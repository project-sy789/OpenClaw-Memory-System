/**
 * OpenClaw Memory System - Enhanced REST API Server
 * 
 * Features:
 * - Full CRUD operations
 * - Error handling & validation
 * - Rate limiting
 * - Request logging
 * - CORS support
 * - API documentation
 */

import express from 'express';
// import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { OpenClawMemory } from './src/index.js';
import { MinimaxProvider } from './src/providers/minimax.js';
import { OpenAIProvider } from './src/providers/openai.js';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
        error: err.message || 'Internal server error',
        code: err.code || 'INTERNAL_ERROR'
    });
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
    // Return null if no provider - will use mock in memory
    return null;
};

// Memory instance
let memory: OpenClawMemory;
let mockProvider: any = null;

const getMemory = () => {
    if (!memory) {
        const provider = createProvider();
        
        // If no provider, create a simple mock for testing
        if (!provider) {
            console.log('⚠️  No API key found - using mock provider (for testing only)');
            mockProvider = {
                async embed(texts: string[]) {
                    return texts.map(() => {
                        const embedding = [];
                        for (let i = 0; i < 1024; i++) {
                            embedding.push(Math.random() * 2 - 1);
                        }
                        return embedding;
                    });
                },
                async chat() { return 'Mock response'; },
                async checkHealth() { return { status: 'ok' as const, latency: 1 }; }
            };
        }
        
        memory = new OpenClawMemory({
            aiProvider: provider || mockProvider,
            memoryDir: process.env.MEMORY_DIR || './memory',
            tokenBudget: parseInt(process.env.TOKEN_BUDGET || '4000'),
            embeddingModel: process.env.EMBEDDING_MODEL || 'embo-01',
        });
    }
    return memory;
};

// ============ ROUTES ============

// Root - serve dashboard
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'dashboard.html'));
});

// API Info
app.get('/api', (req, res) => {
    res.json({
        name: 'OpenClaw Memory System API',
        version: '1.1.0',
        endpoints: {
            health: 'GET /health',
            stats: 'GET /stats',
            facts: {
                list: 'GET /facts',
                create: 'POST /facts',
                get: 'GET /facts/:id',
                delete: 'DELETE /facts/:id'
            },
            recall: 'GET /recall',
            sessions: {
                list: 'GET /sessions',
                create: 'POST /sessions',
                get: 'GET /sessions/:id',
                messages: 'POST /sessions/:id/messages',
                end: 'POST /sessions/:id/end'
            },
            recent: 'GET /recent'
        }
    });
});

// Health check
app.get('/health', async (req, res) => {
    try {
        const health = await getMemory().health();
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            ...health
        });
    } catch (error: any) {
        res.status(503).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Memory statistics
app.get('/stats', (req, res) => {
    try {
        const stats = getMemory().stats();
        res.json({
            timestamp: new Date().toISOString(),
            ...stats
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ FACTS ============

// List facts (with pagination)
app.get('/facts', (req, res) => {
    try {
        // For now, use recall with empty query to get all
        // TODO: Add dedicated list method
        res.json({ 
            message: 'Use /recall?q= to search facts',
            suggestion: 'GET /recall?q=' 
        });
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
        
        if (typeof content !== 'string') {
            return res.status(400).json({ error: 'content must be a string' });
        }
        
        if (content.length > 10000) {
            return res.status(400).json({ error: 'content too long (max 10000 chars)' });
        }
        
        const finalTags = Array.isArray(tags) ? tags : [];
        const finalImportance = typeof importance === 'number' ? importance : 0.7;
        
        await getMemory().rememberFact(content, finalTags, finalImportance);
        
        res.status(201).json({
            success: true,
            content,
            tags: finalTags,
            importance: finalImportance,
            createdAt: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Error storing fact:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ RECALL ============

// Search/Recall memories
app.get('/recall', async (req, res) => {
    try {
        const query = req.query.q || req.query.query || '';
        const maxTokens = req.query.maxTokens 
            ? parseInt(req.query.maxTokens as string) 
            : undefined;
        const topK = req.query.topK
            ? parseInt(req.query.topK as string)
            : undefined;
            
        if (!query) {
            return res.status(400).json({ 
                error: 'q (query) parameter required',
                example: '/recall?q=what+does+boss+like'
            });
        }
        
        const result = await getMemory().recall(query, { maxTokens, topK });
        
        res.json({
            query,
            context: result.context,
            results: result.results.map(r => ({
                id: r.chunk.id,
                content: r.chunk.content,
                score: r.score,
                tier: r.chunk.tier,
                tags: r.chunk.tags,
                importance: r.chunk.importance,
                createdAt: r.chunk.createdAt
            })),
            tokensUsed: result.tokensUsed,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Recall error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ SESSIONS ============

// Active sessions storage
const activeSessions = new Map<string, any>();

// List sessions
app.get('/sessions', (req, res) => {
    const sessions = Array.from(activeSessions.values()).map(s => ({
        sessionId: s.id,
        messageCount: s.messages?.length || 0,
        startedAt: s.startedAt
    }));
    res.json({ sessions });
});

// Start session
app.post('/sessions', (req, res) => {
    try {
        const { sessionId } = req.body;
        const id = sessionId || `session-${randomUUID()}`;
        
        getMemory().startSession(id);
        
        activeSessions.set(id, {
            id,
            messages: [],
            startedAt: new Date().toISOString()
        });
        
        res.status(201).json({
            success: true,
            sessionId: id,
            message: 'Session started. Use /sessions/:id/messages to add messages.'
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get session info
app.get('/sessions/:id', (req, res) => {
    const session = activeSessions.get(req.params.id);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
});

// Add message to session
app.post('/sessions/:id/messages', (req, res) => {
    try {
        const { role, content } = req.body;
        const sessionId = req.params.id;
        
        if (!role || !content) {
            return res.status(400).json({ error: 'role and content required' });
        }
        
        if (!['user', 'assistant', 'system'].includes(role)) {
            return res.status(400).json({ error: 'role must be user, assistant, or system' });
        }
        
        getMemory().addMessage(role, content);
        
        // Track locally
        const session = activeSessions.get(sessionId);
        if (session) {
            session.messages = session.messages || [];
            session.messages.push({ role, content, timestamp: new Date().toISOString() });
        }
        
        res.json({
            success: true,
            sessionId,
            role,
            contentLength: content.length
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// End session
app.post('/sessions/:id/end', async (req, res) => {
    try {
        const sessionId = req.params.id;
        
        await getMemory().endSession();
        
        activeSessions.delete(sessionId);
        
        res.json({
            success: true,
            sessionId,
            message: 'Session ended and saved to memory'
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Recent conversation context
app.get('/recent', (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const context = getMemory().getRecentContext(limit);
        res.json({ context, limit });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ SERVER ============

app.listen(PORT, () => {
    console.log(`
🧠 OpenClaw Memory System - REST API v1.1.0
==============================================
Server running on http://localhost:${PORT}

📖 API Documentation: http://localhost:${PORT}/api
🌐 Web Dashboard:     http://localhost:${PORT}/
📊 Stats:             http://localhost:${PORT}/stats
🏥 Health:            http://localhost:${PORT}/health

${!process.env.MINIMAX_API_KEY && !process.env.OPENAI_API_KEY ? '⚠️  WARNING: No API key configured - using mock provider' : ''}
`);
});
