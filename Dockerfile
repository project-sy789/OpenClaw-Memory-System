# OpenClaw Memory System Dockerfile

FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .
RUN npm run build || echo "Build skipped (using tsx)"

# Create memory directory
RUN mkdir -p /app/memory

# Expose port (for future API server)
EXPOSE 3000

# Default command
CMD ["node", "dist/index.js"]
