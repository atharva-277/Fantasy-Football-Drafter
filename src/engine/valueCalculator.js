const WEIGHTS = {
  rankBase: 500,
  tierDrop: 25,
  starterNeed: 14,
  benchDepth: 2,
  positionSaturationPenalty: -18,
  rosterNeed: 5,
  rosterSurplus: -20,
  boardValue: 2,
  byeWeekBase: 6,
  byeWeekStack: 10,
  byeWeekSamePosition: 12,
  sosBonuses: {
    5: 4,
    4: 2,
    3: 0,
    2: -2,
    1: -4,
  },
};

const EARLY_POSITION_BONUS = {
  RB: 15,
  WR: 9,
  TE: 5,
  QB: 0,
  DEF: -35,
  K: -35,
};
const POSITION_PRIORITY_ORDER = ["RB", "WR", "TE", "QB", "DEF", "K"];

const BACKUP_TIER_SUPPRESSION = -30;

const BACKUP_UNLOCK_PROGRESS = 0.8;

function hasUnfilledHigherPriorityPosition(position, neededPositions) {
  const idx = POSITION_PRIORITY_ORDER.indexOf(position);
  if (idx <= 0) return false;
  for (let i = 0; i < idx; i++) {
    if (neededPositions.has(POSITION_PRIORITY_ORDER[i])) return true;
  }
  return false;
}

function getDraftProgress(currentPick, totalPicks) {
  if (!totalPicks) return 0;
  return Math.min(1, Math.max(0, (currentPick - 1) / totalPicks));
}

function isTierGatedOut(position, neededPositions, currentPick, totalPicks) {
  if (neededPositions.has(position)) return false;

  const draftProgress = getDraftProgress(currentPick, totalPicks);
  if (draftProgress >= BACKUP_UNLOCK_PROGRESS) return false;

  return hasUnfilledHigherPriorityPosition(position, neededPositions);
}

function getPositionalPriorityBonus(position, currentPick, totalPicks) {
  const base = EARLY_POSITION_BONUS[position];
  if (base === undefined || !totalPicks) return 0;
  const fadeFactor = 1 - getDraftProgress(currentPick, totalPicks);
  return base * fadeFactor;
}

const DEFAULT_POSITION_NEEDS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
const BENCH_SWING_ELIGIBLE = ["RB", "WR"];
const NO_BOARD_VALUE_POSITIONS = ["K", "DEF"];

function parseSosRating(sosString) {
  if (!sosString) return 3;
  const match = sosString.match(/^(\d)/);
  return match ? parseInt(match[1]) : 3;
}

function getLastInTier(availablePlayers) {
  const tiers = {};
  availablePlayers.forEach((p) => {
    if (!tiers[p.tier]) tiers[p.tier] = [];
    tiers[p.tier].push(p);
  });

  const lastInTier = new Set();
  Object.values(tiers).forEach((tierPlayers) => {
    const last = tierPlayers.reduce((a, b) => (a.rank > b.rank ? a : b));
    lastInTier.add(last.name);
  });

  return lastInTier;
}

function getStarterCounts(rosterByPosition, positionNeeds) {
  const starterCounts = {};
  Object.entries(positionNeeds).forEach(([pos, min]) => {
    const current = rosterByPosition[pos]?.length ?? 0;
    starterCounts[pos] = Math.min(current, min);
  });
  return starterCounts;
}

function getNeededPositions(
  rosterByPosition,
  positionNeeds = DEFAULT_POSITION_NEEDS,
) {
  const needs = new Set();
  Object.entries(positionNeeds).forEach(([pos, min]) => {
    const current = rosterByPosition[pos]?.length ?? 0;
    if (current < min) needs.add(pos);
  });
  return needs;
}

function getSurplusPositions(
  rosterByPosition,
  positionNeeds = DEFAULT_POSITION_NEEDS,
  flexCapacity = 0,
  benchSwingCapacity = 0,
) {
  const surplus = new Set();

  const rbOverflow = Math.max(
    0,
    (rosterByPosition.RB?.length ?? 0) - (positionNeeds.RB ?? 0),
  );
  const wrOverflow = Math.max(
    0,
    (rosterByPosition.WR?.length ?? 0) - (positionNeeds.WR ?? 0),
  );
  const combinedPool = flexCapacity + benchSwingCapacity;
  const rbWrRemaining = combinedPool - (rbOverflow + wrOverflow);

  Object.entries(positionNeeds).forEach(([pos, min]) => {
    const current = rosterByPosition[pos]?.length ?? 0;
    if (current < min) return;

    if (BENCH_SWING_ELIGIBLE.includes(pos)) {
      if (rbWrRemaining <= 0) surplus.add(pos);
    } else {
      surplus.add(pos);
    }
  });

  return surplus;
}

function getByeWeekCounts(yourRoster) {
  const counts = {};
  const posCounts = {};
  yourRoster.forEach((p) => {
    if (!p.byeWeek) return;
    counts[p.byeWeek] = (counts[p.byeWeek] || 0) + 1;
    const key = `${p.byeWeek}_${p.position}`;
    posCounts[key] = (posCounts[key] || 0) + 1;
  });
  return { counts, posCounts };
}

