FROM node:18-slim

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy all files
COPY . .

# Install dependencies
RUN npm install

# Build
RUN npm run build

# Create directories
RUN mkdir -p memory logs

EXPOSE 3001

CMD ["node", "dist/server.js"]
