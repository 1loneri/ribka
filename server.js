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
  ? { host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), database: process.env.PGDATABASE || "postgres", user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: { rejectUnauthorized: false }, max: 3 }
  : { connectionString: DATABASE_URL, ssl: DATABASE_URL?.includes("supabase") ? { rejectUnauthorized: false } : undefined, max: 3 };
const pool = new Pool(dbConfig);

const items = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "items.json"), "utf8"));
const locations = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "locations.json"), "utf8"));
const quests = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "quests.json"), "utf8"));

const shopRods = [
  { id: "rod2", number: 1, level: 2, name: "Улучшенная удочка", price: 100 },
  { id: "rod3", number: 2, level: 3, name: "Серебряная удочка", price: 500 },
  { id: "rod4", number: 3, level: 4, name: "Золотая удочка", price: 2000 },
  { id: "rod5", number: 4, level: 5, name: "VOID-удочка", price: 10000 }
];

const RARITY_ORDER = ["мусор", "обычная", "необычная", "редкая", "эпическая", "легендарная", "мифическая"];
const EVENT_DEFINITIONS = [
  { id: "storm", name: "Шторм", text: "Редкая рыба встречается чаще", rarity: "редкая", multiplier: 1.8 },
  { id: "moon", name: "Лунная ночь", text: "Эпическая рыба встречается чаще", rarity: "эпическая", multiplier: 1.8 },
  { id: "void", name: "VOID-разлом", text: "Мифическая рыба встречается чаще", rarity: "мифическая", multiplier: 3 }
];
const EVENT_DURATION_MS = 10 * 60 * 1000;
const EVENT_INTERVALS_MS = [15, 30, 40, 60].map(x => x * 60 * 1000);

function today() { return new Date().toISOString().slice(0, 10); }
function cleanUsername(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 25); }
function getLocation(id) { return locations.find(x => x.id === id) || locations[0]; }
function findLocation(value) {
  const key = String(value || "").trim().toLowerCase();
  const aliases = { "озеро": "lake", "море": "sea", "глубины": "deep", "глубина": "deep", "руины": "ruins", "затонувшие руины": "ruins", "void": "void", "войд": "void" };
  const id = aliases[key] || key;
  return locations.find(x => x.id === id || String(x.name || "").toLowerCase() === key);
}
function randomInterval() { return EVENT_INTERVALS_MS[Math.floor(Math.random() * EVENT_INTERVALS_MS.length)]; }
function randomEvent() { return EVENT_DEFINITIONS[Math.floor(Math.random() * EVENT_DEFINITIONS.length)]; }

async function ensureEventState() {
  const now = Date.now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM event_state WHERE id = 1 FOR UPDATE");
    if (!rows.length) {
      await client.query("INSERT INTO event_state(id,event_id,started_at,active_until,next_start) VALUES(1,NULL,0,0,$1)", [now + randomInterval()]);
      await client.query("COMMIT");
      return null;
    }
    const state = rows[0];
    if (Number(state.active_until || 0) > now) {
      await client.query("COMMIT");
      return EVENT_DEFINITIONS.find(x => x.id === state.event_id) || null;
    }
    if (Number(state.next_start || 0) > now) {
      await client.query("COMMIT");
      return null;
    }
    const event = randomEvent();
    const activeUntil = now + EVENT_DURATION_MS;
    const nextStart = activeUntil + randomInterval();
    await client.query("UPDATE event_state SET event_id=$1,started_at=$2,active_until=$3,next_start=$4 WHERE id=1", [event.id, now, activeUntil, nextStart]);
    await client.query("COMMIT");
    return event;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally { client.release(); }
}

async function getEventState() {
  const event = await ensureEventState();
  const { rows } = await pool.query("SELECT * FROM event_state WHERE id=1");
  return { event, state: rows[0] };
}

