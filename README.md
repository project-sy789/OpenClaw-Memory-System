# 🧠 OpenClaw Memory System

ระบบความจำ AI ที่ทรงพลังที่สุด — ติดตั้งง่ายและยืดหยุ่น

[English](./README.en.md) | [ภาษาไทย](./README.md)

---

## 📦 Installation Options

### ⚡ วิธีง่ายที่สุด (สำหรับคนที่มี OpenClaw Docker อยู่แล้ว)
ไม่ต้องเขียนโค้ด! แค่รันชุดคำสั่งนี้ใน Folder เดียวกับ OpenClaw:

```bash
# 1. Download & Install
git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
cd OpenClaw-Memory-System
bash install.sh
```
> ระบบจะถาม API Key นิดหน่อย แล้วเริ่มทำงานให้เลยที่ `http://localhost:3001`

---

### รายละเอียดเพิ่มเติม (สำหรับ Dev):

OpenClaw รองรับการติดตั้ง 2 รูปแบบหลัก:

### Option A: แบบ Service แยก (Docker Sidecar) - แนะนำ
เหมาะสำหรับรัน OpenClaw เป็น Container อิสระ (Service) แล้วเชื่อมต่อจาก App หลักของคุณผ่าน Network (เหมือน Database)

1. **Setup & Run:**
   ```bash
   git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
   cd OpenClaw-Memory-System
   cp .env.example .env
   # แก้ไข .env ใส่ API Key ของคุณ
   ```

2. **Run:**
   ```bash
   docker-compose up -d
   ```

3. **Use CLI (via Docker):**
   ```bash
   # ดูสถิติ
   docker exec -it openclaw-memory openclaw stats
   
   # บันทึกความจำ
   docker exec -it openclaw-memory openclaw remember "Boss loves coffee" preference
   
   # ค้นหา
   docker exec -it openclaw-memory openclaw recall "what does boss like"
   ```

---

### Option B: แบบฝังในโปรเจค (NPM Library)
เหมาะสำหรับ Developer ที่ต้องการ `import` OpenClaw ไปใช้ใน Code TypeScript/Node.js ของคุณโดยตรง (รันใน Docker Container ของ App หลัก หรือ Local)

1. **Install Dependencies:**
   ```bash
   npm install
   npm run build
   ```

2. **Run CLI Locally:**
   ```bash
   # ผ่าน npm script
   npm run cli stats
   
   # หรือ link เพื่อเรียกคำสั่ง openclaw ทั่วเครื่อง
   npm link
   openclaw interactive
   ```

3. **Import Library:**
   ```typescript
   import { OpenClawMemory } from './dist'; // หรือ path ที่ถูกต้อง
   // ... usage ...
   ```

---

## ⚡ Quick Start (ติดตั้งแบบด่วน)

```bash
# Clone
git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
cd OpenClaw-Memory-System

# Run Installer (Interactive Setup)
./install.sh
```

---

## 📖 CLI Commands

รองรับทั้งผ่าน Docker และ Local (`openclaw` หรือ `npm run cli`)

| Command | Example | Description |
|---------|---------|-------------|
| `stats` | `openclaw stats` | แสดงสถิติความจำและ Meta-Memory Insights |
| `remember` | `openclaw remember "text" tag` | บันทึกความจำใหม่ |
| `recall` | `openclaw recall "query"` | ค้นหาความจำ (รองรับ -m brain/hybrid/auto) |
| `health` | `openclaw health` | เช็คสถานะระบบและ API Connection |
| `interactive` | `openclaw interactive` | โหมด Chat โต้ตอบกับความจำ |

---

## 🔧 Configuration

สร้างไฟล์ `.env`:

```bash
# AI Provider - เลือกอันใดอันหนึ่ง

# Option 1: Minimax (แนะนำ - ประหยัด)
MINIMAX_API_KEY=your-key-here
MINIMAX_BASE_URL=https://api.minimaxi.chat/v1
# EMBEDDING_MODEL=embo-01

# Option 2: OpenAI  
OPENAI_API_KEY=sk-...

# System Settings
MEMORY_DIR=./memory
TOKEN_BUDGET=4000
LOG_LEVEL=info
SEARCH_MODE=auto  # auto, brain, hybrid
```

---

## 🚀 Features

- ✅ **5-Tier Memory** (Working, Episodic, Semantic, Procedural, **Meta**)
- ✅ **Brain-Powered Search** (ค้นหาไม่ต้องใช้ Embedding API)
- ✅ **Hybrid Search** (Vector + BM25 + Knowledge Graph)
- ✅ **Thai Language Support**
- ✅ **Docker-native** Deployment

---

## 📄 License

MIT © OpenClaw
