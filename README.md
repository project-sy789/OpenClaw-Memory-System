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
| **Hybrid Search** | Vector + BM25 keyword + Knowledge Graph with RRF fusion |
| **Token Budget** | Automatic context control with progressive detail levels |
| **Memory Decay** | Ebbinghaus forgetting curve with spaced repetition |
| **Auto-Consolidation** | Merge similar memories + summarize old episodes |
| **Thai Support** | Full Thai language support in tokenization and fact extraction |

---

## 🚀 Quick Start

### 1. Install

```bash
git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
cd OpenClaw-Memory-System
npm install
```

### 2. Configure

Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
# Edit .env with your API keys
```

**Supported Providers:**
- **Minimax** (recommended for Thai): Set `MINIMAX_API_KEY`
- **OpenAI**: Set `OPENAI_API_KEY`

### 3. Run Tests

```bash
# With mock provider (no API needed)
npm run test:mock

# With real API
npm test
```

---

## 💻 CLI Usage

```bash
# Show help
npm run cli

# Remember a fact
npm run cli -- remember "Boss likes coffee" preference food

# Search memories
npm run cli -- recall "what does boss like"

# Show statistics
npm run cli -- stats

# Health check
npm run cli -- health

# Interactive mode
npm run cli -- interactive
```

---

## 🔧 Programmatic Usage

```typescript
import { OpenClawMemory } from './src/index.js';
import { MinimaxProvider } from './src/providers/minimax.js';

// Create provider
const provider = new MinimaxProvider({
    apiKey: process.env.MINIMAX_API_KEY,
    baseUrl: 'https://api.minimaxi.chat/v1',
    embedModel: 'embo-01',
});

// Create memory instance
const memory = new OpenClawMemory({
    aiProvider: provider,
    memoryDir: './memory',
    tokenBudget: 4000,
});

// Store a fact
await memory.rememberFact('Boss likes Thai food', ['preference', 'food']);

// Start session
memory.startSession('session-1');
memory.addMessage('user', 'Hello!');
memory.addMessage('assistant', 'Hi there!');
await memory.endSession();

// Search
const result = await memory.recall('what does boss like?');
console.log(result.context);

// Stats
console.log(memory.stats());

// Health
console.log(await memory.health());
```

---

## 🐳 Docker

```bash
# Build
docker build -t openclaw-memory .

# Run with docker-compose
docker-compose up -d
```

---

## 📁 Project Structure

```
OpenClaw-Memory-System/
├── src/
│   ├── memory/          # 5-tier memory implementations
│   ├── storage/         # SQLite storage layer
│   ├── retrieval/      # Hybrid search engine
│   ├── embedding/       # Embedding utilities
│   ├── providers/       # AI providers (Minimax, OpenAI)
│   └── index.ts        # Main API
├── test/               # Unit tests
├── memory/             # SQLite database (created at runtime)
├── cli.ts              # CLI interface
├── Dockerfile          # Docker image
└── docker-compose.yml  # Docker compose
```

---

## 📄 License

MIT © OpenClaw
