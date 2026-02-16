# 🧠 OpenClaw Memory System

ระบบความจำระยะยาวขั้นสูงสำหรับ AI Agent — เก็บ, จัดโครงสร้าง, และค้นหาความทรงจำอย่างชาญฉลาดด้วย vector embeddings

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **5-Tier Memory** | Working → Episodic → Semantic → Procedural → Meta |
| **Smart Chunking** | 3-phase semantic chunking (structural → boundary → hierarchy) |
| **Auto Headers** | AI-generated semantic headers for better embedding quality |
| **Hybrid Search** | Vector + BM25 keyword + Knowledge Graph with RRF fusion |
| **Token Budget** | Automatic context control with progressive detail levels |
| **Memory Decay** | Ebbinghaus forgetting curve with spaced repetition |
| **Auto-Consolidation** | Merge similar memories + summarize old episodes |
| **Embedding Cache** | 2-level cache (hot in-memory + persistent SQLite) |
| **Thai Support** | Full Thai language support in tokenization and fact extraction |

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────┐
│                  OpenClawMemory API                  │
├───────────┬───────────┬────────────┬────────────────┤
│  Working  │ Episodic  │  Semantic  │  Procedural    │
│  Memory   │  Memory   │  Memory   │  Memory        │
│ (buffer)  │  (logs)   │ (vectors) │  (skills)      │
├───────────┴───────────┴────────────┴────────────────┤
│              Hybrid Search Engine                    │
│         Vector + BM25 + Knowledge Graph              │
├─────────────────────────────────────────────────────┤
│  Smart Chunker │ Header Injector │ Token Budget     │
├─────────────────────────────────────────────────────┤
│  SQLite + FTS5  │  OpenAI Embeddings  │  Markdown   │
└─────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Install

```bash
git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
cd OpenClaw-Memory-System
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

### 3. Use as Library

```typescript
import { OpenClawMemory } from 'openclaw-memory';

const memory = new OpenClawMemory({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  memoryDir: './memory',
  tokenBudget: 4000,
});

// Start a session
memory.startSession('session-001');
memory.addMessage('user', 'I prefer TypeScript and dark mode');
memory.addMessage('assistant', 'Noted! I will use TypeScript going forward.');
await memory.endSession();

// Store facts
await memory.rememberFact('User prefers TypeScript', ['preference'], 0.8);

// Recall with hybrid search + token budget
const { context, tokensUsed } = await memory.recall('user preferences');
console.log(context);     // Formatted context for LLM
console.log(tokensUsed);  // Token count (always within budget)

// Maintenance (run daily)
memory.decay();                  // Apply forgetting curve
await memory.consolidate();      // Merge + summarize + deduplicate

// Stats
console.log(memory.printStats());

memory.close();
```

### 4. Run Demo

```bash
npm run demo
```

## 📖 API Reference

### Session Management

| Method | Description |
|--------|-------------|
| `startSession(id)` | Start a new conversation session |
| `addMessage(role, content)` | Add message to working memory |
| `endSession()` | Flush working memory → episodic memory |
| `getSessionState()` | Get current session info |

### Store (Remember)

| Method | Description |
|--------|-------------|
| `remember(input)` | Store memory (auto-chunks + embeds) |
| `rememberFact(fact, tags, importance)` | Store a single fact |
| `rememberProcedure(procedure)` | Store a skill/procedure |

### Retrieve (Recall)

| Method | Description |
|--------|-------------|
| `recall(query, options)` | Hybrid search with token budget |
| `recallContext(query, maxTokens)` | Quick recall → string context |
| `getRecentContext(limit)` | Get recent conversation context |
| `getWorkingContext(maxTokens)` | Get current session context |

### Maintenance

| Method | Description |
|--------|-------------|
| `consolidate()` | Merge + summarize + deduplicate memories |
| `decay()` | Apply memory decay (forgetting curve) |
| `merge()` | Merge related memory files |
| `stats()` | Get memory statistics |
| `printStats()` | Pretty-print statistics |

### RecallOptions

```typescript
{
  maxTokens?: number;        // Token budget (default: 4000)
  tiers?: MemoryTier[];      // Filter by tier
  tags?: string[];           // Filter by tags
  topK?: number;             // Max results (default: 20)
  minRelevance?: number;     // Min score 0-1 (default: 0.15)
  includeDecayed?: boolean;  // Include faded memories
  timeRange?: {              // Date range filter
    after?: string;
    before?: string;
  };
}
```

## 🧪 How It Works

### Memory Flow

```
User Message → Working Memory (ring buffer)
     ↓ (session end)
