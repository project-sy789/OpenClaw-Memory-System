#!/usr/bin/env node
import { Command } from 'commander';
import { OpenClawMemory } from './index';
import { MinimaxProvider } from './providers/minimax';
import { OpenAIProvider } from './providers/openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { SearchMode } from './types';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const program = new Command();

program
    .name('openclaw')
    .description('OpenClaw Memory System CLI')
    .version('2.0.0');

// Helper to create memory instance
function createMemory() {
    // Detect provider
    const minimaxKey = process.env.MINIMAX_API_KEY;
    const isMinimax = !!minimaxKey;
    const apiKey = minimaxKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.error('❌ ERROR: No API Key found in .env (MINIMAX_API_KEY or OPENAI_API_KEY)');
        process.exit(1);
    }

    // Auto-detect International vs Domestic Minimax
    const isInternational = minimaxKey?.startsWith('sk-');
    const defaultMinimaxBase = isInternational ? 'https://api.minimaxi.chat/v1' : 'https://api.minimax.chat/v1';
    const baseUrl = process.env.MINIMAX_BASE_URL || (isMinimax ? defaultMinimaxBase : undefined) || process.env.OPENAI_BASE_URL;

    // Select models
    const chatModel = isMinimax ? (process.env.LLM_MODEL || 'MiniMax-M2.5') : 'gpt-4o-mini';
    const embedModel = isMinimax ? (process.env.EMBEDDING_MODEL || 'embo-01') : 'text-embedding-3-small';

    let provider;
    if (isMinimax) {
        provider = new MinimaxProvider({
            apiKey,
            baseUrl,
            chatModel, // Optional, defaults in provider
            embedModel // Optional
        });
    } else {
        provider = new OpenAIProvider(apiKey, baseUrl, chatModel, embedModel);
    }

    return new OpenClawMemory({
        aiProvider: provider,
        memoryDir: process.env.MEMORY_DIR || './memory',
        tokenBudget: Number(process.env.TOKEN_BUDGET) || 4000,
        logLevel: (process.env.LOG_LEVEL as any) || 'info',
        searchMode: (process.env.SEARCH_MODE as any) || 'auto'
    });
}

// Command: Stats
program.command('stats')
    .description('Show current memory statistics')
    .action(async () => {
        const memory = createMemory();
        try {
            console.log(memory.printStats());
            const meta = memory.getMetaInsights();
            console.log('\n--- Meta-Memory Insights ---');
            console.log(meta.healthReport);
        } finally {
            memory.close();
        }
    });

// Command: Remember
program.command('remember <content> [tags...]')
    .description('Store a new memory fact')
    .action(async (content, tags) => {
        const memory = createMemory();
        try {
            console.log(`📝 Storing: "${content}"`);
            const chunks = await memory.rememberFact(content, tags || []);
            console.log(`✅ Stored as chunk: ${chunks.id} (Tier: ${chunks.tier})`);
        } catch (err: any) {
            console.error('❌ Error:', err.message);
        } finally {
            memory.close();
        }
    });

// Command: Recall
program.command('recall <query>')
    .description('Search for memories')
    .option('-m, --mode <mode>', 'Search mode (hybrid/brain/auto)', 'auto')
    .action(async (query, options) => {
        const memory = createMemory();
        try {
            console.log(`🔍 Searching for: "${query}" (Mode: ${options.mode})`);
            const { context, results, tokensUsed } = await memory.recall(query, {
                searchMode: options.mode as SearchMode
            });

            console.log('\n--- Context ---');
            console.log(context);
            console.log('---------------\n');
            console.log(`Found ${results.length} results. Tokens used: ${tokensUsed}`);

            // Show sources
            results.forEach((r, i) => {
                console.log(`[${i + 1}] Score: ${r.score.toFixed(3)} (${r.source}) - ${r.chunk.content.slice(0, 50)}...`);
            });

        } catch (err: any) {
            console.error('❌ Error:', err.message);
        } finally {
            memory.close();
        }
    });

// Command: Health
program.command('health')
    .description('Check system health and connectivity')
    .action(async () => {
        const memory = createMemory();
        try {
            console.log('🏥 Checking health...');
            const report = await memory.health();
            console.log(JSON.stringify(report, null, 2));
        } catch (err: any) {
            console.error('❌ Error:', err.message);
        } finally {
            memory.close();
        }
    });

// Command: Interactive Chat
program.command('interactive')
    .description('Start interactive chat session')
    .action(async () => {
        const memory = createMemory();
        console.log('--- 💬 OpenClaw Interactive Mode (Ctrl+C to exit) ---');
        console.log('Type a message to chat with memory context.\n');

        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const ask = () => {
            readline.question('You: ', async (input: string) => {
                if (!input) {
                    memory.close();
                    readline.close();
                    return;
                }

                try {
                    // 1. Recall
                    const { context } = await memory.recall(input);
                    // 2. Chat (using provider directly for simplicity in CLI)
                    // In a real app, you'd pass context to your LLM agent.
                    // Here we just show the context found.
                    console.log(`\n🧠 Memory Found:\n${context}\n`);
                } catch (err: any) {
                    console.error('Error:', err.message);
                }

                ask();
            });
        };

        ask();
    });

// Command: Session (Start/End)
const session = program.command('session').description('Manage sessions');

session.command('start <id>')
    .description('Start a new session')
    .action(async (id) => {
        // Since CLI is stateless per run, this just logs
        // Real session management usually happens in a long-running process
        console.log(`ℹ️  CLI is stateless. Use API for persistent sessions.`);
        console.log(`Session ${id} logic would go here.`);
    });

session.command('end')
    .description('End current session')
    .action(async () => {
        const memory = createMemory();
        try {
            await memory.endSession();
            console.log('✅ Session ended and consolidated.');
        } finally {
            memory.close();
        }
    });

program.parse();
