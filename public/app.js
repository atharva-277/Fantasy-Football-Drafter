let draftConfig = {
  teamCount: 12,
  yourPick: 1,
  totalRounds: 15,
  scoringFormat: "ppr",
  draftType: "snake",
};

let rosterConfig = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  K: 1,
  DEF: 1,
  BENCH: 6,
};

let draftMeta = {};
let selectedPlayer = null;
let searchTimeout = null;
let showTopTalent = false;

let ROSTER_SLOTS = buildRosterSlots(rosterConfig);

function buildRosterSlots(cfg) {
  const slots = [];
  ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"].forEach((pos) => {
    for (let i = 0; i < (cfg[pos] || 0); i++) slots.push(pos);
  });
  for (let i = 0; i < (cfg.BENCH || 0); i++) slots.push("BE");
  return slots;
}

function readRosterConfigFromInputs() {
  return {
    QB: parseInt(document.getElementById("slotQB").value) || 0,
    RB: parseInt(document.getElementById("slotRB").value) || 0,
    WR: parseInt(document.getElementById("slotWR").value) || 0,
    TE: parseInt(document.getElementById("slotTE").value) || 0,
    FLEX: parseInt(document.getElementById("slotFLEX").value) || 0,
    K: parseInt(document.getElementById("slotK").value) || 0,
    DEF: parseInt(document.getElementById("slotDEF").value) || 0,
    BENCH: parseInt(document.getElementById("slotBENCH").value) || 0,
  };
}

const NAME_SUFFIXES = new Set([
  "jr",
  "jr.",
  "sr",
  "sr.",
  "ii",
  "iii",
  "iv",
  "v",
]);

function getDisplayLastName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  while (
    parts.length > 1 &&
    NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase().replace(".", ""))
  ) {
    parts.pop();
  }
  return parts[parts.length - 1];
}

function updateComputedRounds() {
  const cfg = readRosterConfigFromInputs();
  document.getElementById("computedRounds").textContent =
    buildRosterSlots(cfg).length;
}

async function checkServer() {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    dot.classList.add("online");
    text.textContent = data.message;
  } catch {
    dot.classList.add("error");
    text.textContent = "Server offline";
  }
}

function initSetup() {
  document
    .getElementById("startDraftBtn")
    .addEventListener("click", startDraft);

  [
    "slotQB",
    "slotRB",
    "slotWR",
    "slotTE",
    "slotFLEX",
    "slotK",
    "slotDEF",
    "slotBENCH",
  ].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateComputedRounds);
  });
  updateComputedRounds();
}

