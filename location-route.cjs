const express = require("express");
const pg = require("pg");
const fs = require("node:fs");
const path = require("node:path");

const { Pool } = pg;
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
const locations = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "locations.json"), "utf8")
);

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 25);
}

function findLocation(value) {
  const key = String(value || "").trim().toLowerCase();
  const aliases = {
    "озеро": "lake",
    "море": "sea",
    "глубины": "deep",
    "глубина": "deep",
    "void": "void",
    "войд": "void"
  };
  const id = aliases[key] || key;
  return locations.find(x => x.id === id || String(x.name).toLowerCase() === key);
}

const originalListen = express.application.listen;
express.application.listen = function (...args) {
  const app = this;

  app.get("/set-location", async (req, res) => {
    try {
      if (!API_KEY || req.query.key !== API_KEY) return res.status(401).send("unauthorized");

      const username = cleanUsername(req.query.user);
      const location = findLocation(req.query.location ?? req.query.name ?? req.query.id);

      if (!username) return res.status(400).send("Не удалось определить зрителя.");
      if (!location) return res.send("Неизвестная локация. Используй: озеро, море, глубины или void.");

      await pool.query(
        "INSERT INTO users(username) VALUES($1) ON CONFLICT(username) DO NOTHING",
        [username]
      );
      const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
      const user = rows[0];
      const rodLevel = Number(user.rod_level || 1);

      if (rodLevel < Number(location.min_rod || 1)) {
        return res.send(
          `@${username}, для локации ${location.name} нужна удочка ${location.min_rod}+. У тебя ${rodLevel}.`
        );
      }

      if (user.location === location.id) {
        return res.send(`@${username}, ты уже находишься в ${location.name}.`);
      }

      await pool.query("UPDATE users SET location=$1 WHERE username=$2", [location.id, username]);
      return res.send(`@${username} переместился в ${location.name}.`);
    } catch (error) {
      console.error("set-location error:", error);
      return res.status(500).send("Не удалось сменить локацию.");
    }
  });

  return originalListen.apply(this, args);
};

import("./server.js").catch(error => {
  console.error(error);
  process.exit(1);
});
