import express from "express";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.FISHING_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

const dbConfig = process.env.PGHOST
  ? {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "postgres",
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 3
    }
  : {
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
      max: 3
    };

const pool = new Pool(dbConfig);

const items = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "items.json"), "utf8"));

// Номер товара в !магазин начинается с 1.
// Уровень удочки в базе начинается с 2, поэтому номер товара и level — разные значения.
const shopRods = [
  { id: "rod2", number: 1, level: 2, name: "Улучшенная удочка", emoji: "🎣", price: 100 },
  { id: "rod3", number: 2, level: 3, name: "Серебряная удочка", emoji: "✨", price: 500 },
  { id: "rod4", number: 3, level: 4, name: "Золотая удочка", emoji: "👑", price: 2000 },
  { id: "rod5", number: 4, level: 5, name: "VOID-удочка", emoji: "🌌", price: 10000 }
];

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      coins INTEGER NOT NULL DEFAULT 0,
      catches INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      last_catch BIGINT NOT NULL DEFAULT 0,
      rod_level INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS inventory (
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(username, item_id)
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS rod_level INTEGER NOT NULL DEFAULT 1;
  `);
}

function weightedPick(list) {
  const total = list.reduce((sum, item) => sum + Number(item.weight), 0);
  let roll = Math.random() * total;
  for (const item of list) {
    roll -= Number(item.weight);
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 25);
}

async function getUser(username) {
  const name = cleanUsername(username);
  if (!name) return null;
  await pool.query("INSERT INTO users(username) VALUES ($1) ON CONFLICT(username) DO NOTHING", [name]);
  const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [name]);
  return rows[0];
}

async function addCatch(username, item) {
  const user = await getUser(username);
  if (!user) return { error: "bad_username" };
  const now = Date.now();
  const last = Number(user.last_catch || 0);
  const cooldown = 20_000;
  if (now - last < cooldown) return { cooldown: true, seconds: Math.ceil((cooldown - (now - last)) / 1000), username: user.username };
  const newStreak = last > 0 && now - last <= 120_000 ? Number(user.streak) + 1 : 1;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE users SET coins = coins + $1, catches = catches + 1, streak = $2, last_catch = $3 WHERE username = $4`, [item.value, newStreak, now, user.username]);
    await client.query(`INSERT INTO inventory(username, item_id, amount) VALUES ($1, $2, 1) ON CONFLICT(username, item_id) DO UPDATE SET amount = inventory.amount + 1`, [user.username, item.id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally { client.release(); }
  const updated = await getUser(user.username);
  return { cooldown: false, username: user.username, item, streak: newStreak, balance: Number(updated.coins) };
}

function requireKey(req, res, next) {
  if (!API_KEY || req.query.key !== API_KEY) return res.status(401).send("unauthorized");
  next();
}

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true, database: "connected", items: items.length }); }
  catch { res.status(503).json({ ok: false, database: "error" }); }
});

app.get("/fish", requireKey, async (req, res) => {
  try {
    const username = req.query.user;
    if (!username) return res.status(400).send("Не удалось определить зрителя.");
    const result = await addCatch(username, weightedPick(items));
    if (result.cooldown) return res.send(`@${username}, 🎣 подожди ещё ${result.seconds} сек.`);
    const { item, streak, balance } = result;
    let message = `🎣 @${username} поймала ${item.emoji} ${item.name} [${item.rarity.toUpperCase()}] • шанс ${item.chance}% • +${item.value} 🪙`;
    if (streak >= 3) message += ` • 🔥 серия ${streak}`;
    message += ` • баланс ${balance} 🪙`;
    res.send(message);
  } catch (error) { console.error(error); res.status(500).send("🎣 Рыбалка временно сломалась. Попробуй ещё раз."); }
});

app.get("/inventory", requireKey, async (req, res) => {
  try {
    const username = cleanUsername(req.query.user);
    if (!username) return res.status(400).send("Не указан пользователь.");
    const { rows } = await pool.query("SELECT item_id, amount FROM inventory WHERE username = $1 ORDER BY amount DESC", [username]);
    if (!rows.length) return res.send(`🎒 @${username}, твой садок пока пуст 🐟`);
    const map = new Map(items.map(x => [x.id, x]));
    const text = rows.slice(0, 8).map(x => `${map.get(x.item_id)?.emoji || "❔"} ${map.get(x.item_id)?.name || x.item_id} ×${x.amount}`).join(" | ");
    res.send(`🎒 @${username}: ${text}`);
  } catch (error) { console.error(error); res.status(500).send("Не удалось открыть инвентарь."); }
});