async function startDraft() {
  const btn = document.getElementById("startDraftBtn");
  btn.textContent = "Loading...";
  btn.disabled = true;

  rosterConfig = readRosterConfigFromInputs();
  ROSTER_SLOTS = buildRosterSlots(rosterConfig);

  draftConfig = {
    teamCount: parseInt(document.getElementById("teamCount").value),
    yourPick:
      parseInt(document.getElementById("yourPick").value) <=
      parseInt(document.getElementById("teamCount").value)
        ? parseInt(document.getElementById("yourPick").value)
        : parseInt(document.getElementById("teamCount").value),
    totalRounds: ROSTER_SLOTS.length,
    scoringFormat: document.getElementById("scoringFormat").value,
    draftType: document.getElementById("draftType").value,
  };

  try {
    const res = await fetch("/api/draft/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draftConfig, rosterConfig }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById("totalPicks").textContent =
      draftConfig.teamCount * draftConfig.totalRounds;
    document.getElementById("yourPickBadge").textContent =
      `Your pick: #${draftConfig.yourPick}`;

    populateTeamSelect();
    renderRosterStrip([]);
    updateFromServer(data);

    document.getElementById("setupOverlay").classList.add("hidden");
  } catch (err) {
    btn.textContent = "Start Draft";
    btn.disabled = false;
    alert(`Failed to start draft: ${err.message}`);
  }
}

function populateTeamSelect() {
  const select = document.getElementById("teamSelect");
  select.innerHTML = "";
  for (let i = 1; i <= draftConfig.teamCount; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i === draftConfig.yourPick ? `T${i} (You)` : `T${i}`;
    select.appendChild(opt);
  }
}

function advanceTeamSelector(nextPick) {
  if (!nextPick) return;
  const pickInRound = ((nextPick - 1) % draftConfig.teamCount) + 1;
  let team;
  if (draftConfig.draftType === "linear") {
    team = pickInRound;
  } else {
    const round = Math.ceil(nextPick / draftConfig.teamCount);
    const isOddRound = round % 2 === 1;
    team = isOddRound ? pickInRound : draftConfig.teamCount - pickInRound + 1;
  }
  document.getElementById("teamSelect").value = team;
}

function updateFromServer(data) {
  draftMeta = data.meta;
  renderRosterStrip(data.meta.yourRoster);
  updateTurnState(data.meta);
  updatePickCount();
  updateNextPicks(data.meta.nextPicks);
  advanceTeamSelector(data.meta.currentPick);

  if (data.meta.isDraftOver) {
    renderDraftComplete();
    return;
  }

  if (document.getElementById("playerSearch").value.trim()) return;

  if (!data.meta.yourTurn && showTopTalent) {
    fetchAndRenderTopAvailable();
  } else {
    renderSuggestions(data.suggestions);
  }
}

// ── Turn State ─────────────────────────────────────────────
function updateTurnState(meta) {
  const totalPicks = draftConfig.teamCount * draftConfig.totalRounds;
  document.getElementById("currentPick").textContent = meta.isDraftOver
    ? totalPicks
    : meta.currentPick;

  const banner = document.getElementById("yourTurnBanner");
  const panel = document.getElementById("suggestionsPanel");

  if (meta.isDraftOver) {
    banner.textContent = "✅ Draft Complete";
    banner.classList.add("visible");
    panel.style.boxShadow = "";
    disableDraftControls();
    return;
  }

  enableDraftControls();

  if (meta.yourTurn) {
    banner.classList.add("visible");
    panel.style.boxShadow =
      "0 0 0 1px var(--green), inset 0 0 32px rgba(0,200,83,0.06)";
  } else {
    banner.classList.remove("visible");
    panel.style.boxShadow = "";
  }
}

function disableDraftControls() {
  const search = document.getElementById("playerSearch");
  search.disabled = true;
  search.value = "";
  search.placeholder = "Draft complete";

  document.getElementById("logPickBtn").disabled = true;
  document.getElementById("logPickBtn").textContent = "Draft Complete";
  document.getElementById("logPickBtn").classList.remove("has-selection");

  document.getElementById("teamSelect").disabled = true;
  document.getElementById("topTalentToggle").disabled = true;

  selectedPlayer = null;
}

function enableDraftControls() {
  document.getElementById("playerSearch").disabled = false;
  document.getElementById("playerSearch").placeholder = "🔍  Search players...";
  document.getElementById("logPickBtn").disabled = false;
  document.getElementById("teamSelect").disabled = false;
  document.getElementById("topTalentToggle").disabled = false;
}

function renderDraftComplete() {
  const list = document.getElementById("suggestionsList");
  list.innerHTML =
    '<div class="empty-state">🏁 Draft complete — good luck this season!</div>';
}

// ── Next Picks Display ─────────────────────────────────────
function updateNextPicks(nextPicks) {
  const container = document.getElementById("nextPicksDisplay");
  if (!nextPicks?.length) {
    container.innerHTML = "";
    return;
  }

  const upcoming = nextPicks.filter(
    (p) => p.pickNumber > (draftMeta.currentPick ?? 0),
  );
  if (!upcoming.length) {
    container.innerHTML = "";
    return;
  }

  const next = upcoming[0];
  container.innerHTML = `
    <span class="next-pick-badge">Next: #${next.pickNumber} (R${next.round})</span>
    ${upcoming[1] ? `<span class="next-pick-badge muted">Then: #${upcoming[1].pickNumber} (R${upcoming[1].round})</span>` : ""}
  `;
}

// ── Suggestions ────────────────────────────────────────────
function renderSuggestions(suggestions) {
  const list = document.getElementById("suggestionsList");
  list.innerHTML = "";

  if (!suggestions?.length) {
    list.innerHTML = '<div class="empty-state">No suggestions available.</div>';
    return;
  }

  suggestions.forEach((s) => {
    const card = document.createElement("div");
    let cardClass = "suggestion-card";
    if (s.isReach) cardClass += " is-reach";
    if (s.isSteal) cardClass += " is-steal";
    if (selectedPlayer?.name === s.name) cardClass += " is-selected";

    card.className = cardClass;
    card.dataset.name = s.name;
    card.dataset.position = s.position;
    card.dataset.team = s.team;

    card.innerHTML = `
      <div class="suggestion-rank">${s.suggestRank}</div>
      <div class="suggestion-info">
        <span class="suggestion-name">${s.name}
          <span class="suggestion-team">${s.team}</span>
        </span>
        <span class="suggestion-reason ${s.reasonType === "warning" || s.reasonType === "reach" ? "reason-reach" : s.reasonType === "steal" ? "reason-steal" : ""}">
          ${s.reasonType === "warning" || s.reasonType === "reach" ? "⚠️" : s.reasonType === "steal" ? "🔥" : "•"} ${s.reason}
        </span>
      </div>
      <div class="suggestion-meta">
        <span class="pos-badge pos-${s.position}">${s.position}</span>
        <span class="tier-label">T${s.tier} · Bye ${s.byeWeek || "—"}</span>
        <span class="value-score">${s.valueScore} pts</span>
      </div>
    `;

    card.addEventListener("click", () =>
      selectPlayer({ name: s.name, position: s.position, team: s.team }),
    );

    list.appendChild(card);
  });
}

// ── Search ─────────────────────────────────────────────────
function initSearch() {
  const input = document.getElementById("playerSearch");

  input.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    const query = input.value.trim();

    if (!query) {
      clearSelectedPlayer();
      fetchAndRenderSuggestions();
      return;
    }

    searchTimeout = setTimeout(() => runSearch(query), 200);
  });
}

async function runSearch(query) {
  try {
    const res = await fetch(`/api/draft/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderSearchResults(data.results);
  } catch (err) {
    console.error("Search failed:", err);
  }
}

