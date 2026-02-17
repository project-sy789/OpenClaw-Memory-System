FROM node:18-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for TypeScript)
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create directories
RUN mkdir -p /app/memory /app/logs

# Set entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["stats"]
