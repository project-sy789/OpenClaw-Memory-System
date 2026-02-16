// ============================================================
// OpenClaw Memory System — Demo Script
// ============================================================
// Run with: npm run demo
// Requires OPENAI_API_KEY in .env

import 'dotenv/config';
import { OpenClawMemory, MemoryTier } from './index';

async function main() {
    console.log('\n🧠 OpenClaw Memory System — Demo\n');

    // ──────────────────────────────────
    // 1. Initialize
    // ──────────────────────────────────
    const memory = new OpenClawMemory({
        openaiApiKey: process.env.OPENAI_API_KEY!,
        memoryDir: './memory-demo',
        tokenBudget: 4000,
        logLevel: 'info',
    });

    // ──────────────────────────────────
    // 2. Start a session
    // ──────────────────────────────────
    console.log('📌 Starting session...');
    memory.startSession('demo-session-001');

    memory.addMessage('user', 'สวัสดีครับ ผมต้องการตั้งค่า Facebook automation สำหรับ Page ของร้านอาหาร');
    memory.addMessage('assistant', 'ได้ครับ จะช่วยตั้งค่า Facebook automation ให้ โดยต้องทำ 3 ขั้นตอน: 1) ตั้งค่า Webhook URL 2) สร้าง Access Token 3) เปิด Page Messaging');
    memory.addMessage('user', 'ผมใช้ Node.js นะครับ prefer TypeScript');
    memory.addMessage('assistant', 'เข้าใจครับ จะเขียนเป็น TypeScript ให้ เริ่มจากสร้าง Express server ก่อน...');

    await memory.endSession();
    console.log('✅ Session ended and flushed to episodic memory\n');

    // ──────────────────────────────────
    // 3. Store some facts
    // ──────────────────────────────────
    console.log('📝 Storing facts...');

    await memory.rememberFact(
        'User ชอบใช้ TypeScript และ prefer dark mode ในทุก IDE',
        ['preference', 'dev'],
        0.8
    );

    await memory.rememberFact(
        'ร้านอาหารของ user ชื่อ "ครัวคุณแม่" ตั้งอยู่ที่เชียงใหม่',
        ['business', 'location'],
        0.9
    );

    await memory.rememberFact(
        'Facebook Page ของร้านมี ID: 123456789 ใช้ Graph API v18.0',
        ['facebook', 'api', 'config'],
        0.7
    );

    console.log('✅ 3 facts stored\n');

    // ──────────────────────────────────
    // 4. Store a procedure
    // ──────────────────────────────────
    console.log('📋 Storing procedure...');

    await memory.rememberProcedure({
        name: 'Facebook Webhook Setup',
        description: 'Steps to set up Facebook Messenger webhook for automation',
        steps: [
            'Create a Facebook App in developers.facebook.com',
            'Generate a Page Access Token with pages_messaging permission',
            'Set up Express server with verify endpoint at /webhook',
            'Configure webhook URL in Facebook App settings',
            'Subscribe to messages and messaging_postbacks events',
            'Test with a sample message from the Page',
        ],
        triggerPattern: 'When user asks about Facebook webhook or messenger setup',
        successRate: 0.9,
        usageCount: 0,
    });

    console.log('✅ Procedure stored\n');

    // ──────────────────────────────────
    // 5. Store larger knowledge
    // ──────────────────────────────────
    console.log('📚 Storing larger knowledge document...');

    await memory.remember({
        content: `# Facebook Automation Architecture

## System Overview
The restaurant automation system uses Facebook Messenger API to handle customer interactions.
The system is built with Node.js + TypeScript running on a cloud VPS.

## Key Components
- **Webhook Server**: Express.js server handling Facebook callbacks
- **Message Handler**: NLP pipeline for understanding customer messages
- **Order Manager**: Integration with POS system for order placement
- **Notification Service**: Sends order status updates to customers

## Configuration
- API Version: Graph API v18.0
- Webhook Events: messages, messaging_postbacks, feed
- Rate Limit: 200 calls/hour per page
- Token Refresh: Every 60 days (long-lived token required)

## Known Issues
- Thai language NLP accuracy drops below 80% for complex sentences
- Webhook occasionally fails to receive events during high traffic
- Image uploads via Messenger API have 25MB limit
`,
        tier: MemoryTier.Semantic,
        tags: ['facebook', 'architecture', 'automation'],
        importanceScore: 0.8,
    });

    console.log('✅ Knowledge document stored and chunked\n');

    // ──────────────────────────────────
    // 6. Recall memories
    // ──────────────────────────────────
    console.log('🔍 Testing recall...\n');

    const queries = [
        'วิธีตั้งค่า Facebook webhook',
        'user preferences for development',
        'ร้านอาหารของ user อยู่ที่ไหน',
        'rate limit ของ Facebook API',
    ];

    for (const query of queries) {
        console.log(`  Query: "${query}"`);
        const { results, tokensUsed } = await memory.recall(query, { maxTokens: 2000 });
        console.log(`  Results: ${results.length} chunks, ${tokensUsed} tokens used`);
        if (results.length > 0) {
            const top = results[0];
            console.log(`  Top result (${(top.score * 100).toFixed(1)}%): ${top.chunk.semanticHeader ?? top.chunk.content.slice(0, 60)}...`);
        }
        console.log('');
    }

    // ──────────────────────────────────
    // 7. Maintenance
    // ──────────────────────────────────
    console.log('🔧 Running maintenance...');

    const decayResult = memory.decay();
    console.log(`  Decay: ${decayResult.memoriesDecayed} memories decayed`);

    console.log('');

    // ──────────────────────────────────
    // 8. Stats
    // ──────────────────────────────────
    console.log(memory.printStats());

    // ──────────────────────────────────
    // Cleanup
    // ──────────────────────────────────
    memory.close();
    console.log('\n✨ Demo complete!\n');
}

main().catch(console.error);
