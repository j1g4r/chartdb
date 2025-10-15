FROM node:22-alpine AS builder

ARG VITE_OPENAI_API_KEY
ARG VITE_OPENAI_API_ENDPOINT
ARG VITE_LLM_MODEL_NAME
ARG VITE_HIDE_CHARTDB_CLOUD
ARG VITE_DISABLE_ANALYTICS

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN echo "VITE_OPENAI_API_KEY=${VITE_OPENAI_API_KEY}" > .env && \
    echo "VITE_OPENAI_API_ENDPOINT=${VITE_OPENAI_API_ENDPOINT}" >> .env && \
    echo "VITE_LLM_MODEL_NAME=${VITE_LLM_MODEL_NAME}" >> .env && \
    echo "VITE_HIDE_CHARTDB_CLOUD=${VITE_HIDE_CHARTDB_CLOUD}" >> .env && \
    echo "VITE_DISABLE_ANALYTICS=${VITE_DISABLE_ANALYTICS}" >> .env

RUN npm run build

FROM node:22-alpine AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy built client
COPY --from=builder /usr/src/app/dist ./dist

# Copy server and package files
COPY server ./server
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Environment variables for server
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server/index.js"]