# OpenClaw Integration Guide

This guide explains how to integrate OpenClaw Memory System with your OpenClaw AI assistant.

## Option 1: REST API (Recommended)

The easiest way - just call the HTTP API:

```typescript
// In your OpenClaw agent code
const memoryApi = 'http://openclaw-memory-api:3000';

// Remember facts
await fetch(`${memoryApi}/facts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        content: 'User prefers dark mode',
        tags: ['preference', 'ui']
    })
});

// Recall memories
const result = await fetch(`${memoryApi}/recall?q=user preferences`);
const { context } = await result.json();
```

## Option 2: Direct Import

Import directly as a library:

```typescript
import { OpenClawMemory } from 'openclaw-memory';
import { MinimaxProvider } from 'openclaw-memory/providers/minimax';

// In your agent initialization
const memory = new OpenClawMemory({
    aiProvider: new MinimaxProvider({
        apiKey: process.env.MINIMAX_API_KEY
    }),
    memoryDir: './memory'
});

// Use in conversation
await memory.rememberFact('User name is John', ['person', 'name']);
const result = await memory.recall('user name');
```

## Option 3: Docker Network

If running in Docker Compose:

```yaml
# docker-compose.yml for your agent
services:
  your-agent:
    # ... your agent config
    network_mode: service:openclaw-memory-api
    # Now you can call localhost:3000
```

## Environment Variables

For OpenClaw, add to your `.env`:

```bash
# Memory System
MEMORY_API_URL=http://openclaw-memory-api:3000
MINIMAX_API_KEY=your-key-here
```

## Complete Example

See `integration-example.ts` for a full example of how to integrate with an AI agent.

## Troubleshooting

1. **Connection refused**: Make sure both services are in the same Docker network
2. **API errors**: Check logs with `docker-compose logs api`
3. **Memory not saving**: Check volume mount `./memory:/app/memory`
