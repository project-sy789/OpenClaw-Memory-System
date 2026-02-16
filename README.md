# 🧠 OpenClaw Memory System

ระบบความจำระยะยาวขั้นสูงสำหรับ AI Agent — เก็บ, จัดโครงสร้าง, และค้นหาความทรงจำอย่างชาญฉลาดด้วย vector embeddings

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Brain-Delegate** | **New!** Fully decoupled from API keys. Host provides the AI capabilities. |
| **5-Tier Memory** | Working → Episodic → Semantic → Procedural → Meta |
| **Smart Chunking** | 3-phase semantic chunking (structural → boundary → hierarchy) |
| **Auto Headers** | AI-generated semantic headers for better embedding quality |
| **Hybrid Search** | Vector + BM25 keyword + Knowledge Graph with RRF fusion |
| **Token Budget** | Automatic context control with progressive detail levels |
| **Memory Decay** | Ebbinghaus forgetting curve with spaced repetition |
| **Auto-Consolidation** | Merge similar memories + summarize old episodes |
| **Embedding Cache** | 2-level cache (hot in-memory + persistent SQLite) |
| **Thai Support** | Full Thai language support in tokenization and fact extraction |
| **Persistent Config** | Non-sensitive settings (budget, logs) stored in SQLite (Docker-friendly) |

## 🏗 Architecture (Delegated AI)

OpenClaw Memory acts as a **Pure Memory Hub**. It does not own API keys; instead, it delegates all AI tasks (embeddings, chat completions) to the host application via a standardized `AIProvider` interface.

```
┌─────────────────────────────────────────────────────┐
│                  OpenClawMemory API                  │
├───────────┬───────────┬────────────┬────────────────┤
│  Working  │ Episodic  │  Semantic  │  Procedural    │
│  Memory   │  Memory   │  Memory   │  Memory        │
├───────────┴───────────┴────────────┴────────────────┤
│              Hybrid Search Engine                    │
│         Vector + BM25 + Knowledge Graph              │
├─────────────────────────────────────────────────────┤
│      AIProvider Interface (Delegated to Host)       │
├─────────────────────────────────────────────────────┤
│  SQLite + FTS5  │ AI (Embed/Chat)  │  Markdown      │
└─────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Install

```bash
git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
cd OpenClaw-Memory-System
npm install
```

### 2. Implement the AI Provider
The host application manages the API keys and provides the AI logic. You can use the built-in `OpenAIProvider` for easy setup:

```typescript
import { OpenClawMemory, OpenAIProvider } from 'openclaw-memory';

// 1. Host manages API keys
const provider = new OpenAIProvider(process.env.OPENAI_API_KEY!);

// 2. Initialize Memory with the provider
const memory = new OpenClawMemory({
  aiProvider: provider,
  memoryDir: './memory',
  tokenBudget: 4000,
});
```

### 3. Usage Example

```typescript
// Start a session (Episodic)
memory.startSession('session-001');
memory.addMessage('user', 'I prefer TypeScript and dark mode');
await memory.endSession();

// Store specific facts (Semantic)
await memory.rememberFact('User prefers dark mode', ['preference'], 0.8);

// Recall with hybrid search
const { context } = await memory.recall('user preferences');
console.log(context); 

// Maintenance (Run periodically)
memory.decay();                  // Apply forgetting curve
await memory.consolidate();      // Organize memories + Summarize
```

## 📖 API Reference

### Session Management

| Method | Description |
|--------|-------------|
| `startSession(id)` | Start a new conversation session |
| `addMessage(role, content)` | Add message to working memory |
| `endSession()` | Flush working memory → episodic memory |

### Memory Interaction

| Method | Description |
|--------|-------------|
| `rememberFact(fact, tags, importance)` | Store a single fact |
| `recall(query, options)` | Hybrid search with token budget |
| `recallContext(query, maxTokens)` | Quick recall → formatted string |
| `health()` | Check system status (DB + AI Provider) |
| `updateConfig(config)` | Update and persist settings (Budget, LogLevel, etc.) |

### `AIProvider` Interface
Implement this to use any AI model (Local or API):
```typescript
interface AIProvider {
  embed(texts: string[]): Promise<number[][]>;
  chat(messages: any[], options?: any): Promise<string>;
  checkHealth(): Promise<{ status: 'ok' | 'error'; latency?: number }>;
}
```

## 🧪 How It Works

### Memory Flow
```
User Message → Working Memory (buffer)
     ↓ (session end)
Episodic Memory (conversation log)
     ↓ (consolidation)
Semantic Memory (vector-indexed facts)
```

### Hybrid Search
Queries are processed through **Vector Similarity**, **BM25 Keyword Matching**, and **Knowledge Graph Navigation**, with results merged using **Reciprocal Rank Fusion (RRF)** to ensure the most relevant context is retrieved first.

## 💰 Cost Analysis (Approx.)
The system is highly optimized. Using `text-embedding-3-small`:
- 1,000 chunks: ~$0.01
- 10,000 chunks: ~$0.10
- *Note: Persistence and caching ensure you never pay for the same embedding twice.*

## 📄 License
MIT © OpenClaw
