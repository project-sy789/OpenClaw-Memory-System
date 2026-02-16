# 🧠 OpenClaw Memory System

ระบบความจำ AI ที่ทรงพลังที่สุด — ติดตั้งง่ายๆ แค่ pull แล้วรัน

[English](./README.en.md) | [ภาษาไทย](./README.md)

---

## ⚡ Quick Start (3 ขั้นตอน)

### 1. Pull & Run

```bash
# Clone
git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
cd OpenClaw-Memory-System

# Run installer (จะถาม API Key หรือจะข้ามได้)
./install.sh
```

**หรือแค่นี้ก็ได้:**

```bash
git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
cd OpenClaw-Memory-System
cp .env.example .env
# แก้ .env ใส่ API Key ของคุณ
docker-compose up -d
```

### 2. ใส่ API Key (ถ้ามี)

```bash
nano .env
```

เลือก provider:
- **Minimax** (แนะนำ ราคาถูก): ใส่ `MINIMAX_API_KEY`
- **OpenAI**: ใส่ `OPENAI_API_KEY`

ถ้าไม่ใส่ API Key ระบบจะใช้ Mock Mode (สำหรับทดสอบ)

### 3. ใช้งาน!

```bash
# ดูสถิติ
docker exec -it openclaw-memory node dist/cli.js stats

# บันทึกความจำ
docker exec -it openclaw-memory node dist/cli.js remember "Boss loves coffee" preference

# ค้นหา
docker exec -it openclaw-memory node dist/cli.js recall "what does boss like"

# โหมดโต้ตอบ
docker exec -it openclaw-memory node dist/cli.js interactive
```

---

## 📖 CLI Commands

| Command | Example | Description |
|---------|---------|-------------|
| `stats` | `cli.js stats` | แสดงสถิติความจำ |
| `remember` | `cli.js remember "text" tag1 tag2` | บันทึกความจำ |
| `recall` | `cli.js recall "query"` | ค้นหาความจำ |
| `session start` | `cli.js session start my-session` | เริ่ม session |
| `session end` | `cli.js session end` | จบ session |
| `chat` | `cli.js chat user "message"` | เพิ่มข้อความ |
| `health` | `cli.js health` | เช็คสถานะระบบ |
| `interactive` | `cli.js interactive` | โหมดโต้ตอบ |

---

## 🔧 Configuration

สร้างไฟล์ `.env`:

```bash
# AI Provider - เลือกอันใดอันหนึ่ง

# Option 1: Minimax (แนะนำ)
MINIMAX_API_KEY=your-key-here
MINIMAX_BASE_URL=https://api.minimaxi.chat/v1
EMBEDDING_MODEL=embo-01

# Option 2: OpenAI  
OPENAI_API_KEY=sk-...

# Settings
MEMORY_DIR=./memory
TOKEN_BUDGET=4000
LOG_LEVEL=info
```

---

## 🐳 Docker Commands

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f

# Rebuild
docker-compose build --no-cache

# CLI inside container
docker exec -it openclaw-memory sh
```

---

## 🔌 Integration with OpenClaw

ใช้เป็น library ในโค้ด:

```typescript
import { OpenClawMemory } from 'openclaw-memory';
import { MinimaxProvider } from 'openclaw-memory/providers/minimax';

const memory = new OpenClawMemory({
    aiProvider: new MinimaxProvider({ apiKey: 'your-key' }),
    memoryDir: './memory'
});

// บันทึก
await memory.rememberFact('User likes dark mode', ['preference']);

// ค้นหา
const result = await memory.recall('user preferences');
```

---

## 📁 Project Structure

```
OpenClaw-Memory-System/
├── src/              # Source code
├── test/             # Unit tests  
├── memory/           # SQLite database (สร้างอัตโนมัติ)
├── logs/             # Log files
├── cli.ts            # CLI interface
├── Dockerfile        # Docker image
├── docker-compose.yml # Docker compose
├── install.sh        # Installer script
└── .env.example     # ตัวอย่าง config
```

---

## 🚀 Features

- ✅ 5-Tier Memory (Working, Episodic, Semantic, Procedural, Meta)
- ✅ Hybrid Search (Vector + BM25 + Knowledge Graph)
- ✅ Thai Language Support
- ✅ Memory Decay & Consolidation
- ✅ Token Budget Management
- ✅ Docker-native Deployment

---

## 📄 License

MIT © OpenClaw
