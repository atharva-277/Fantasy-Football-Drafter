const WEIGHTS = {
  rankBase: 500,
  tierDrop: 25,
  rosterNeed: 5,
  rosterSurplus: -20, // penalty once a position is genuinely full (see FLEX logic below)
  boardValue: 2,
  byeWeekBase: 6, // penalty per rostered player sharing this bye week
  byeWeekStack: 10, // extra flat penalty once you already have 2+ sharing this bye
  byeWeekSamePosition: 12, // extra penalty per rostered player at the SAME position sharing this bye
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

// How many of your FLEX slots are already effectively "used" by RB/WR/TE
// players you drafted beyond that position's own base starter count.
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

// A position only counts as "surplus" (score penalty + suggestion suppression)
// once its base starter count is met AND, for RB/WR/TE, there's no FLEX
// capacity left to absorb another player there.
function getSurplusPositions(
  rosterByPosition,
  positionNeeds = DEFAULT_POSITION_NEEDS,
  flexCapacity = 0,
) {
  const surplus = new Set();
  const flexUsed = getFlexUsage(rosterByPosition, positionNeeds);
  const flexRemaining = Math.max(0, flexCapacity - flexUsed);

  Object.entries(positionNeeds).forEach(([pos, min]) => {
    const current = rosterByPosition[pos]?.length ?? 0;
    if (current < min) return; // still a raw need, not a surplus

    if (FLEX_ELIGIBLE.includes(pos)) {
      if (flexRemaining <= 0) surplus.add(pos);
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

  // 1. Rank anchor
  score += WEIGHTS.rankBase - player.rank;

  // 2. Board value
  const pickDelta = currentPick - player.rank;
  if (pickDelta > 0) {
    score += pickDelta * WEIGHTS.boardValue;
    reasons.push(`Still available ${pickDelta} picks past their expected spot`);
  } else if (pickDelta < 0) {
    score += pickDelta * WEIGHTS.boardValue;
    reasons.push(`Reaching ${Math.abs(pickDelta)} picks early`);
  }

  // 3. Tier drop
  if (lastInTier.has(player.name)) {
    score += WEIGHTS.tierDrop;
    reasons.push("Last in tier — quality drops after this pick");
  }

  // 4. Roster need / surplus
  if (neededPositions.has(player.position)) {
    score += WEIGHTS.rosterNeed;
    reasons.push(`Your roster needs a ${player.position}`);
  } else if (surplusPositions.has(player.position)) {
    score += WEIGHTS.rosterSurplus;
    reasons.push(
      `You already have enough ${player.position}s (including FLEX capacity)`,
    );
  }

  // 5. SOS
  const sosStars = parseSosRating(player.sosRating);
  const sosBonus = WEIGHTS.sosBonuses[sosStars] ?? 0;
  score += sosBonus;
  if (sosStars >= 4) reasons.push(`Favorable schedule (${sosStars}/5 stars)`);
  if (sosStars <= 2) reasons.push(`Tough schedule (${sosStars}/5 stars)`);

  // 6. Bye week conflicts — only kicks in once you already have 2+ players
  // sharing this bye week; escalates further if they're the same position.
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
) {
  const lastInTier = getLastInTier(availablePlayers);
  const neededPositions = getNeededPositions(rosterByPosition, positionNeeds);
  const surplusPositions = getSurplusPositions(
    rosterByPosition,
    positionNeeds,
    flexCapacity,
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
};
