FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy configuration (pins x/time and otelhttp)
COPY go.mod ./

# Copy core source
COPY main.go ./

# Internal tidy and dependency resolve
# Forced to resolve based on go.mod replacements
RUN go mod tidy
RUN go build -o main .

# Runtime stage
FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/main .
EXPOSE 8081
RUN chmod +x ./main
CMD ["./main"]
