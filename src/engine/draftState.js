const DEFAULT_ROSTER_CONFIG = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  K: 1,
  DEF: 1,
  BENCH: 3,
};

let state = {
  config: {
    teamCount: 12,
    yourPick: 1,
    totalRounds: 15,
    scoringFormat: "ppr",
  },
  currentPick: 1,
  totalPicks: 0,
  picks: [],
  yourRoster: [],
  takenPlayers: new Set(),
};

function initDraft(config) {
  const rosterConfig = config.rosterConfig || DEFAULT_ROSTER_CONFIG;
  const bench = rosterConfig.BENCH || 0;

  let remaining = bench;
  const teBonus = remaining > 0 ? 1 : 0;
  remaining -= teBonus;
  const qbBonus = remaining > 0 ? 1 : 0;
  remaining -= qbBonus;
  const benchSwingCapacity = Math.max(0, remaining);

  const positionNeeds = {
    QB: rosterConfig.QB + qbBonus,
    RB: rosterConfig.RB,
    WR: rosterConfig.WR,
    TE: rosterConfig.TE + teBonus,
    K: rosterConfig.K,
    DEF: rosterConfig.DEF,
  };

  state.config = {
    ...config,
    rosterConfig: { ...rosterConfig, positionNeeds, benchSwingCapacity },
  };
  state.currentPick = 1;
  state.totalPicks = config.teamCount * config.totalRounds;
  state.picks = [];
  state.yourRoster = [];
  state.takenPlayers = new Set();
}

function getCurrentRound() {
  return Math.ceil(state.currentPick / state.config.teamCount);
}

function getPickInRound() {
  return ((state.currentPick - 1) % state.config.teamCount) + 1;
}

function getTeamPickingNow() {
  const round = getCurrentRound();
  const pickInRound = getPickInRound();
  const isOddRound = round % 2 === 1;
  return isOddRound ? pickInRound : state.config.teamCount - pickInRound + 1;
}

function isYourTurn() {
  return getTeamPickingNow() === state.config.yourPick;
}

function getYourUpcomingPicks() {
  const { teamCount, yourPick, totalRounds } = state.config;
  const upcoming = [];

  for (let round = 1; round <= totalRounds; round++) {
    const isOddRound = round % 2 === 1;
    const pickNumber = isOddRound
      ? (round - 1) * teamCount + yourPick
      : (round - 1) * teamCount + (teamCount - yourPick + 1);

    if (pickNumber >= state.currentPick) {
      upcoming.push({ round, pickNumber });
    }
  }

  return upcoming;
}

function logPick({
  playerName,
  sleeperId = null,
  position = "UNK",
  byeWeek = null,
  team,
}) {
  if (state.currentPick > state.totalPicks) {
    throw new Error("Draft is already complete.");
  }

  const isYours = team === state.config.yourPick;

  const pick = {
    pickNumber: state.currentPick,
    round: getCurrentRound(),
    team,
    playerName,
    sleeperId,
    position,
    byeWeek,
    isYours,
  };

  state.picks.push(pick);
  state.takenPlayers.add(playerName.toLowerCase());

  if (isYours) {
    state.yourRoster.push({ playerName, position, sleeperId, byeWeek });
  }

  state.currentPick++;

  return pick;
}

function isPlayerTaken(playerName) {
  return state.takenPlayers.has(playerName.toLowerCase());
}

function getAvailablePlayers(allRankedPlayers) {
  return allRankedPlayers.filter((p) => !isPlayerTaken(p.name));
}

function getRosterByPosition() {
  const byPos = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
  state.yourRoster.forEach((p) => {
    if (byPos[p.position]) byPos[p.position].push(p);
  });
  return byPos;
}

function getState() {
  return { ...state };
}
function getCurrentPick() {
  return state.currentPick;
}
function getTotalPicks() {
  return state.totalPicks;
}
function getPicks() {
  return [...state.picks];
}
function getYourRoster() {
  return [...state.yourRoster];
}
function getConfig() {
  return { ...state.config };
}
function isDraftOver() {
  return state.currentPick > state.totalPicks;
}

module.exports = {
  initDraft,
  logPick,
  isYourTurn,
  isPlayerTaken,
  getAvailablePlayers,
  getTeamPickingNow,
  getCurrentRound,
  getYourUpcomingPicks,
  getRosterByPosition,
  getState,
  getCurrentPick,
  getTotalPicks,
  getPicks,
  getYourRoster,
  getConfig,
  isDraftOver,
};
