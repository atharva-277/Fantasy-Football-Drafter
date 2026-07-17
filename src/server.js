const express = require("express");
const path = require("path");
const draftState = require("./engine/draftState");
const {
  initEngine,
  getSuggestions,
  searchPlayers,
  getTopAvailable,
} = require("./engine/suggestionEngine");
const { loadRankings } = require("./data/rankingsLoader");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ── Status ─────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({ status: "ok", message: "FF Draft Assistant is running" });
});

// ── Start Draft ────────────────────────────────────────────
app.post("/api/draft/start", async (req, res) => {
  try {
    const { teamCount, yourPick, totalRounds, scoringFormat, rosterConfig } =
      req.body;

    draftState.initDraft({
      teamCount,
      yourPick,
      totalRounds,
      scoringFormat,
      rosterConfig,
    });
    await initEngine(scoringFormat);

    res.json({ success: true, ...getSuggestions() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Log a Pick ─────────────────────────────────────────────
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

// ── Get Suggestions ────────────────────────────────────────
app.get("/api/draft/suggestions", (req, res) => {
  try {
    res.json(getSuggestions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Search ─────────────────────────────────────────────────
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

app.listen(PORT);
