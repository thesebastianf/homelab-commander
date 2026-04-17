# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine

# --------------------
# Backend image targets
# --------------------
FROM node:${NODE_VERSION} AS backend-base
WORKDIR /app/backend

FROM backend-base AS backend-deps
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

FROM backend-base AS backend-build
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:${NODE_VERSION} AS backend
WORKDIR /app
RUN apk add --no-cache docker-cli wget git
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY backend/package.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]

# ---------------------
# Frontend image targets
# ---------------------
FROM node:${NODE_VERSION} AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine AS frontend
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