Episodic Memory (conversation log)
     ↓ (consolidation)
Semantic Memory (vector-indexed facts)
     ↓ (pattern detection)
Procedural Memory (learned skills)
```

### Smart Chunking

1. **Structural Split** — Cut along markdown headers
2. **Semantic Boundary** — Detect topic shifts between paragraphs
3. **Size Normalization** — Merge small / split large + add overlap

### Hybrid Search

```
Query → ┌─ Vector Search (50% weight)
        ├─ BM25 Keyword (30% weight)
        └─ Knowledge Graph (20% weight)
                    ↓
          Reciprocal Rank Fusion
                    ↓
             Token Budget Filter
                    ↓
                 Context String
```

### Memory Decay

```
decay_score = importance × retention_rate^(days_since_access)

- decay < 0.1 → archived
- decay < 0.01 → deleted
- Each access → reset timer (spaced repetition)
```

## 📂 Project Structure

```
src/
├── index.ts                 # Main API (OpenClawMemory class)
├── types.ts                 # TypeScript interfaces
├── config.ts                # Configuration & constants
├── demo.ts                  # Interactive demo
├── utils/
│   ├── logger.ts            # Leveled logger
│   ├── tokenizer.ts         # Token counter (tiktoken)
│   └── hasher.ts            # Content hashing
├── storage/
│   ├── sqlite.ts            # SQLite + FTS5 storage
│   └── markdown.ts          # Markdown file manager
├── embedding/
│   ├── embedder.ts          # OpenAI embedding engine
│   └── similarity.ts        # Vector similarity functions
├── chunking/
│   ├── smart-chunker.ts     # 3-phase semantic chunker
│   ├── header-injector.ts   # AI semantic header generator
│   └── auto-merger.ts       # Date + topic file merger
├── memory/
│   ├── working-memory.ts    # Tier 1: Session buffer
│   ├── episodic-memory.ts   # Tier 2: Conversation logs
│   ├── semantic-memory.ts   # Tier 3: Knowledge base
│   └── procedural-memory.ts # Tier 4: Skills & patterns
├── retrieval/
│   ├── hybrid-search.ts     # Vector + BM25 + Graph search
│   └── token-budget.ts      # Context size manager
└── lifecycle/
    ├── decay-manager.ts     # Ebbinghaus forgetting curve
    └── consolidator.ts      # Memory consolidation
```

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | API key (OpenAI, Minimax, etc.) |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Custom API URL |
| `MEMORY_DIR` | `./memory` | Memory file storage |
| `TOKEN_BUDGET` | `4000` | Max tokens per retrieval |
| `MAX_RETRIES` | `3` | Max API retry attempts (for 429/5xx) |
| `RETRY_DELAY` | `1000` | Initial retry delay (ms) |
| `BATCH_SIZE` | `50` | Max items per embedding batch |

### Example: Using with Minimax

```typescript
const memory = new OpenClawMemory({
  openaiApiKey: 'YOUR_MINIMAX_KEY',
  openaiBaseUrl: 'https://api.minimax.chat/v1',
  embeddingModel: 'embo-01',
});
```

### Example: Using with local Ollama
```typescript
const memory = new OpenClawMemory({
  openaiApiKey: 'ollama', // arbitrary
  openaiBaseUrl: 'http://localhost:11434/v1',
  embeddingModel: 'nomic-embed-text',
});
```

## 💰 Cost Analysis

| Volume | Items | Approx Cost (OpenAI text-embedding-3-small) |
|--------|-------|---------------------------------------------|
| Low | 1,000 chunks | ~$0.01 (~0.35 THB) |
| Medium | 10,000 chunks | ~$0.10 (~3.50 THB) |
| High | 100,000 chunks | ~$1.00 (~35.00 THB) |

*Note: The system includes a 2-level cache (Memory + SQLite), so re-embedding the same content costs $0.*

### 🛠 Tips to Reduce Costs

1. **Increase Chunk Size**: Larger chunks = fewer embeddings.
   ```typescript
   chunkSizeMin: 500,  // default: 100
   chunkSizeMax: 2000, // default: 1500
   ```
2. **Use Local Embeddings**: Use Ollama (free) as shown above.
3. **Selective Tiering**: Store trivial conversations only in `Episodic` tier (no vector embedding).

## 📄 License

MIT © OpenClaw
