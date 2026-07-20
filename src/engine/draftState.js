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
  const draftType = config.draftType === "linear" ? "linear" : "snake";
  const bench = rosterConfig.BENCH || 0;

  const teEnabled = (rosterConfig.TE || 0) > 0;
  const qbEnabled = (rosterConfig.QB || 0) > 0;
  const rbEnabled = (rosterConfig.RB || 0) > 0;
  const wrEnabled = (rosterConfig.WR || 0) > 0;

  let remaining = bench;

  const teBonus = teEnabled && remaining > 0 ? 1 : 0;
  remaining -= teBonus;

  const qbBonus = qbEnabled && remaining > 0 ? 1 : 0;
  remaining -= qbBonus;

  let rbGuaranteed = 0;
  let wrGuaranteed = 0;
  let benchSwingCapacity = 0;

  if (rbEnabled && wrEnabled) {
    rbGuaranteed = Math.floor(remaining / 2);
    wrGuaranteed = Math.floor(remaining / 2);
    benchSwingCapacity = remaining - rbGuaranteed - wrGuaranteed; // 0 or 1
  } else if (rbEnabled) {
    rbGuaranteed = remaining;
  } else if (wrEnabled) {
    wrGuaranteed = remaining;
  }

  const positionNeeds = {};
  if (qbEnabled) positionNeeds.QB = rosterConfig.QB + qbBonus;
  if (rbEnabled) positionNeeds.RB = rosterConfig.RB + rbGuaranteed;
  if (wrEnabled) positionNeeds.WR = rosterConfig.WR + wrGuaranteed;
  if (teEnabled) positionNeeds.TE = rosterConfig.TE + teBonus;
  if ((rosterConfig.K || 0) > 0) positionNeeds.K = rosterConfig.K;
  if ((rosterConfig.DEF || 0) > 0) positionNeeds.DEF = rosterConfig.DEF;

  const starterNeeds = {};
  if (qbEnabled) starterNeeds.QB = rosterConfig.QB;
  if (rbEnabled) starterNeeds.RB = rosterConfig.RB;
  if (wrEnabled) starterNeeds.WR = rosterConfig.WR;
  if (teEnabled) starterNeeds.TE = rosterConfig.TE;
  if ((rosterConfig.K || 0) > 0) starterNeeds.K = rosterConfig.K;
  if ((rosterConfig.DEF || 0) > 0) starterNeeds.DEF = rosterConfig.DEF;

  state.config = {
    ...config,
    draftType,
    rosterConfig: {
      ...rosterConfig,
      positionNeeds,
      starterNeeds,
      benchSwingCapacity,
      enabledPositions: Object.keys(positionNeeds),
    },
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
  const pickInRound = getPickInRound();
  if (state.config.draftType === "linear") {
    return pickInRound;
  }
  const round = getCurrentRound();
  const isOddRound = round % 2 === 1;
  return isOddRound ? pickInRound : state.config.teamCount - pickInRound + 1;
}

function isYourTurn() {
  return getTeamPickingNow() === state.config.yourPick;
}

function getYourUpcomingPicks() {
  const { teamCount, yourPick, totalRounds, draftType } = state.config;
  const upcoming = [];

  for (let round = 1; round <= totalRounds; round++) {
    let pickNumber;
    if (draftType === "linear") {
      pickNumber = (round - 1) * teamCount + yourPick;
    } else {
      const isOddRound = round % 2 === 1;
      pickNumber = isOddRound
        ? (round - 1) * teamCount + yourPick
        : (round - 1) * teamCount + (teamCount - yourPick + 1);
    }

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
