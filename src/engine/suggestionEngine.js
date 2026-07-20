const { loadPlayers } = require("../data/playerLoader");
const { loadRankings } = require("../data/rankingsLoader");
const {
  calculateValues,
  getSurplusPositions,
  getNeededPositions,
  DEFAULT_POSITION_NEEDS,
  NO_BOARD_VALUE_POSITIONS,
  isTierGatedOut,
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

function getStarterNeeds() {
  return getRosterConfig().starterNeeds ?? DEFAULT_POSITION_NEEDS;
}

function getFlexCapacity() {
  return getRosterConfig().FLEX ?? 0;
}

function getBenchSwingCapacity() {
  return getRosterConfig().benchSwingCapacity ?? 0;
}

function getEnabledPositions() {
  const enabled = getRosterConfig().enabledPositions;
  return new Set(
    enabled && enabled.length ? enabled : Object.keys(DEFAULT_POSITION_NEEDS),
  );
}

function filterEnabled(players) {
  const enabled = getEnabledPositions();
  return players.filter((p) => enabled.has(p.position));
}

function getScoredAvailable() {
  if (!rankingDB) {
    throw new Error("Engine not initialized — call initEngine() first");
  }

  const available = filterEnabled(draftState.getAvailablePlayers(rankingDB));
  const roster = draftState.getRosterByPosition();
  const currentPick = draftState.getCurrentPick();
  const totalPicks = draftState.getTotalPicks();
  const yourRoster = draftState.getYourRoster();
  const positionNeeds = getPositionNeeds();
  const starterNeeds = getStarterNeeds();
  const flexCapacity = getFlexCapacity();
  const benchSwingCapacity = getBenchSwingCapacity();

  return calculateValues(
    available,
    roster,
    currentPick,
    yourRoster,
    positionNeeds,
    flexCapacity,
    benchSwingCapacity,
    totalPicks,
    starterNeeds,
  );
}

function getSuggestions() {
  const currentPick = draftState.getCurrentPick();
  const totalPicks = draftState.getTotalPicks();
  const yourTurn = draftState.isYourTurn();
  const upcoming = draftState.getYourUpcomingPicks();
  const roster = draftState.getRosterByPosition();
  const positionNeeds = getPositionNeeds();
  const starterNeeds = getStarterNeeds();
  const flexCapacity = getFlexCapacity();
  const benchSwingCapacity = getBenchSwingCapacity();

  const scored = getScoredAvailable();
  const fullPositions = getSurplusPositions(
    roster,
    positionNeeds,
    flexCapacity,
    benchSwingCapacity,
  );
  const strictNeeded = getNeededPositions(roster, starterNeeds);

  let pool = scored.filter(
    (p) =>
      !fullPositions.has(p.position) &&
      !isTierGatedOut(p.position, strictNeeded, currentPick, totalPicks),
  );
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
    reasonType: p.reasonType,
    isReach:
      !NO_BOARD_VALUE_POSITIONS.includes(p.position) && currentPick < p.rank,
    isSteal:
      !NO_BOARD_VALUE_POSITIONS.includes(p.position) && currentPick > p.rank,
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

  const matches = filterEnabled(
    rankingDB.filter((p) => p.name.toLowerCase().includes(q)),
  );

  return matches.slice(0, limit).map((p) => {
    const taken = takenNames.has(p.name.toLowerCase());
    const scored = scoredMap.get(normalizeName(p.name));
    const noBoardValue = NO_BOARD_VALUE_POSITIONS.includes(p.position);

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
      reasonType: scored ? scored.reasonType : null,
      isReach: scored && !noBoardValue ? currentPick < p.rank : false,
      isSteal: scored && !noBoardValue ? currentPick > p.rank : false,
    };
  });
}

function getTopAvailable(limit = SUGGESTION_COUNT) {
  if (!rankingDB) {
    throw new Error("Engine not initialized — call initEngine() first");
  }

  const available = filterEnabled(draftState.getAvailablePlayers(rankingDB));
  const sorted = [...available].sort((a, b) => a.rank - b.rank);

  return sorted.slice(0, limit).map((p) => ({
    rank: p.rank,
    name: p.name,
    position: p.position,
    team: p.team,
    tier: p.tier,
    byeWeek: p.byeWeek,
  }));
}

module.exports = { initEngine, getSuggestions, searchPlayers, getTopAvailable };
