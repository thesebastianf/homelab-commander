# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine

# -- Stage 1: Build frontend ---------------------------------------------------
FROM node:${NODE_VERSION} AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# -- Stage 2: Install backend prod deps ---------------------------------------
FROM node:${NODE_VERSION} AS backend-deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# -- Stage 3: Build backend ----------------------------------------------------
FROM node:${NODE_VERSION} AS backend-build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# -- Stage 4: Final image ------------------------------------------------------
FROM node:${NODE_VERSION} AS app
WORKDIR /app
# Install docker-cli + docker compose plugin (for native Docker runtime)
RUN apk add --no-cache docker-cli wget git && \
    DOCKER_CLI_PLUGINS_DIR=/usr/lib/docker/cli-plugins && \
    mkdir -p $DOCKER_CLI_PLUGINS_DIR && \
    wget -q https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -O $DOCKER_CLI_PLUGINS_DIR/docker-compose && \
    chmod +x $DOCKER_CLI_PLUGINS_DIR/docker-compose && \
    ln -sf $DOCKER_CLI_PLUGINS_DIR/docker-compose /usr/bin/docker-compose
COPY --from=backend-deps /app/node_modules ./node_modules
COPY --from=backend-build /app/dist ./dist
COPY backend/package.json ./
# Frontend static files served by Express
COPY --from=frontend-build /app/frontend/dist ./public
EXPOSE 3210
CMD ["node", "dist/index.js"]
