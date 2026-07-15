const { loadPlayers } = require("../data/playerLoader");
const { loadRankings } = require("../data/rankingsLoader");
const {
  calculateValues,
  getSurplusPositions,
  DEFAULT_POSITION_NEEDS,
} = require("./valueCalculator");
const draftState = require("./draftState");

const SUGGESTION_COUNT = 8;
const SEARCH_LIMIT = 8;

let playerDB = null;
let rankingDB = null;

async function initEngine(scoringFormat) {
  playerDB = await loadPlayers();
  rankingDB = loadRankings(scoringFormat);
  rankingDB = mergePlayerData(rankingDB, playerDB);
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function mergePlayerData(rankings, players) {
  const playerMap = new Map();
  players.forEach((p) => playerMap.set(normalizeName(p.name), p));

  return rankings.map((ranked) => {
    const match = playerMap.get(normalizeName(ranked.name));
    return {
      ...ranked,
      sleeperId: match?.sleeperId ?? null,
      team: match?.team ?? ranked.team,
      age: match?.age ?? null,
    };
  });
}

function getRosterConfig() {
  const config = draftState.getConfig();
  return config.rosterConfig || {};
}

function getPositionNeeds() {
  return getRosterConfig().positionNeeds ?? DEFAULT_POSITION_NEEDS;
}

function getFlexCapacity() {
  return getRosterConfig().FLEX ?? 0;
}

// Scores every currently-available player. Shared by suggestions + search
// so both surfaces always agree on tier/value/reach-or-steal for a player.
function getScoredAvailable() {
  if (!rankingDB) {
    throw new Error("Engine not initialized — call initEngine() first");
  }

  const available = draftState.getAvailablePlayers(rankingDB);
  const roster = draftState.getRosterByPosition();
  const currentPick = draftState.getCurrentPick();
  const yourRoster = draftState.getYourRoster();
  const positionNeeds = getPositionNeeds();
  const flexCapacity = getFlexCapacity();

  return calculateValues(
    available,
    roster,
    currentPick,
    yourRoster,
    positionNeeds,
    flexCapacity,
  );
}

function getSuggestions() {
  const currentPick = draftState.getCurrentPick();
  const yourTurn = draftState.isYourTurn();
  const upcoming = draftState.getYourUpcomingPicks();
  const roster = draftState.getRosterByPosition();
  const positionNeeds = getPositionNeeds();
  const flexCapacity = getFlexCapacity();

  const scored = getScoredAvailable();

  // Positions that are genuinely full (starter count met, no FLEX capacity
  // left to absorb another) get dropped from suggestions entirely — same
  // logic the scorer uses for the surplus penalty, so this and the score
  // never disagree with each other.
  const fullPositions = getSurplusPositions(
    roster,
    positionNeeds,
    flexCapacity,
  );

  let pool = scored.filter((p) => !fullPositions.has(p.position));

  // Safety net: if every remaining position happens to be full (deep,
  // bench-heavy draft late on), fall back to the unfiltered list rather
  // than showing nothing.
  if (pool.length === 0) pool = scored;

  const suggestions = pool.slice(0, SUGGESTION_COUNT).map((p, i) => ({
    rank: p.rank,
    suggestRank: i + 1,
    name: p.name,
    position: p.position,
    team: p.team,
    tier: p.tier,
    byeWeek: p.byeWeek,
    valueScore: Math.round(p.valueScore),
    reason: p.reason,
    isReach: currentPick < p.rank,
    isSteal: currentPick > p.rank,
    picksLate: Math.max(0, currentPick - p.rank),
  }));

  return {
    suggestions,
    meta: {
      currentPick,
      yourTurn,
      nextPicks: upcoming.slice(0, 3),
      availableCount: scored.length,
      yourRoster: draftState.getYourRoster(),
      rosterByPos: roster,
      isDraftOver: draftState.isDraftOver(),
    },
  };
}

// Search always shows every match regardless of roster fullness — the
// suppression above only applies to the suggestions list, so you can still
// look up and draft a "full" position on purpose.
function searchPlayers(query, limit = SEARCH_LIMIT) {
  if (!rankingDB) {
    throw new Error("Engine not initialized — call initEngine() first");
  }

  const q = query.toLowerCase().trim();
  if (!q) return [];

  const currentPick = draftState.getCurrentPick();
  const takenNames = new Set(
    draftState.getPicks().map((p) => p.playerName.toLowerCase()),
  );

  const scoredMap = new Map();
  getScoredAvailable().forEach((p) => scoredMap.set(normalizeName(p.name), p));

  return rankingDB
    .filter((p) => p.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map((p) => {
      const taken = takenNames.has(p.name.toLowerCase());
      const scored = scoredMap.get(normalizeName(p.name));

      return {
        rank: p.rank,
        name: p.name,
        position: p.position,
        team: p.team,
        tier: p.tier,
        byeWeek: p.byeWeek,
        taken,
        valueScore: scored ? Math.round(scored.valueScore) : null,
        reason: scored ? scored.reason : null,
        isReach: scored ? currentPick < p.rank : false,
        isSteal: scored ? currentPick > p.rank : false,
      };
    });
}

module.exports = { initEngine, getSuggestions, searchPlayers };
