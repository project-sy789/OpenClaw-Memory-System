#!/usr/bin/env node
/**
 * OpenClaw Memory System - CLI Interface
 * Usage: node cli.js <command> [args]
 * 
 * Commands:
 *   remember <text> [tags...]  - Store a fact
 *   recall <query>              - Search memories
 *   session start               - Start a new session
 *   session end                 - End current session
 *   chat <message>             - Add message to session
 *   stats                      - Show memory statistics
 *   health                     - Check system health
 *   interactive                - Start interactive mode
 */

import { OpenClawMemory } from './src/index.js';
import { MinimaxProvider } from './src/providers/minimax.js';
import * as dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

// Create AI Provider (Minimax)
const createProvider = () => {
    return new MinimaxProvider({
        apiKey: process.env.MINIMAX_API_KEY || '',
        baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1',
        embedModel: process.env.EMBEDDING_MODEL || 'embo-01',
    });
};

// Create Memory Instance
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

// CLI Commands
const commands = {
    // Remember a fact
    remember: async (text: string, tags: string[]) => {
        console.log('💾 Remembering:', text);
        await getMemory().rememberFact(text, tags);
        console.log('✅ Stored!\n');
    },

    // Recall memories
    recall: async (query: string) => {
        console.log('🔍 Searching for:', query);
        const result = await getMemory().recall(query);
        console.log('\n📝 Results:');
        console.log(result.context || '(no results)');
    },

    // Session management
    session: {
        start: async (sessionId?: string) => {
            const id = sessionId || `session-${Date.now()}`;
            getMemory().startSession(id);
            console.log('✅ Session started:', id);
        },
        end: async () => {
            await getMemory().endSession();
            console.log('✅ Session ended');
        }
    },

    // Add chat message
    chat: async (role: 'user' | 'assistant', text: string) => {
        getMemory().addMessage(role, text);
        console.log('✅ Message added');
    },

    // Show stats
    stats: async () => {
        const stats = getMemory().stats();
        console.log('\n📊 Memory Statistics:');
        console.log(JSON.stringify(stats, null, 2));
    },

    // Health check
    health: async () => {
        console.log('🏥 Checking health...');
        const result = await getMemory().health();
        console.log(JSON.stringify(result, null, 2));
    },

    // Interactive mode
    interactive: async () => {
        console.log('\n🧠 OpenClaw Memory System - Interactive Mode');
        console.log('Commands: remember <text>, recall <query>, stats, health, quit\n');
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const prompt = () => {
            rl.question('> ', async (input) => {
                const parts = input.trim().split(' ');
                const cmd = parts[0]?.toLowerCase();
                const args = parts.slice(1);

                try {
                    switch (cmd) {
                        case 'remember':
                        case 'r':
                            await commands.remember(args.join(' ').replace(/^["']|["']$/g, ''), ['cli']);
                            break;
                        case 'recall':
                        case 'search':
                            await commands.recall(args.join(' '));
                            break;
                        case 'stats':
                            await commands.stats();
                            break;
                        case 'health':
                        case 'h':
                            await commands.health();
                            break;
                        case 'quit':
                        case 'exit':
                            rl.close();
                            return;
                        default:
                            console.log('Unknown command. Try: remember, recall, stats, health, quit');
                    }
                } catch (e: any) {
                    console.error('❌ Error:', e.message);
                }

                prompt();
            });
        };

        prompt();
    }
};

// Main CLI
async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0]?.toLowerCase();

    try {
        switch (cmd) {
            case 'remember':
            case 'r':
                if (!args[1]) {
                    console.error('Usage: remember <text> [tags...]');
                    process.exit(1);
                }
                const tags = args.slice(2);
                await commands.remember(args[1], tags.length ? tags : ['general']);
                break;

            case 'recall':
            case 'search':
                if (!args[1]) {
                    console.error('Usage: recall <query>');
                    process.exit(1);
                }
                await commands.recall(args.slice(1).join(' '));
                break;

            case 'session':
                const sessionCmd = args[1]?.toLowerCase();
                if (sessionCmd === 'start') {
                    await commands.session.start(args[2]);
                } else if (sessionCmd === 'end') {
                    await commands.session.end();
                } else {
                    console.error('Usage: session start [id] | session end');
                    process.exit(1);
                }
                break;

            case 'chat':
                const role = args[1] as 'user' | 'assistant';
                if (!role || !['user', 'assistant'].includes(role)) {
                    console.error('Usage: chat <user|assistant> <message>');
                    process.exit(1);
                }
                await commands.chat(role, args.slice(2).join(' '));
                break;

            case 'stats':
                await commands.stats();
                break;

            case 'health':
            case 'h':
                await commands.health();
                break;

            case 'interactive':
            case 'i':
                await commands.interactive();
                break;

            default:
                console.log(`
🧠 OpenClaw Memory System CLI

Usage: node cli.js <command> []

Commands:
 args remember <text> [tags...]  Store a fact
  recall <query>             Search memories
  session start [id]         Start a new session
  session end                 End current session  
  chat <user|assistant> <msg> Add message to session
  stats                      Show memory statistics
  health                     Check system health
  interactive                Start interactive mode

Examples:
  node cli.js remember "Boss likes coffee" preference food
  node cli.js recall "what does boss like"
  node cli.js stats
  node cli.js interactive
`);
                break;
        }
    } catch (e: any) {
        console.error('❌ Error:', e.message);
        process.exit(1);
    }
}

main();