app.get("/balance", requireKey, async (req, res) => {
  try {
    const user = await getUser(req.query.user);
    if (!user) return res.status(400).send("Не указан пользователь.");
    res.send(`💰 @${user.username}: ${user.coins} 🪙 • поймано: ${user.catches}`);
  } catch (error) { console.error(error); res.status(500).send("Не удалось получить баланс."); }
});

app.get("/odds", requireKey, (_req, res) => {
  const text = items.slice().sort((a,b) => b.weight - a.weight).slice(0, 15).map(x => `${x.emoji} ${x.name}: ${x.chance}%`).join(" | ");
  res.send(`🎲 Шансы: ${text}`);
});

app.get("/shop", requireKey, (_req, res) => {
  const text = shopRods.map(x => `${x.number}. ${x.emoji} ${x.name} — ${x.price} 🪙`).join(" | ");
  res.send(`🛒 МАГАЗИН: ${text} • Покупка: !купить <номер>`);
});

app.get("/rod", requireKey, async (req, res) => {
  try {
    const user = await getUser(req.query.user);
    if (!user) return res.status(400).send("Не указан пользователь.");
    const rod = Number(user.rod_level || 1);
    const name = rod === 1 ? "Старая удочка" : shopRods.find(x => x.level === rod)?.name || `Удочка уровня ${rod}`;
    res.send(`🪝 @${user.username}: ${name} • уровень ${rod}`);
  } catch (error) { console.error(error); res.status(500).send("Не удалось проверить удочку."); }
});

app.get("/buy", requireKey, async (req, res) => {
  const username = cleanUsername(req.query.user);
  if (!username) return res.status(400).send("Не указан пользователь.");

  // Поддерживаем !купить 1, 2, 3, 4. Также принимаем level=2..5 для совместимости.
  const requested = String(req.query.number ?? req.query.level ?? "").trim();
  const number = Number(requested);
  const rod = shopRods.find(x => x.number === number || x.level === number);

  if (!rod) {
    return res.send(`🛒 @${username}, такого товара нет. Используй !магазин`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("INSERT INTO users(username) VALUES ($1) ON CONFLICT(username) DO NOTHING", [username]);

    // Блокируем строку пользователя, чтобы две одновременные команды не позволили купить товар дважды.
    const { rows } = await client.query("SELECT * FROM users WHERE username = $1 FOR UPDATE", [username]);
    const user = rows[0];
    const currentLevel = Number(user.rod_level || 1);

    if (currentLevel >= rod.level) {
      await client.query("ROLLBACK");
      return res.send(`🪝 @${username}, у тебя уже есть ${rod.name} или лучше.`);
    }

    if (rod.level !== currentLevel + 1) {
      const nextRod = shopRods.find(x => x.level === currentLevel + 1);
      await client.query("ROLLBACK");
      return res.send(nextRod
        ? `🪝 @${username}, сначала купи №${nextRod.number} — ${nextRod.name} за ${nextRod.price} 🪙.`
        : `🪝 @${username}, у тебя уже максимальная удочка.`
      );
    }

    const coins = Number(user.coins || 0);
    if (coins < rod.price) {
      await client.query("ROLLBACK");
      return res.send(`🪙 @${username}, не хватает монет. Нужно ${rod.price} 🪙, у тебя ${coins} 🪙.`);
    }

    const newBalance = coins - rod.price;
    await client.query(
      "UPDATE users SET coins = $1, rod_level = $2 WHERE username = $3",
      [newBalance, rod.level, username]
    );

    await client.query("COMMIT");
    return res.send(`🎉 @${username} купила №${rod.number} ${rod.emoji} ${rod.name} за ${rod.price} 🪙! Осталось ${newBalance} 🪙.`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).send("Не удалось совершить покупку. Попробуй ещё раз.");
  } finally {
    client.release();
  }
});

initDb().then(() => app.listen(PORT, () => console.log(`Fishing server listening on ${PORT}`))).catch(error => { console.error(error); process.exit(1); });
