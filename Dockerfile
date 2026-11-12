FROM node:22-bookworm-slim
WORKDIR /app
COPY holodos/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY holodos/src ./src
USER node
ENV PORT=3000 DB_PATH=/data/leha.sqlite
EXPOSE 3000
CMD ["node","src/main.js"]
