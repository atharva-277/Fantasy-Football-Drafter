const express = require("express");
const path = require("path");
const draftState = require("./engine/draftState");
const {
  initEngine,
  getSuggestions,
  searchPlayers,
  getTopAvailable,
  findBySleeperId,
} = require("./engine/suggestionEngine");
const { loadRankings } = require("./data/rankingsLoader");
const sleeperClient = require("./data/sleeperClient");

const app = express();
const PORT = process.env.PORT || 3000;
let lastSyncedPickNo = 0;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/status", (req, res) => {
  res.json({ status: "ok", message: "Active" });
});

app.post("/api/draft/start", async (req, res) => {
  try {
    const {
      teamCount,
      yourPick,
      totalRounds,
      scoringFormat,
      rosterConfig,
      draftType,
      sleeperDraftId,
    } = req.body;

    lastSyncedPickNo = 0;

    draftState.initDraft({
      teamCount,
      yourPick,
      totalRounds,
      scoringFormat,
      rosterConfig,
      draftType,
      sleeperDraftId,
    });
    await initEngine(scoringFormat);

    res.json({ success: true, ...getSuggestions() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/draft/pick", (req, res) => {
  try {
    const { playerName, team } = req.body;

    const state = draftState.getState();
    const rankings = loadRankings(state.config.scoringFormat);
    const found = rankings.find(
      (p) => p.name.toLowerCase() === playerName.toLowerCase(),
    );

    const pick = draftState.logPick({
      playerName,
      team,
      position: found?.position ?? "UNK",
      sleeperId: found?.sleeperId ?? null,
      byeWeek: found?.byeWeek ?? null,
    });

    res.json({ success: true, pick, ...getSuggestions() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/draft/suggestions", (req, res) => {
  try {
    res.json(getSuggestions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/draft/search", (req, res) => {
  try {
    const results = searchPlayers(req.query.q || "");
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/draft/top-available", (req, res) => {
  try {
    res.json({ players: getTopAvailable() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sleeper/draft/:draftId", async (req, res) => {
  try {
    const draft = await sleeperClient.getDraft(req.params.draftId);
    res.json({ success: true, config: sleeperClient.mapDraftToConfig(draft) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sleeper/sync", async (req, res) => {
  const t0 = Date.now();
  try {
    const config = draftState.getConfig();
    const draftId = config.sleeperDraftId;
    if (!draftId) {
      return res.json({ success: true, newPicks: [], ...getSuggestions() });
    }

    const picks = await sleeperClient.getDraftPicks(draftId);
    const newSleeperPicks = picks
      .filter((p) => p.pick_no > lastSyncedPickNo)
      .sort((a, b) => a.pick_no - b.pick_no);

    const loggedPicks = [];
    for (const sp of newSleeperPicks) {
      if (draftState.isDraftOver()) break;

      const ranked = findBySleeperId(sp.player_id);
      const playerName =
        ranked?.name ??
        `${sp.metadata?.first_name ?? ""} ${sp.metadata?.last_name ?? ""}`.trim();
      const position = ranked?.position ?? sp.metadata?.position ?? "UNK";
      const byeWeek = ranked?.byeWeek ?? null;
      const team = sp.draft_slot;

      try {
        const pick = draftState.logPick({
          playerName,
          team,
          position,
          sleeperId: sp.player_id,
          byeWeek,
        });
        loggedPicks.push(pick);
        lastSyncedPickNo = sp.pick_no;
      } catch (err) {
        break;
      }
    }

    res.json({ success: true, newPicks: loggedPicks, ...getSuggestions() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT);
