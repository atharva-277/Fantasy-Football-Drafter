const fs = require("fs");
const path = require("path");

const SLEEPER_URL = "https://api.sleeper.app/v1/players/nfl";
const CACHE_PATH = path.join(__dirname, "../../data/players.json");

// How long before cache refreshes (7 days in milliseconds)
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function isCacheStale() {
  try {
    const stats = fs.statSync(CACHE_PATH);
    const age = Date.now() - stats.mtimeMs;
    return age > CACHE_TTL;
  } catch {
    return true;
  }
}

async function fetchFromSleeper() {
  const res = await fetch(SLEEPER_URL);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return await res.json();
}

function parseSleeperPlayers(raw) {
  const players = [];

  for (const [id, p] of Object.entries(raw)) {
    if (!p.active) continue;
    if (!["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.position)) continue;
    if (!p.full_name) continue;

    players.push({
      sleeperId: id,
      name: p.full_name,
      position: p.position,
      team: p.team || "FA",
      age: p.age || null,
      number: p.number || null,
    });
  }

  return players;
}

async function loadPlayers() {
  if (!isCacheStale()) {
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    return JSON.parse(raw);
  }

  const raw = await fetchFromSleeper();
  const players = parseSleeperPlayers(raw);

  fs.writeFileSync(CACHE_PATH, JSON.stringify(players, null, 2));

  return players;
}

module.exports = { loadPlayers };
