#!/bin/bash
# ============================================================
# OpenClaw Memory System - Backup Script
# 
# Usage: ./backup.sh [github-token]
# 
# Or set GITHUB_TOKEN environment variable
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🗄️  Backing up OpenClaw Memory...${NC}"

# Check for token
TOKEN=${1:-$GITHUB_TOKEN}
REPO=${2:-"project-sy789/ArinaBOT"}
BRANCH=${3:-"main"}

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ GitHub token required${NC}"
    echo "Usage: ./backup.sh <github-token> [repo] [branch]"
    echo "Or set GITHUB_TOKEN env variable"
    exit 1
fi

# Get memory directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORY_DIR="$SCRIPT_DIR/memory"
BACKUP_FILE="$SCRIPT_DIR/memory-backup-$(date +%Y%m%d-%H%M%S).db"

# Check if memory dir exists
if [ ! -d "$MEMORY_DIR" ]; then
    echo -e "${RED}❌ Memory directory not found: $MEMORY_DIR${NC}"
    exit 1
fi

# Find SQLite database
DB_FILE=$(find "$MEMORY_DIR" -name "*.db" -type f 2>/dev/null | head -1)

if [ -z "$DB_FILE" ]; then
    echo -e "${YELLOW}⚠️  No database found to backup${NC}"
    exit 0
fi

echo -e "${GREEN}📦 Database: $DB_FILE${NC}"

# Create backup
cp "$DB_FILE" "$BACKUP_FILE"
echo -e "${GREEN}✅ Created backup: $BACKUP_FILE${NC}"

# Commit to GitHub (optional)
cd "$SCRIPT_DIR"

# Check if git is initialized
if [ -d ".git" ]; then
    echo -e "${YELLOW}📤 Syncing to GitHub...${NC}"
    
    # Add memory files
    git add memory/ || true
    
    # Check if anything changed
    if git diff --staged --quiet; then
        echo -e "${YELLOW}📝 No changes to commit${NC}"
    else
        git commit -m "Auto-backup: $(date '+%Y-%m-%d %H:%M')" || true
        git push origin main || echo -e "${YELLOW}⚠️  Push failed (this is OK for local dev)${NC}"
    fi
fi

# Show backup size
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo -e "${GREEN}✅ Backup complete! Size: $SIZE${NC}"

# Keep only last 5 backups
ls -t "$SCRIPT_DIR"/memory-backup-*.db 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
echo -e "${GREEN}🧹 Cleaned old backups${NC}"