function renderSearchResults(results) {
  const list = document.getElementById("suggestionsList");
  list.innerHTML = "";

  if (!results.length) {
    list.innerHTML = '<div class="empty-state">No players found.</div>';
    return;
  }

  results.forEach((p) => {
    const card = document.createElement("div");
    let cardClass = `suggestion-card ${p.taken ? "is-taken" : ""}`;
    if (!p.taken && p.isReach) cardClass += " is-reach";
    if (!p.taken && p.isSteal) cardClass += " is-steal";
    if (selectedPlayer?.name === p.name) cardClass += " is-selected";

    card.className = cardClass;
    card.dataset.name = p.name;
    card.dataset.position = p.position;
    card.dataset.team = p.team;

    const statusLine = p.taken
      ? "❌ Already drafted"
      : `Tier ${p.tier} · Bye ${p.byeWeek || "—"}${p.reason ? ` — ${p.reason}` : ""}`;

    card.innerHTML = `
      <div class="suggestion-rank" style="font-size:14px">#${p.rank}</div>
      <div class="suggestion-info">
        <span class="suggestion-name">${p.name}
          <span class="suggestion-team">${p.team}</span>
        </span>
        <span class="suggestion-reason ${p.taken ? "reason-reach" : ""}">
          ${statusLine}
        </span>
      </div>
      <div class="suggestion-meta">
        <span class="pos-badge pos-${p.position}">${p.position}</span>
        ${p.valueScore !== null ? `<span class="value-score">${p.valueScore} pts</span>` : ""}
      </div>
    `;

    if (!p.taken) {
      card.addEventListener("click", () => {
        selectPlayer({ name: p.name, position: p.position, team: p.team });
      });
    }

    list.appendChild(card);
  });
}

// ── Player Selection ───────────────────────────────────────
function selectPlayer(player) {
  selectedPlayer = player;

  document.querySelectorAll(".suggestion-card").forEach((c) => {
    c.classList.toggle("is-selected", c.dataset.name === player.name);
  });

  document.getElementById("logPickBtn").textContent = `Log: ${player.name}`;
  document.getElementById("logPickBtn").classList.add("has-selection");
}

function clearSelectedPlayer() {
  selectedPlayer = null;
  document
    .querySelectorAll(".suggestion-card")
    .forEach((c) => c.classList.remove("is-selected"));
  document.getElementById("logPickBtn").textContent = "Log Pick";
  document.getElementById("logPickBtn").classList.remove("has-selection");
}

async function fetchAndRenderSuggestions() {
  if (!draftMeta.yourTurn && showTopTalent && !draftMeta.isDraftOver) {
    await fetchAndRenderTopAvailable();
    return;
  }
  try {
    const res = await fetch("/api/draft/suggestions");
    const data = await res.json();
    renderSuggestions(data.suggestions);
  } catch (err) {
    console.error("Failed to fetch suggestions:", err);
  }
}

async function fetchAndRenderTopAvailable() {
  try {
    const res = await fetch("/api/draft/top-available");
    const data = await res.json();
    renderTopAvailable(data.players);
  } catch (err) {
    console.error("Failed to fetch top available:", err);
  }
}

function renderTopAvailable(players) {
  const list = document.getElementById("suggestionsList");
  list.innerHTML = "";

  if (!players?.length) {
    list.innerHTML = '<div class="empty-state">No players available.</div>';
    return;
  }

  players.forEach((p, i) => {
    const card = document.createElement("div");
    let cardClass = "suggestion-card is-board-view";
    if (selectedPlayer?.name === p.name) cardClass += " is-selected";

    card.className = cardClass;
    card.dataset.name = p.name;
    card.dataset.position = p.position;
    card.dataset.team = p.team;

    card.innerHTML = `
      <div class="suggestion-rank">${i + 1}</div>
      <div class="suggestion-info">
        <span class="suggestion-name">${p.name}
          <span class="suggestion-team">${p.team}</span>
        </span>
        <span class="suggestion-reason">Tier ${p.tier} · Bye ${p.byeWeek || "—"}</span>
      </div>
      <div class="suggestion-meta">
        <span class="pos-badge pos-${p.position}">${p.position}</span>
      </div>
    `;

    card.addEventListener("click", () =>
      selectPlayer({ name: p.name, position: p.position, team: p.team }),
    );

    list.appendChild(card);
  });
}