function pickByWeight(list) {
  const total = list.reduce((s, x) => s + Number(x.weight || 0), 0);
  if (!total) return list[0];
  let roll = Math.random() * total;
  for (const x of list) {
    roll -= Number(x.weight || 0);
    if (roll <= 0) return x;
  }
  return list[list.length - 1];
}
function weightedPickWeight(item, user, location, event = null) {
  let weight = Number(item.weight || 0);
  const i = Math.max(0, RARITY_ORDER.indexOf(item.rarity));
  const lm = Number(location.multiplier || 1);
  if (i >= 3) weight *= 1 + (lm - 1) * (i - 2) * 0.55;
  else weight *= 1 / lm;
  if (i >= 3) {\n    const rodBonuses = { 1: 0, 2: 0.15, 3: 0.35, 4: 0.60, 5: 1.00 };\n    weight *= 1 + (rodBonuses[Number(user.rod_level || 1)] ?? 0);\n  }
  if (event && item.rarity === event.rarity) weight *= event.multiplier;
  return weight;
}
function weightedPick(list, user, location, event) { return pickByWeight(list.map(item => ({ ...item, weight: weightedPickWeight(item, user, location, event) }))); }
function locationItems(locationId) { return items.filter(x => x.id.startsWith(`${locationId}_`)); }

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,coins INTEGER NOT NULL DEFAULT 0,catches INTEGER NOT NULL DEFAULT 0,streak INTEGER NOT NULL DEFAULT 0,last_catch BIGINT NOT NULL DEFAULT 0,rod_level INTEGER NOT NULL DEFAULT 1,location TEXT NOT NULL DEFAULT 'lake',daily_claim BIGINT NOT NULL DEFAULT 0,daily_streak INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS inventory(username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,item_id TEXT NOT NULL,amount INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(username,item_id)); ALTER TABLE users ADD COLUMN IF NOT EXISTS rod_level INTEGER NOT NULL DEFAULT 1; ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'lake'; ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_claim BIGINT NOT NULL DEFAULT 0; ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_streak INTEGER NOT NULL DEFAULT 0; CREATE TABLE IF NOT EXISTS daily_quests(username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,quest_id TEXT NOT NULL,progress INTEGER NOT NULL DEFAULT 0,completed BOOLEAN NOT NULL DEFAULT false,claimed BOOLEAN NOT NULL DEFAULT false,date TEXT NOT NULL,PRIMARY KEY(username,quest_id,date)); CREATE TABLE IF NOT EXISTS event_state(id INTEGER PRIMARY KEY,event_id TEXT,started_at BIGINT NOT NULL DEFAULT 0,active_until BIGINT NOT NULL DEFAULT 0,next_start BIGINT NOT NULL DEFAULT 0);`);
}

async function getUser(username) {
  const name = cleanUsername(username);
  if (!name) return null;
  await pool.query("INSERT INTO users(username) VALUES($1) ON CONFLICT(username) DO NOTHING", [name]);
  const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [name]);
  return rows[0];
}

async function updateQuestProgress(username, item) {
  const date = today();
  for (const quest of quests) {
    let matches = quest.type === "catches";
    if (quest.type === "rarity") matches = item.rarity === quest.rarity;
    if (!matches) continue;
    await pool.query(`INSERT INTO daily_quests(username,quest_id,progress,completed,date) VALUES($1,$2,1,($3 <= 1),$4) ON CONFLICT(username,quest_id,date) DO UPDATE SET progress=LEAST(daily_quests.progress+1,$3),completed=(LEAST(daily_quests.progress+1,$3)>=$3)`, [username, quest.id, quest.target, date]);
  }
}

async function addCatch(username, item) {
  const user = await getUser(username);
  if (!user) return { error: "bad_username" };
  const now = Date.now();
  const last = Number(user.last_catch || 0);
  const cooldown = 20000;
  if (now - last < cooldown) return { cooldown: true, seconds: Math.ceil((cooldown - (now - last)) / 1000), username: user.username };
  const newStreak = last > 0 && now - last <= 120000 ? Number(user.streak) + 1 : 1;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE users SET coins=coins+$1,catches=catches+1,streak=$2,last_catch=$3 WHERE username=$4", [item.value, newStreak, now, user.username]);
    await client.query("INSERT INTO inventory(username,item_id,amount) VALUES($1,$2,1) ON CONFLICT(username,item_id) DO UPDATE SET amount=inventory.amount+1", [user.username, item.id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally { client.release(); }
  await updateQuestProgress(user.username, item);
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
    const username = cleanUsername(req.query.user);
    if (!username) return res.status(400).send("Не удалось определить зрителя.");
    const user = await getUser(username);
    const location = getLocation(user.location);
    const event = await ensureEventState();
    const poolForLocation = locationItems(location.id);
    if (!poolForLocation.length) return res.status(500).send("Для этой локации пока нет рыбы.");
    const result = await addCatch(username, weightedPick(poolForLocation, user, location, event));
    if (result.cooldown) return res.send(`@${username}, подожди ещё ${result.seconds} сек.`);
    const { item, streak, balance } = result;
    const totalWeight = poolForLocation.reduce((s, x) => s + weightedPickWeight(x, user, location, event), 0);
    const actualChance = totalWeight ? weightedPickWeight(item, user, location, event) / totalWeight * 100 : 0;
    let message = `@${username} поймал ${item.name} [${item.rarity.toUpperCase()}] • шанс ${actualChance.toFixed(2)}% • +${item.value} монет`;
    if (event && event.rarity === item.rarity) message += ` • СОБЫТИЕ: ${event.name}`;
    if (streak >= 3) message += ` • серия ${streak}`;
    message += ` • баланс ${balance} монет`;
    res.send(message);
  } catch (e) {
    console.error(e);
    res.status(500).send("Рыбалка временно сломалась. Попробуй ещё раз.");
  }
});

app.get("/inventory", requireKey, async (req, res) => {
  try {
    const username = cleanUsername(req.query.user);
    if (!username) return res.status(400).send("Не указан пользователь.");
    const { rows } = await pool.query("SELECT item_id,amount FROM inventory WHERE username=$1 ORDER BY amount DESC", [username]);
    if (!rows.length) return res.send(`@${username}, твой садок пока пуст.`);
    const map = new Map(items.map(x => [x.id, x]));
    const text = rows.slice(0, 8).map(x => `${map.get(x.item_id)?.name || x.item_id} ×${x.amount}`).join(" | ");
    res.send(`@${username}: ${text}`);
  } catch (e) { console.error(e); res.status(500).send("Не удалось открыть инвентарь."); }
});

app.get("/balance", requireKey, async (req, res) => {
  try {
    const user = await getUser(req.query.user);
    if (!user) return res.status(400).send("Не указан пользователь.");
    res.send(`@${user.username}: ${user.coins} монет • поймано: ${user.catches}`);
  } catch (e) { console.error(e); res.status(500).send("Не удалось получить баланс."); }
});

app.get("/odds", requireKey, async (req, res) => {
  const user = await getUser(req.query.user || "anonymous");
  const location = getLocation(user.location);
  const event = await ensureEventState();
  const poolForLocation = locationItems(location.id);
  const weighted = poolForLocation.map(x => ({ ...x, weight: weightedPickWeight(x, user, location, event) }));
  const total = weighted.reduce((s, x) => s + x.weight, 0);
  const text = weighted.sort((a, b) => b.weight - a.weight).map(x => `${x.name}: ${(x.weight / total * 100).toFixed(2)}%`).join(" | ");
  res.send(`${location.name}: ${text}`);
});

app.get("/shop", requireKey, (_req, res) => {
  const text = shopRods.map(x => `${x.number}. ${x.name} — ${x.price} монет`).join(" | ");
  res.send(`МАГАЗИН: ${text} • Покупка: !купить <номер>`);
});

app.get("/rod", requireKey, async (req, res) => {
  try {
    const user = await getUser(req.query.user);
    if (!user) return res.status(400).send("Не указан пользователь.");
    const rod = Number(user.rod_level || 1);
    const name = rod === 1 ? "Старая удочка" : shopRods.find(x => x.level === rod)?.name || `Удочка уровня ${rod}`;
    res.send(`@${user.username}: ${name} • уровень ${rod}`);
  } catch (e) { console.error(e); res.status(500).send("Не удалось проверить удочку."); }
});

app.get("/buy", requireKey, async (req, res) => {
  const username = cleanUsername(req.query.user);
  if (!username) return res.status(400).send("Не указан пользователь.");
  const number = Number(String(req.query.number ?? req.query.level ?? "").trim());
  const rod = shopRods.find(x => x.number === number || x.level === number);
  if (!rod) return res.send(`@${username}, такого товара нет. Используй !магазин`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO users(username) VALUES($1) ON CONFLICT(username) DO NOTHING", [username]);
    const { rows } = await client.query("SELECT * FROM users WHERE username=$1 FOR UPDATE", [username]);
    const user = rows[0];
    const currentLevel = Number(user.rod_level || 1);
    if (currentLevel >= rod.level) { await client.query("ROLLBACK"); return res.send(`@${username}, у тебя уже есть ${rod.name} или лучше.`); }
    if (rod.level !== currentLevel + 1) {
      const nextRod = shopRods.find(x => x.level === currentLevel + 1);
      await client.query("ROLLBACK");
      return res.send(nextRod ? `@${username}, сначала купи №${nextRod.number} — ${nextRod.name} за ${nextRod.price} монет.` : `@${username}, у тебя уже максимальная удочка.`);
    }
    const coins = Number(user.coins || 0);
    if (coins < rod.price) { await client.query("ROLLBACK"); return res.send(`@${username}, не хватает монет. Нужно ${rod.price}, у тебя ${coins}.`); }
    const newBalance = coins - rod.price;
    await client.query("UPDATE users SET coins=$1,rod_level=$2 WHERE username=$3", [newBalance, rod.level, username]);
    await client.query("COMMIT");
    return res.send(`@${username} купила №${rod.number} ${rod.name} за ${rod.price} монет. Осталось ${newBalance}.`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).send("Не удалось совершить покупку. Попробуй ещё раз.");
  } finally { client.release(); }
});

app.get("/locations", requireKey, async (req, res) => {
  const user = await getUser(req.query.user);
  if (!user) return res.status(400).send("Не указан пользователь.");
  const text = locations.map(l => `${l.name} — ${Number(user.rod_level) >= Number(l.min_rod) ? "доступно" : `удочка ${l.min_rod}+`}`).join(" | ");
  res.send(`ЛОКАЦИИ: ${text}`);
});

async function setUserLocation(req, res) {
  const username = cleanUsername(req.query.user);
  const user = await getUser(username);
  if (!user) return res.status(400).send("Не указан пользователь.");
  const requested = String(req.query.location || "").trim();
  const current = getLocation(user.location);
  if (!requested) return res.send(`@${username}: ${current.name}`);
  const location = findLocation(requested);
  if (!location) return res.send("Такой локации нет. Используй !локации");
  if (Number(user.rod_level) < Number(location.min_rod)) return res.send(`@${username}, ${location.name} требует удочку ${location.min_rod} уровня.`);
  await pool.query("UPDATE users SET location=$2 WHERE username=$1", [username, location.id]);
  res.send(`@${username} отправился в ${location.name}!`);
}
app.get("/location", requireKey, setUserLocation);
app.get("/set-location", requireKey, setUserLocation);

app.get("/top", requireKey, async (req, res) => {
  const type = String(req.query.type || "coins");
  const columns = { coins: "coins", catches: "catches", streak: "streak" };
  const column = columns[type] || "coins";
  const { rows } = await pool.query(`SELECT username,coins,catches,streak FROM users ORDER BY ${column} DESC,username ASC LIMIT 10`);
  const labels = { coins: "монетам", catches: "уловам", streak: "серии" };
  const text = rows.map((x, i) => `${i + 1}. @${x.username} — ${x[column]}`).join(" | ");
  const user = cleanUsername(req.query.user);
  let place = "—";
  if (user) {
    const rank = await pool.query(`SELECT COUNT(*)+1 AS place FROM users WHERE ${column}>COALESCE((SELECT ${column} FROM users WHERE username=$1),-1)`, [user]);
    place = rank.rows[0]?.place || "—";
  }
  res.send(`ТОП по ${labels[type] || labels.coins}: ${text || "пока пусто"} • @${user || "тебе"}: место ${place}`);
});

app.get("/bonus", requireKey, async (req, res) => {
  const username = cleanUsername(req.query.user);
  const user = await getUser(username);
  if (!user) return res.status(400).send("Не указан пользователь.");
  const now = Date.now();
  const day = 86400000;
  const last = Number(user.daily_claim || 0);
  if (last && now - last < day) return res.send(`@${username}, бонус уже получен. Следующий через ~${Math.ceil((day - (now - last)) / 3600000)} ч. Серия: ${user.daily_streak}`);
  const streak = last && now - last <= day * 2 ? Number(user.daily_streak || 0) + 1 : 1;
  const reward = Math.min(250 + (streak - 1) * 50, 1000);
  const updated = await pool.query("UPDATE users SET coins=coins+$2,daily_claim=$3,daily_streak=$4 WHERE username=$1 RETURNING coins", [username, reward, now, streak]);
  res.send(`@${username} получил ежедневный бонус +${reward} монет • день ${streak} • баланс ${updated.rows[0].coins} монет`);
});

app.get("/quests", requireKey, async (req, res) => {
  const username = cleanUsername(req.query.user);
  const user = await getUser(username);
  if (!user) return res.status(400).send("Не указан пользователь.");
  const date = today();
  const { rows } = await pool.query("SELECT * FROM daily_quests WHERE username=$1 AND date=$2", [username, date]);
  const progress = new Map(rows.map(r => [r.quest_id, r]));
  const text = quests.map(q => {
    const r = progress.get(q.id);
    const v = Math.min(Number(r?.progress || 0), q.target);
    return `${r?.completed ? "Выполнено" : "Не выполнено"}: ${q.text} ${v}/${q.target} (+${q.reward} монет)`;
  }).join(" | ");
  res.send(`КВЕСТЫ @${username}: ${text}`);
});

app.get("/quest/claim", requireKey, async (req, res) => {
  const username = cleanUsername(req.query.user);
  const quest = quests.find(x => x.id === String(req.query.quest));
  if (!username || !quest) return res.status(400).send("Неверный квест.");
  const date = today();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM daily_quests WHERE username=$1 AND quest_id=$2 AND date=$3 FOR UPDATE", [username, quest.id, date]);
    const row = rows[0];
    if (!row?.completed) { await client.query("ROLLBACK"); return res.send(`@${username}, квест ещё не выполнен.`); }
    if (row.claimed) { await client.query("ROLLBACK"); return res.send(`@${username}, награда за этот квест уже получена.`); }
    await client.query("UPDATE daily_quests SET claimed=true WHERE username=$1 AND quest_id=$2 AND date=$3", [username, quest.id, date]);
    const updated = await client.query("UPDATE users SET coins=coins+$2 WHERE username=$1 RETURNING coins", [username, quest.reward]);
    await client.query("COMMIT");
    res.send(`@${username} получил за квест +${quest.reward} монет • баланс ${updated.rows[0].coins} монет`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).send("Не удалось получить награду.");
  } finally { client.release(); }
});

app.get("/event", requireKey, async (_req, res) => {
  try {
    const { event, state } = await getEventState();
    if (!event) {
      const minutes = Math.ceil(Math.max(0, Number(state?.next_start || 0) - Date.now()) / 60000);
      return res.send(`Сейчас событий нет. Следующее событие примерно через ${minutes} мин.`);
    }
    const minutes = Math.max(1, Math.ceil(Math.max(0, Number(state.active_until) - Date.now()) / 60000));
    res.send(`СОБЫТИЕ: ${event.name} — ${event.text}! Осталось ~${minutes} мин.`);
  } catch (e) { console.error(e); res.status(500).send("Не удалось проверить событие."); }
});

app.get("/events", requireKey, async (_req, res) => {
  try {
    const { event, state } = await getEventState();
    res.json({ active: event, duration_minutes: 10, random_interval_minutes: [15, 30, 40, 60], next_start: state?.next_start || null, events: EVENT_DEFINITIONS });
  } catch (e) { console.error(e); res.status(500).json({ error: "event_state_error" }); }
});

initDb().then(async () => {
  await ensureEventState();
  app.listen(PORT, () => console.log(`Fishing server listening on ${PORT}`));
}).catch(e => { console.error(e); process.exit(1); });
