FROM node:20-slim

# Install git and build tools required for git operations and native SQLite compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set default git identity for server operations
RUN git config --global user.name "Canopy Bot" && \
    git config --global user.email "bot@canopy.local" && \
    git config --global init.defaultBranch main

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Default environment configuration
ENV PORT=10000
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PUBLIC_READONLY=true
ENV RATE_LIMIT_PER_MIN=60
ENV DAILY_TOKEN_CAP=200000

EXPOSE 10000

# On boot, startServer auto-seeds deterministic 3,000 file synthetic repo in ~1.5s
CMD ["npm", "run", "server"]
