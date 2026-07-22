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
let allPicksLog = [];

function getTeamLogoUrl(team) {
  if (!team) return null;
  const code = team.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`;
}

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

function sosStarsDisplay(sosRating) {
  if (!sosRating) return null;
  const match = String(sosRating).match(/^(\d)/);
  if (!match) return null;
  const stars = parseInt(match[1]);
  return "★".repeat(stars) + "☆".repeat(5 - stars);
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
    allPicksLog = [];
    renderBoardGrid();
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

function renderSuggestions(suggestions) {
  const list = document.getElementById("suggestionsList");
  list.innerHTML = "";

  if (!suggestions?.length) {
    list.innerHTML =
      '<tr><td colspan="7" class="empty-state">No suggestions available.</td></tr>';
    return;
  }

  suggestions.forEach((s) => {
    const row = document.createElement("tr");
    let rowClass = "sugg-row";
    if (s.isReach) rowClass += " is-reach";
    if (s.isSteal) rowClass += " is-steal";
    if (selectedPlayer?.name === s.name) rowClass += " is-selected";

    row.className = rowClass;
    row.dataset.position = s.position;
    row.dataset.name = s.name;
    row.dataset.team = s.team;

    const sosStars = sosStarsDisplay(s.sosRating);

    row.innerHTML = `
  <td class="col-rank">${s.suggestRank}</td>
  <td class="col-player">
    <span class="player-name" title="${s.name}">${s.name}</span>
  </td>
  <td class="col-bye">${s.byeWeek || "—"}</td>
  <td class="col-sos">${sosStars || "—"}</td>
  <td class="col-score">${s.valueScore}</td>
`;

    row.addEventListener("click", () =>
      selectPlayer({ name: s.name, position: s.position, team: s.team }),
    );

    list.appendChild(row);

    const detailRow = document.createElement("tr");
    detailRow.className = "sugg-detail-row";
    detailRow.dataset.name = s.name;
    detailRow.innerHTML = `
  <td class="sugg-detail-cell" colspan="5">
    <div class="player-detail-meta">
      <span><img class="team-logo" src="${getTeamLogoUrl(s.team)}" alt="${s.team}" onerror="this.style.display='none'" />${s.age ? ` · ${s.age}y` : ""}</span>
      <span>Tier ${s.tier}</span>
      <div class="player-reason ${s.reasonType === "warning" || s.reasonType === "reach" ? "reason-reach" : s.reasonType === "steal" ? "reason-steal" : ""}">
      ${s.reasonType === "warning" || s.reasonType === "reach" ? "⚠" : s.reasonType === "steal" ? "▲" : "•"} ${s.reason}
    </div>
    </div>
  </td>
`;
    list.appendChild(detailRow);
  });
}

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
    list.innerHTML =
      '<tr><td colspan="5" class="empty-state">No players found.</td></tr>';
    return;
  }

  results.forEach((p) => {
    const row = document.createElement("tr");
    let rowClass = `sugg-row ${p.taken ? "is-taken" : ""}`;
    if (!p.taken && p.isReach) rowClass += " is-reach";
    if (!p.taken && p.isSteal) rowClass += " is-steal";
    if (selectedPlayer?.name === p.name) rowClass += " is-selected";

    row.className = rowClass;
    row.dataset.position = p.position;
    row.dataset.name = p.name;
    row.dataset.team = p.team;

    row.innerHTML = `
  <td class="col-rank">#${p.rank}</td>
  <td class="col-player">
    <span class="player-name" title="${p.name}">${p.name}</span>
  </td>
  <td class="col-bye">${p.byeWeek || "—"}</td>
  <td class="col-sos">—</td>
  <td class="col-score">${p.valueScore !== null ? p.valueScore : "—"}</td>
`;

    if (!p.taken) {
      row.addEventListener("click", () => {
        selectPlayer({ name: p.name, position: p.position, team: p.team });
      });
    }

    list.appendChild(row);

    const detailRow = document.createElement("tr");
    detailRow.className = "sugg-detail-row";
    detailRow.dataset.name = p.name;
    detailRow.innerHTML = `
  <td class="sugg-detail-cell" colspan="5">
    <div class="player-detail-meta">
      <span><img class="team-logo" src="${getTeamLogoUrl(p.team)}" alt="${p.team}" onerror="this.style.display='none'" /></span>
      <span>Tier ${p.tier}</span>
      <div class="player-reason ${p.taken ? "reason-reach" : ""}">
      ${p.taken ? "Already drafted" : p.reason || `Tier ${p.tier}`}
    </div>
    </div>
  </td>
`;
    list.appendChild(detailRow);
  });
}

function selectPlayer(player) {
  selectedPlayer = player;

  document.querySelectorAll(".sugg-row").forEach((r) => {
    r.classList.toggle("is-selected", r.dataset.name === player.name);
  });
  document.querySelectorAll(".sugg-detail-row").forEach((r) => {
    r.classList.toggle("is-open", r.dataset.name === player.name);
  });

  document.getElementById("logPickBtn").textContent = `Log: ${player.name}`;
  document.getElementById("logPickBtn").classList.add("has-selection");
}

function clearSelectedPlayer() {
  selectedPlayer = null;
  document
    .querySelectorAll(".sugg-row")
    .forEach((r) => r.classList.remove("is-selected"));
  document
    .querySelectorAll(".sugg-detail-row")
    .forEach((r) => r.classList.remove("is-open"));
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
    list.innerHTML =
      '<tr><td colspan="7" class="empty-state">No players available.</td></tr>';
    return;
  }

  players.forEach((p, i) => {
    const row = document.createElement("tr");
    let rowClass = "sugg-row is-board-view";
    if (selectedPlayer?.name === p.name) rowClass += " is-selected";

    row.className = rowClass;
    row.dataset.position = p.position;
    row.dataset.name = p.name;
    row.dataset.team = p.team;

    row.innerHTML = `
  <td class="col-rank">${i + 1}</td>
  <td class="col-player">
    <span class="player-name" title="${p.name}">${p.name}</span>
  </td>
  <td class="col-bye">${p.byeWeek || "—"}</td>
  <td class="col-sos">—</td>
  <td class="col-score">—</td>
`;

    row.addEventListener("click", () =>
      selectPlayer({ name: p.name, position: p.position, team: p.team }),
    );

    list.appendChild(row);

    const detailRow = document.createElement("tr");
    detailRow.className = "sugg-detail-row";
    detailRow.dataset.name = p.name;
    detailRow.innerHTML = `
  <td class="sugg-detail-cell" colspan="5">
    <div class="player-detail-meta">
      <span><img class="team-logo" src="${getTeamLogoUrl(p.team)}" alt="${p.team}" onerror="this.style.display='none'" /></span>
      <span>Tier ${p.tier}</span>
    </div>
  </td>
`;
    list.appendChild(detailRow);
  });
}

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

function assignRosterSlots(roster, slotLabels) {
  const assignments = new Array(slotLabels.length).fill(null);

  roster.forEach((player) => {
    let slotIndex = -1;

    slotIndex = slotLabels.findIndex(
      (label, i) => label === player.position && !assignments[i],
    );

    if (slotIndex === -1 && FLEX_ELIGIBLE.includes(player.position)) {
      slotIndex = slotLabels.findIndex(
        (label, i) => label === "FLEX" && !assignments[i],
      );
    }

    if (slotIndex === -1) {
      slotIndex = slotLabels.findIndex(
        (label, i) => label === "BE" && !assignments[i],
      );
    }

    if (slotIndex !== -1) {
      assignments[slotIndex] = player;
    }
  });

  return assignments;
}

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

function updatePickCount() {
  const total = draftConfig.teamCount * draftConfig.totalRounds;
  const current = draftMeta.currentPick ?? 1;
  document.getElementById("pickCount").textContent =
    `${current - 1} of ${total} picks made`;
}

function renderPicksList(newPick) {
  if (!newPick) return;
  allPicksLog.push(newPick);
  renderBoardGrid();
}

function renderBoardGrid() {
  const wrap = document.getElementById("boardGridWrap");

  if (!allPicksLog.length) {
    wrap.innerHTML = '<div class="empty-state">No picks yet.</div>';
    return;
  }

  const teamCount = draftConfig.teamCount;
  const totalRounds = draftConfig.totalRounds;

  const byRoundTeam = {};
  allPicksLog.forEach((p) => {
    if (!byRoundTeam[p.round]) byRoundTeam[p.round] = {};
    byRoundTeam[p.round][p.team] = p;
  });

  const maxRoundWithPicks = Math.max(...allPicksLog.map((p) => p.round));
  const roundsToShow = Math.min(totalRounds, maxRoundWithPicks + 1);

  let html =
    '<table class="board-grid"><thead><tr><th class="round-col">RD</th>';
  for (let t = 1; t <= teamCount; t++) {
    html += `<th class="${t === draftConfig.yourPick ? "your-team-col" : ""}">T${t}</th>`;
  }
  html += "</tr></thead><tbody>";

  for (let r = 1; r <= roundsToShow; r++) {
    html += `<tr><td class="round-col">${r}</td>`;
    for (let t = 1; t <= teamCount; t++) {
      const pick = byRoundTeam[r]?.[t];
      const isYourCol = t === draftConfig.yourPick;
      if (pick) {
        html += `<td class="board-cell filled ${isYourCol ? "your-team-col" : ""}" data-position="${pick.position}" title="${pick.playerName}">
          <span class="board-cell-pos">${pick.position}</span>
          <span class="board-cell-name">${getDisplayLastName(pick.playerName)}</span>
        </td>`;
      } else {
        html += `<td class="board-cell ${isYourCol ? "your-team-col" : ""}"></td>`;
      }
    }
    html += "</tr>";
  }

  html += "</tbody></table>";
  wrap.innerHTML = html;

  wrap.scrollTop = wrap.scrollHeight;
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
