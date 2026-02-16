#!/bin/bash
# ============================================================
# OpenClaw Memory System - Health Monitor
# 
# Usage: ./health-monitor.sh [interval-seconds]
# Default: 60 seconds
# ============================================================

INTERVAL=${1:-60}

echo "🟢 OpenClaw Memory Health Monitor"
echo "==================================="
echo "Checking every ${INTERVAL} seconds..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

while true; do
    # Check if container is running
    if docker ps --format '{{.Names}}' | grep -q "openclaw-memory"; then
        # Get stats
        STATS=$(docker exec openclaw-memory node dist/cli.js stats 2>/dev/null || echo "error")
        
        if echo "$STATS" | grep -q "error"; then
            echo -e "${RED}[$(date)] ❌ Memory system error${NC}"
        else
            CHUNKS=$(echo "$STATS" | grep -o '"totalChunks":[0-9]*' | cut -d: -f2)
            echo -e "${GREEN}[$(date)] ✅ OK - Total Memories: $CHUNKS${NC}"
        fi
    else
        echo -e "${RED}[$(date)] ❌ Container not running${NC}"
    fi
    
    sleep $INTERVAL
done
