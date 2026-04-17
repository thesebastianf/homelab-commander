# syntax=docker/dockerfile:1.7
# Used for local docker-compose builds (context: repo root)

ARG NODE_VERSION=22-alpine

# -- Stage 1: Build frontend ---------------------------------------------------
FROM node:${NODE_VERSION} AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# -- Stage 2: Backend dev (npm run dev) ---------------------------------------
FROM node:${NODE_VERSION} AS development
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./public
CMD ["npm", "run", "dev"]

# -- Stage 3: Backend prod deps ------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# -- Stage 4: Build backend ----------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# -- Stage 5: Production image -------------------------------------------------
FROM node:${NODE_VERSION} AS production
WORKDIR /app
RUN apk add --no-cache docker-cli wget git
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/package.json ./
COPY --from=frontend-build /app/frontend/dist ./public
EXPOSE 3210
CMD ["node", "dist/index.js"]
