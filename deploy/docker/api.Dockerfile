# syntax=docker/dockerfile:1.7

ARG GO_VERSION=1.26

FROM golang:${GO_VERSION}-alpine AS build

WORKDIR /src

RUN apk add --no-cache ca-certificates git tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/aios-server ./cmd/server

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata wget \
  && addgroup -S app \
  && adduser -S -G app -H -u 10001 app

WORKDIR /app

COPY --from=build /out/aios-server /app/aios-server

RUN mkdir -p /app/logs /data/file_assets \
  && chown -R app:app /app /data

USER app

EXPOSE 18081

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:18081/healthz >/dev/null || exit 1

ENTRYPOINT ["/app/aios-server"]
