# ─── Stage 1: Build Tailwind + emit config.js ──────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Install only the manifest first for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Copy sources and build
COPY tailwind.config.js postcss.config.js ./
COPY src ./src
COPY scripts ./scripts
COPY index.html ./
COPY app.js ./

ARG API_BASE=""
ARG APP_VERSION="1.2.0"
ARG ENV_NAME="production"
ENV API_BASE=${API_BASE}
ENV APP_VERSION=${APP_VERSION}
ENV ENV_NAME=${ENV_NAME}

RUN npm run build

# ─── Stage 2: Runtime — minimal Nginx image ─────────────────────────────
FROM nginx:1.27-alpine

# Replace default config with ours
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=builder /build/index.html /usr/share/nginx/html/
COPY --from=builder /build/app.js      /usr/share/nginx/html/
COPY --from=builder /build/dist        /usr/share/nginx/html/dist

# Default Nginx port
EXPOSE 80

# Healthcheck for orchestrators
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

# Nginx already provides CMD ["nginx", "-g", "daemon off;"]
CMD ["nginx", "-g", "daemon off;"]
