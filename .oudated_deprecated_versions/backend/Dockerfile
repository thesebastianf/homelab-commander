# ─── Build Stage ───────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /src

# Install build dependencies (git needed for module download)
RUN apk add --no-cache git

# Copy dependency files first for layer-cache efficiency
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build a statically-linked binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /hlc ./cmd/hlc

# ─── Runtime Stage ─────────────────────────────────────────────────────────────
FROM alpine:3.20

# ca-certificates: needed for outbound HTTPS (registry checks, notifications)
# tzdata: allows TZ env var to work correctly
RUN apk add --no-cache ca-certificates tzdata docker-cli docker-cli-compose

WORKDIR /app

# Copy the binary
COPY --from=builder /hlc /app/hlc

# Copy web assets (templates + static files)
COPY web/ /app/web/

# Runtime data directory (mount a volume here)
VOLUME ["/data"]

# Default env (overridable at runtime / docker-compose)
ENV HLC_LISTEN=:8080 \
    HLC_DATA_DIR=/data \
    HLC_DB_PATH=/data/hlc.db \
    HLC_BACKUP_DIR=/data/backups \
    HLC_STACK_DIR=/opt/stacks \
    HLC_NAS_ANCHOR=.nas-ready \
    DOCKER_SOCKET=/var/run/docker.sock

EXPOSE 8080

# Non-root user for runtime security
RUN addgroup -S hlc && adduser -S hlc -G hlc && \
    mkdir -p /data /opt/stacks && \
    chown -R hlc:hlc /data /opt/stacks /app

USER hlc

ENTRYPOINT ["/app/hlc"]
