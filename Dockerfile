FROM node:18-bookworm-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies
RUN npm install

# Copy source code
COPY src/ ./src/
COPY cli.ts ./
COPY server.ts ./
COPY export.ts ./
COPY dashboard.html ./
COPY docker-entrypoint.sh ./
COPY tsconfig.json ./
COPY .env.example ./

# Build TypeScript
RUN npx tsc

# Create directories  
RUN mkdir -p memory logs

EXPOSE 3001

CMD ["node", "dist/cli.js"]
