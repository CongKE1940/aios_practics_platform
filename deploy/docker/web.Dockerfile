# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build

WORKDIR /src

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

ARG APP_FILTER
ARG APP_DIR
ARG VITE_API_BASE_URL

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN pnpm --filter ${APP_FILTER} build

FROM nginx:1.27-alpine

COPY deploy/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/${APP_DIR}/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
