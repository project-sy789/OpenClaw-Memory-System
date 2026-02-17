#!/bin/bash
# ============================================================
# OpenClaw Memory System — One-Command Installer
# ============================================================
# Usage:
#   curl -sSL https://raw.githubusercontent.com/project-sy789/OpenClaw-Memory-System/main/scripts/install.sh | bash
#   OR: git clone ... && cd OpenClaw-Memory-System && bash scripts/install.sh
# ============================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║    🧠 OpenClaw Memory System v2.0        ║"
echo "  ║    Brain-Powered + 5-Tier Memory         ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# --- Check if we're in a git repo ---
if [ -f "package.json" ] && grep -q "openclaw" package.json 2>/dev/null; then
    echo -e "${BLUE}📁 Found existing OpenClaw directory.${NC}"
    OPENCLAW_DIR="."
else
    echo -e "${BLUE}📥 Cloning OpenClaw Memory System...${NC}"
    git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
    OPENCLAW_DIR="OpenClaw-Memory-System"
fi

cd "$OPENCLAW_DIR"

# --- Check Node.js ---
echo -e "\n${BLUE}🔍 Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not found.${NC}"
    echo "   Install from: https://nodejs.org (v18+)"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}⚠️ Node.js v18+ recommended. Current: $(node -v)${NC}"
fi
echo -e "  Node.js: $(node -v) ✅"

# --- Check npm ---
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is required but not found.${NC}"
    exit 1
fi
echo -e "  npm: $(npm -v) ✅"

# --- Install dependencies ---
echo -e "\n${BLUE}📦 Installing dependencies...${NC}"
npm install

# --- Build TypeScript ---
echo -e "\n${BLUE}🔨 Building TypeScript...${NC}"
npm run build

# --- Create memory directory ---
echo -e "\n${BLUE}📁 Creating memory directory...${NC}"
mkdir -p memory
chmod 755 memory

# --- Done ---
echo -e "\n${GREEN}✨ OpenClaw Memory System installed successfully!${NC}"
echo ""
echo -e "${BLUE}Quick Start:${NC}"
echo ""
echo "  import { OpenClawMemory, OpenAIProvider } from 'openclaw-memory';"
echo ""
echo "  const memory = new OpenClawMemory({"
echo "    aiProvider: new OpenAIProvider(process.env.OPENAI_API_KEY),"
echo "    searchMode: 'auto', // auto | brain | hybrid"
echo "  });"
echo ""
echo "  await memory.rememberFact('User prefers TypeScript.');"
echo "  const { context } = await memory.recall('What does the user prefer?');"
echo ""
echo -e "${YELLOW}📖 Docs: README.md${NC}"
echo -e "${YELLOW}🧪 Test: npx tsx src/scripts/test-brain-search.ts${NC}"
