# syntax=docker/dockerfile:1
# Development-only Dockerfile (Vite dev server + HMR). Production uses Dockerfile.prod (Nginx).
FROM node:20-alpine

ARG VITE_API_BASE_URL
ARG VITE_ALLOWED_HOSTS
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS}

WORKDIR /app
COPY package*.json ./
# npm can exit 0 after "Exit handler never called!" with a half-empty node_modules,
# so fail the build here instead of at container start ("vite: not found").
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev \
    && test -x node_modules/.bin/vite
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