function scorePlayer(
  player,
  {
    lastInTier,
    neededPositions,
    surplusPositions,
    byeWeekCounts,
    currentPick,
    totalPicks,
    positionNeeds,
    byPositionRoster,
  },
) {
  let score = 0;
  const reasons = [];

  score += WEIGHTS.rankBase - player.rank;

  const positionalBonus = getPositionalPriorityBonus(
    player.position,
    currentPick,
    totalPicks,
  );
  if (positionalBonus !== 0) {
    score += positionalBonus;
    if (positionalBonus <= -15) {
      reasons.push({
        text: `${player.position} value is low this early — wait on this position`,
        type: "warning",
      });
    } else if (positionalBonus >= 8) {
      reasons.push({
        text: `${player.position} scarcity favors taking this now`,
        type: "positive",
      });
    }
  }

  if (!NO_BOARD_VALUE_POSITIONS.includes(player.position)) {
    const pickDelta = currentPick - player.rank;
    if (pickDelta > 0) {
      score += pickDelta * WEIGHTS.boardValue;
      reasons.push({
        text: `Still available ${pickDelta} picks past their expected spot`,
        type: "steal",
      });
    } else if (pickDelta < 0) {
      score += pickDelta * WEIGHTS.boardValue;
      reasons.push({
        text: `Reaching ${Math.abs(pickDelta)} picks early`,
        type: "reach",
      });
    }
  }

  if (lastInTier.has(player.name)) {
    score += WEIGHTS.tierDrop;
    reasons.push({
      text: "Last in tier — quality drops after this pick",
      type: "positive",
    });
  }

  const currentAtPos = byPositionRoster[player.position]?.length ?? 0;
  const neededAtPos = positionNeeds[player.position] ?? 0;

  if (neededPositions.has(player.position)) {
    score += WEIGHTS.starterNeed;
    reasons.push({
      text: `Fills a starting ${player.position} slot`,
      type: "positive",
    });
  } else if (surplusPositions.has(player.position)) {
    const extrasBeyondCapacity = Math.max(0, currentAtPos - neededAtPos - 1);
    score +=
      WEIGHTS.rosterSurplus +
      extrasBeyondCapacity * WEIGHTS.positionSaturationPenalty;
    reasons.push({
      text: `You already have enough ${player.position}s (including FLEX capacity)`,
      type: "warning",
    });
  } else {
    const draftProgress = getDraftProgress(currentPick, totalPicks);
    const gatedByHigherPriority =
      draftProgress < BACKUP_UNLOCK_PROGRESS &&
      hasUnfilledHigherPriorityPosition(player.position, neededPositions);

    if (gatedByHigherPriority) {
      score += BACKUP_TIER_SUPPRESSION;
      reasons.push({
        text: `Fill your RB/WR/TE/QB starters before adding another ${player.position}`,
        type: "warning",
      });
    } else {
      const extrasAlready = Math.max(0, currentAtPos - neededAtPos);
      score +=
        WEIGHTS.benchDepth + extrasAlready * WEIGHTS.positionSaturationPenalty;
      reasons.push({
        text: `Starters filled at ${player.position} — additional depth`,
        type: "neutral",
      });
    }
  }

  const sosStars = parseSosRating(player.sosRating);
  const sosBonus = WEIGHTS.sosBonuses[sosStars] ?? 0;
  score += sosBonus;
  if (sosStars >= 4)
    reasons.push({
      text: `Favorable schedule (${sosStars}/5 stars)`,
      type: "positive",
    });
  if (sosStars <= 2)
    reasons.push({
      text: `Tough schedule (${sosStars}/5 stars)`,
      type: "warning",
    });

  const byeCount = byeWeekCounts.counts[player.byeWeek] || 0;
  if (byeCount >= 2) {
    const samePosCount =
      byeWeekCounts.posCounts[`${player.byeWeek}_${player.position}`] || 0;
    let penalty = byeCount * WEIGHTS.byeWeekBase + WEIGHTS.byeWeekStack;
    penalty += samePosCount * WEIGHTS.byeWeekSamePosition;
    score -= penalty;
    reasons.unshift({
      text: `Bye week ${player.byeWeek} conflicts with ${byeCount} players you've already drafted${samePosCount > 0 ? " (including same position)" : ""}`,
      type: "warning",
    });
  }

  const topReason = reasons[0] ?? {
    text: `Ranked #${player.rank} overall`,
    type: "neutral",
  };

  return {
    ...player,
    valueScore: score,
    reason: topReason.text,
    reasonType: topReason.type,
  };
}

function calculateValues(
  availablePlayers,
  rosterByPosition,
  currentPick,
  yourRoster = [],
  positionNeeds = DEFAULT_POSITION_NEEDS,
  flexCapacity = 0,
  benchSwingCapacity = 0,
  totalPicks = 0,
  starterNeeds = positionNeeds,
) {
  const lastInTier = getLastInTier(availablePlayers);
  const neededPositions = getNeededPositions(rosterByPosition, starterNeeds);
  const surplusPositions = getSurplusPositions(
    rosterByPosition,
    positionNeeds,
    flexCapacity,
    benchSwingCapacity,
  );
  const byeWeekCounts = getByeWeekCounts(yourRoster);

  const scored = availablePlayers.map((player) =>
    scorePlayer(player, {
      lastInTier,
      neededPositions,
      surplusPositions,
      byeWeekCounts,
      currentPick,
      totalPicks,
      positionNeeds,
      byPositionRoster: rosterByPosition,
    }),
  );

  scored.sort((a, b) => b.valueScore - a.valueScore || a.rank - b.rank);

  return scored;
}

module.exports = {
  calculateValues,
  getNeededPositions,
  getSurplusPositions,
  parseSosRating,
  DEFAULT_POSITION_NEEDS,
  BENCH_SWING_ELIGIBLE,
  NO_BOARD_VALUE_POSITIONS,
  POSITION_PRIORITY_ORDER,
  isTierGatedOut,
};
