# ── EMS — એક જ કન્ટેનરમાં frontend (built) + backend API ──
FROM node:20-slim

WORKDIR /app

# Server deps (prod only)
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

# Client deps
COPY client/package*.json client/
RUN cd client && npm ci --no-audit --no-fund

# બાકીનો કોડ + frontend build
COPY . .
RUN cd client && npm run build

ENV NODE_ENV=production \
    PORT=4000 \
    COOKIE_SECURE=true

EXPOSE 4000
CMD ["node", "server/src/server.js"]
