#!/bin/bash
# ============================================================
# OpenClaw Memory System - One-Click Installer
# Usage: curl -sL https://raw.githubusercontent.com/project-sy789/OpenClaw-Memory-System/main/install.sh | bash
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧠 OpenClaw Memory System Installer${NC}"
echo "======================================"

# Check if running in a repo or need to clone
if [ ! -f "docker-compose.memory.yml" ]; then
    echo -e "\n${YELLOW}📥 Cloning OpenClaw Memory System...${NC}"
    if [ -d "OpenClaw-Memory-System" ]; then
        echo -e "${YELLOW}⚠️  Directory OpenClaw-Memory-System already exists. Entering...${NC}"
        cd OpenClaw-Memory-System
    else
        git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
        cd OpenClaw-Memory-System
    fi
else
    echo -e "${GREEN}✅ Found project files${NC}"
fi

# Check prerequisites
echo -e "\n${YELLOW}📋 Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "   Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker found${NC}"

# Ensure we are in the correct directory (already handled above)

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "\n${YELLOW}⚙️  Creating environment file...${NC}"
    
    # Ask for API key
    echo -e "\n${BLUE}📝 Enter your API credentials:${NC}"
    echo "   (Leave empty to use mock provider for testing)"
    echo ""
    
    if [ -c /dev/tty ]; then
        read -p "   Minimax API Key (optional): " MINIMAX_KEY < /dev/tty
        read -p "   OpenAI API Key (optional): " OPENAI_KEY < /dev/tty
    else
        echo -e "${YELLOW}⚠️  Non-interactive mode. Skipping API key setup.${NC}"
        MINIMAX_KEY=""
        OPENAI_KEY=""
    fi
    
    # Create .env file
    cat > .env << EOF
# OpenClaw Memory System Configuration
# ====================================

# Choose your AI Provider (uncomment one):
# ----------------------------------------

# Option 1: Minimax (recommended for Thai)
MINIMAX_API_KEY=${MINIMAX_KEY:-}
MINIMAX_BASE_URL=https://api.minimaxi.chat/v1
EMBEDDING_MODEL=embo-01
EMBEDDING_DIMENSIONS=1024

# Option 2: OpenAI
# OPENAI_API_KEY=${OPENAI_KEY:-}
# EMBEDDING_MODEL=text-embedding-3-small
# EMBEDDING_DIMENSIONS=1536

# Memory Configuration
# ----------------------------------------
MEMORY_DIR=./memory
TOKEN_BUDGET=4000
DECAY_RETENTION_RATE=0.95
CONSOLIDATION_INTERVAL=24

# Log Level: debug|info|warn|error
LOG_LEVEL=info
EOF
    
    echo -e "${GREEN}✅ Created .env file${NC}"
fi

# Create memory directory
mkdir -p memory
echo -e "${GREEN}✅ Created memory directory${NC}"

# Build Docker image
echo -e "\n${YELLOW}🐳 Building Docker image...${NC}"
docker build -t openclaw-memory:latest . --no-cache 2>/dev/null || \
docker build -t openclaw-memory:latest . 

echo -e "${GREEN}✅ Docker image built${NC}"

# Show status
echo -e "\n${BLUE}🎉 Installation Complete!${NC}"
echo "======================================"
echo ""
echo -e "${GREEN}Quick Start:${NC}"
echo "   docker-compose up -d"
echo ""
echo -e "${GREEN}View Logs:${NC}"
echo "   docker-compose logs -f"
echo ""
echo -e "${GREEN}CLI Usage:${NC}"
echo "   docker exec -it openclaw-memory node dist/cli.js stats"
echo ""
echo -e "${GREEN}Interactive CLI:${NC}"
echo "   docker exec -it openclaw-memory node dist/cli.js interactive"
echo ""

# Ask to start
if [ -c /dev/tty ]; then
    read -p "Start now? (y/n): " -n 1 -r < /dev/tty
else
    REPLY="n"
fi
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose up -d
    echo -e "\n${GREEN}✅ Running! Check: docker-compose logs -f${NC}"
fi
