const BASE_URL = "https://api.sleeper.app/v1";

async function sleeperGet(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Sleeper API error (${res.status}) for ${path}`);
  }
  return res.json();
}

async function getUser(username) {
  return sleeperGet(`/user/${encodeURIComponent(username)}`);
}

async function getDraft(draftId) {
  return sleeperGet(`/draft/${encodeURIComponent(draftId)}`);
}

async function getDraftPicks(draftId) {
  return sleeperGet(`/draft/${encodeURIComponent(draftId)}/picks`);
}

function mapScoringType(sleeperScoringType) {
  if (!sleeperScoringType) return "ppr";
  const type = sleeperScoringType.toLowerCase();
  if (type.includes("half")) return "half";
  if (type === "std" || type.includes("standard")) return "standard";
  return "ppr";
}

function mapDraftToConfig(sleeperDraft) {
  const s = sleeperDraft.settings || {};
  const draftPos = Object.values(sleeperDraft.draft_order) || 1;
  const bench =
    s.rounds -
    (s.slots_qb +
      s.slots_rb +
      s.slots_wr +
      s.slots_te +
      s.slots_flex +
      s.slots_k +
      s.slots_def);
  return {
    teamCount: s.teams ?? 12,
    totalRounds: s.rounds ?? 15,
    draftType: sleeperDraft.type === "linear" ? "linear" : "snake",
    scoringFormat: mapScoringType(sleeperDraft.metadata?.scoring_type),
    rosterConfig: {
      QB: s.slots_qb ?? 1,
      RB: s.slots_rb ?? 2,
      WR: s.slots_wr ?? 2,
      TE: s.slots_te ?? 1,
      FLEX: s.slots_flex ?? 1,
      K: s.slots_k ?? 1,
      DEF: s.slots_def ?? 1,
      BENCH: bench ?? 6,
    },
    draftOrder: sleeperDraft.draft_order || {},
    draftPosition: draftPos,
  };
}

module.exports = { getUser, getDraft, getDraftPicks, mapDraftToConfig };
