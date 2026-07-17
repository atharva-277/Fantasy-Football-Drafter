const WEIGHTS = {
  rankBase: 500,
  tierDrop: 25,
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

const DEFAULT_POSITION_NEEDS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
const FLEX_ELIGIBLE = ["RB", "WR", "TE"];
const BENCH_SWING_ELIGIBLE = ["RB", "WR"];

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

function getFlexUsage(rosterByPosition, positionNeeds) {
  let used = 0;
  FLEX_ELIGIBLE.forEach((pos) => {
    const count = rosterByPosition[pos]?.length ?? 0;
    const base = positionNeeds[pos] ?? 0;
    used += Math.max(0, count - base);
  });
  return used;
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
  { lastInTier, neededPositions, surplusPositions, byeWeekCounts, currentPick },
) {
  let score = 0;
  const reasons = [];

  score += WEIGHTS.rankBase - player.rank;

  const pickDelta = currentPick - player.rank;
  if (pickDelta > 0) {
    score += pickDelta * WEIGHTS.boardValue;
    reasons.push(`Still available ${pickDelta} picks past their expected spot`);
  } else if (pickDelta < 0) {
    score += pickDelta * WEIGHTS.boardValue;
    reasons.push(`Reaching ${Math.abs(pickDelta)} picks early`);
  }

  if (lastInTier.has(player.name)) {
    score += WEIGHTS.tierDrop;
    reasons.push("Last in tier — quality drops after this pick");
  }

  if (neededPositions.has(player.position)) {
    score += WEIGHTS.rosterNeed;
    reasons.push(`Your roster needs a ${player.position}`);
  } else if (surplusPositions.has(player.position)) {
    score += WEIGHTS.rosterSurplus;
    reasons.push(
      `You already have enough ${player.position}s (including FLEX capacity)`,
    );
  }

  const sosStars = parseSosRating(player.sosRating);
  const sosBonus = WEIGHTS.sosBonuses[sosStars] ?? 0;
  score += sosBonus;
  if (sosStars >= 4) reasons.push(`Favorable schedule (${sosStars}/5 stars)`);
  if (sosStars <= 2) reasons.push(`Tough schedule (${sosStars}/5 stars)`);

  const byeCount = byeWeekCounts.counts[player.byeWeek] || 0;
  if (byeCount >= 2) {
    const samePosCount =
      byeWeekCounts.posCounts[`${player.byeWeek}_${player.position}`] || 0;
    let penalty = byeCount * WEIGHTS.byeWeekBase + WEIGHTS.byeWeekStack;
    penalty += samePosCount * WEIGHTS.byeWeekSamePosition;
    score -= penalty;
    reasons.unshift(
      `Bye week ${player.byeWeek} conflicts with ${byeCount} players you've already drafted${samePosCount > 0 ? " (including same position)" : ""}`,
    );
  }

  const topReason = reasons[0] ?? `Ranked #${player.rank} overall`;

  return { ...player, valueScore: score, reason: topReason };
}

function calculateValues(
  availablePlayers,
  rosterByPosition,
  currentPick,
  yourRoster = [],
  positionNeeds = DEFAULT_POSITION_NEEDS,
  flexCapacity = 0,
  benchSwingCapacity = 0,
) {
  const lastInTier = getLastInTier(availablePlayers);
  const neededPositions = getNeededPositions(rosterByPosition, positionNeeds);
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
  FLEX_ELIGIBLE,
  BENCH_SWING_ELIGIBLE,
};
