const fs = require("fs");
const path = require("path");

// Maps scoring format to the correct CSV file
const RANKINGS_FILES = {
  ppr: "rankings-PPR.csv",
  half: "rankings-halfPPR.csv",
  standard: "rankings-standard.csv",
};

function parseCSV(raw) {
  const lines = raw.trim().split("\n");

  const headers = lines[0]
    .split(",")
    .map((h) => h.replace(/"/g, "").trim().toLowerCase());

  const players = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((col) => col.replace(/"/g, "").trim());

    if (!cols[0]) continue;

    const row = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? "";
    });

    players.push({
      rank: parseInt(row["rk"]) || 0,
      tier: parseInt(row["tiers"]) || 0,
      name: row["player name"] || "",
      team: row["team"] || "",
      position: (row["pos"] || "").replace(/[0-9]/g, ""), // strip numbers
      byeWeek: parseInt(row["bye week"]) || 0,
      sosRating: row["sos season"] || "",
      ecrVsAdp: parseInt(row["ecr vs. adp"]) || 0,
    });
  }

  return players;
}

function loadRankings(scoringFormat) {
  const filename = RANKINGS_FILES[scoringFormat];

  if (!filename) {
    throw new Error(
      `Unknown scoring format: "${scoringFormat}". Expected ppr, half, or standard.`,
    );
  }

  const filepath = path.join(__dirname, "../../data", filename);

  try {
    const raw = fs.readFileSync(filepath, "utf8");
    const players = parseCSV(raw);
    return players;
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`Rankings file not found: ${filepath}`);
    }
    throw err;
  }
}

module.exports = { loadRankings };
