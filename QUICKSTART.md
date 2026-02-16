# 🚀 OpenClaw Memory System - Quick Reference

## One-Command Setup

```bash
git clone https://github.com/project-sy789/OpenClaw-Memory-System.git
cd OpenClaw-Memory-System
cp .env.example .env
docker-compose up -d
```

## Docker Commands

```bash
# CLI Mode
docker-compose up -d              # Start CLI
docker-compose exec memory stats   # View stats

# API Server
docker-compose up -d api           # Start API
curl http://localhost:3000        # Web UI
curl http://localhost:3000/stats  # JSON stats

# Stop
docker-compose down
```

## CLI Commands

```bash
# Remember facts
docker exec openclaw-memory node dist/cli.js remember "Boss loves coffee" preference food

# Search
docker exec openclaw-memory node dist/cli.js recall "what does boss like"

# Stats
docker exec openclaw-memory node dist/cli.js stats

# Health
docker exec openclaw-memory node dist/cli.js health
```

## REST API

```bash
# Health
curl http://localhost:3000/health

# Stats
curl http://localhost:3000/stats

# Remember
curl -X POST http://localhost:3000/facts \
  -H "Content-Type: application/json" \
  -d '{"content": "Boss likes Thai food", "tags": ["food", "preference"]}'

# Recall
curl "http://localhost:3000/recall?q=what does boss like"

# Session
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "my-session"}'

curl -X POST http://localhost:3000/sessions/my-session/messages \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "Hello!"}'

curl -X POST http://localhost:3000/sessions/my-session/end
```

## Environment Variables

```bash
# .env
MINIMAX_API_KEY=your-key        # Required for production
OPENAI_API_KEY=your-key         # Alternative
MEMORY_DIR=./memory            # Database location
TOKEN_BUDGET=4000              # Max tokens for recall
LOG_LEVEL=info                 # Debug|info|warn|error
```

## Troubleshooting

```bash
# View logs
docker-compose logs -f

# Rebuild
docker-compose build --no-cache

# Shell access
docker exec -it openclaw-memory sh

# Reset database
rm -rf memory/*.db && docker-compose restart
```

## Files

| File | Purpose |
|------|---------|
| `install.sh` | One-click installer |
| `backup.sh` | Backup to GitHub |
| `health-monitor.sh` | Monitor health |
| `server.ts` | REST API server |
| `cli.ts` | CLI interface |
| `dashboard.html` | Web UI |
| `export.ts` | Import/Export |

## Links

- 📖 Docs: https://github.com/project-sy789/OpenClaw-Memory-System
- 🐛 Issues: https://github.com/project-sy789/OpenClaw-Memory-System/issues
