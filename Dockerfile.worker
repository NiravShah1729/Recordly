FROM node:20-slim

# Install ffmpeg (required for video processing) and openssl (required for Prisma)
RUN apt-get update && \
    apt-get install -y ffmpeg openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files first
COPY package.json package-lock.json ./
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the entire project context (needed for @/lib imports)
COPY . .

# Navigate to worker directory and install its specific dependencies
WORKDIR /app/worker
RUN npm install

# Start the worker process
CMD ["npm", "run", "start"]