// ── Log a Pick ─────────────────────────────────────────────
function initPickLogger() {
  document.getElementById("logPickBtn").addEventListener("click", logPick);
}

async function logPick() {
  if (!selectedPlayer) {
    document.getElementById("playerSearch").style.borderColor = "var(--red)";
    setTimeout(
      () => (document.getElementById("playerSearch").style.borderColor = ""),
      1000,
    );
    return;
  }

  const team = parseInt(document.getElementById("teamSelect").value);
  if (!team) return;

  try {
    const res = await fetch("/api/draft/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: selectedPlayer.name, team }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    renderPicksList(data.pick);
    clearSelectedPlayer();
    document.getElementById("playerSearch").value = "";
    updateFromServer(data);
  } catch (err) {
    alert(`Failed to log pick: ${err.message}`);
  }
}

const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

// Assigns each drafted player to a matching roster slot: exact position
// first, then FLEX if eligible, then bench — in draft order, so earlier
// picks get priority for their natural position slot.
function assignRosterSlots(roster, slotLabels) {
  const assignments = new Array(slotLabels.length).fill(null);

  roster.forEach((player) => {
    let slotIndex = -1;

    // 1. Exact position match
    slotIndex = slotLabels.findIndex(
      (label, i) => label === player.position && !assignments[i],
    );

    // 2. FLEX, if eligible
    if (slotIndex === -1 && FLEX_ELIGIBLE.includes(player.position)) {
      slotIndex = slotLabels.findIndex(
        (label, i) => label === "FLEX" && !assignments[i],
      );
    }

    // 3. Bench
    if (slotIndex === -1) {
      slotIndex = slotLabels.findIndex(
        (label, i) => label === "BE" && !assignments[i],
      );
    }

    if (slotIndex !== -1) {
      assignments[slotIndex] = player;
    }
    // if no slot at all is open (shouldn't happen given totalRounds ===
    // slot count), the player just won't show in the strip
  });

  return assignments;
}

// ── Roster Strip ───────────────────────────────────────────
function renderRosterStrip(roster = []) {
  const strip = document.getElementById("rosterStrip");
  strip.innerHTML = "";

  const assignments = assignRosterSlots(roster, ROSTER_SLOTS);

  ROSTER_SLOTS.forEach((pos, i) => {
    const player = assignments[i];
    strip.innerHTML += `
      <div class="roster-slot" data-position="${pos}" ${player ? `data-filled-position="${player.position}"` : ""}>
        <span class="roster-slot-pos">${pos}</span>
        <div class="roster-slot-player ${player ? "filled" : ""}">
          ${player ? getDisplayLastName(player.playerName) : "—"}
        </div>
      </div>
    `;
  });
}

// ── Pick Count ─────────────────────────────────────────────
function updatePickCount() {
  const total = draftConfig.teamCount * draftConfig.totalRounds;
  const current = draftMeta.currentPick ?? 1;
  document.getElementById("pickCount").textContent =
    `${current - 1} of ${total} picks made`;
}

// ── Picks Log ──────────────────────────────────────────────
function renderPicksList(newPick) {
  if (!newPick) return;

  const list = document.getElementById("picksList");
  const empty = list.querySelector(".empty-state");
  if (empty) empty.remove();

  const row = document.createElement("div");
  row.className = `pick-row ${newPick.isYours ? "your-pick" : ""}`;
  row.dataset.position = newPick.position;
  row.innerHTML = `
    <span class="pick-number">#${newPick.pickNumber}</span>
    <span class="pick-team">T${newPick.team}</span>
    <span class="pick-player">${newPick.playerName}</span>
    <span class="pos-badge pos-${newPick.position}">${newPick.position}</span>
  `;

  list.insertBefore(row, list.firstChild);
}

function initTopTalentToggle() {
  const btn = document.getElementById("topTalentToggle");
  btn.addEventListener("click", () => {
    showTopTalent = !showTopTalent;
    btn.classList.toggle("active", showTopTalent);
    btn.textContent = showTopTalent ? "Top Talent: ON" : "Top Talent: OFF";

    if (document.getElementById("playerSearch").value.trim()) return;
    fetchAndRenderSuggestions();
  });
}

async function init() {
  await checkServer();
  initSetup();
  initPickLogger();
  initSearch();
  initTopTalentToggle();

  document.getElementById("teamSelect").addEventListener("change", () => {
    fetchAndRenderSuggestions();
  });
}

init();
