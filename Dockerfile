FROM node:22-slim

# Install git, ca-certificates, and build tools
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

# Pre-seed the synthetic monorepo during build so container boot is instant (<50ms)
RUN mkdir -p /app/data && node --experimental-sqlite -e "import('./dist/seed.js').then(m => m.seedRepository('/app/data'))"

# Default environment configuration
ENV PORT=10000
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PUBLIC_READONLY=true
ENV RATE_LIMIT_PER_MIN=60
ENV DAILY_TOKEN_CAP=200000
ENV NODE_OPTIONS="--experimental-sqlite"

EXPOSE 10000

# Docker healthcheck querying /healthz on port 10000 using built-in Node fetch
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:10000/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
