FROM node:22-bookworm-slim
WORKDIR /app
COPY holodos/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY holodos/src ./src
COPY holodos/tests ./tests
COPY holodos/twitch-extension ./twitch-extension
COPY holodos/tools/build-twitch-panel.mjs ./tools/build-twitch-panel.mjs
RUN node tools/build-twitch-panel.mjs
# Validate static assets, public routes and JS syntax without touching production SQLite.
RUN node --check src/main.js && node --check src/site-server.js && node --check src/site/site.js && node --check src/site/site-features.js && node --check src/site/cosmetic-gallery.js && node --check src/site/giveaways.js && node tests/extension-panel.test.mjs && node tests/extension-auth.test.mjs && node tests/extension-api.test.mjs && node tests/giveaway-claims.test.mjs && node tests/giveaways.test.mjs && node tests/giveaway-animation.test.mjs && node src/site/smoke.mjs && node tests/release-20261117.test.mjs && node tests/channel-connections.test.mjs && node tests/vp-stock.test.mjs && node tests/shop-issuance.test.mjs && node tests/profile-accordions.test.mjs && node tests/cosmetic-gallery.test.mjs && node tests/debts.test.mjs && node tests/duel-fees.test.mjs
# Railway volumes are mounted as root-owned; SQLite must write to /data.
ENV PORT=3000 DB_PATH=/data/leha.sqlite
EXPOSE 3000
CMD ["node","src/main.js"]
