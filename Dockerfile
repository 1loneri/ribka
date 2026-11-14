FROM node:22-bookworm-slim
WORKDIR /app
COPY holodos/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY holodos/src ./src
# Validate static assets, public routes and JS syntax without touching production SQLite.
RUN node --check src/main.js && node --check src/site-server.js && node --check src/site/site.js && node src/site/smoke.mjs
# Railway volumes are mounted as root-owned; SQLite must write to /data.
ENV PORT=3000 DB_PATH=/data/leha.sqlite
EXPOSE 3000
CMD ["node","src/main.js"]
