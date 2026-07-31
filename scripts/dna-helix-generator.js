const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_USER = process.env.GITHUB_USER || "DinDja";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = process.argv[2] || "dist/dna-helix.svg";
const YEAR = new Date().getFullYear();

function fetchGraphQL(query, variables, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request(
      {
        hostname: "api.github.com",
        path: "/graphql",
        method: "POST",
        headers: {
          "User-Agent": "dna-helix-generator",
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            if (j.errors) reject(new Error(j.errors[0].message));
            else resolve(j);
          } catch {
            reject(new Error(data.slice(0, 200)));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function fetchContributions(user, token) {
  const from = `${YEAR}-01-01T00:00:00Z`;
  const to = `${YEAR}-12-31T23:59:59Z`;
  const query = `
    query($user: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $user) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { contributionCount date weekday } }
          }
        }
      }
    }
  `;
  const res = await fetchGraphQL(query, { user, from, to }, token);
  return res.data.user.contributionsCollection.contributionCalendar;
}

function mockCalendar() {
  let seed = 2026;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const weeks = [];
  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const v = rnd();
      const count =
        v < 0.19
          ? 0
          : Math.floor(1 + rnd() * (3 + 19 * Math.abs(Math.sin(w / 5.5 + d * 0.8))));
      days.push({ contributionCount: count, date: `${YEAR}-01-01`, weekday: d });
    }
    weeks.push({ contributionDays: days });
  }
  return {
    totalContributions: weeks
      .flatMap((w) => w.contributionDays)
      .reduce((a, b) => a + b.contributionCount, 0),
    weeks,
  };
}

// === DNA HELIX — 53 base pairs, one per week ===
const AX = 60, AW = 920;              // helix horizontal extent
const CY = 180, AMP = 56;             // vertical center & amplitude
const PERIOD = 20;                    // weeks per full turn

function rungX(i, N) {
  return AX + (i * (AW - AX)) / Math.max(1, N - 1);
}
function strandY(i, N, phase) {
  return CY + AMP * Math.sin((i / PERIOD) * 2 * Math.PI + phase);
}

function rungColor(int) {
  if (int > 0.75) return "#ffb347";
  if (int > 0.5) return "#6a5acd";
  if (int > 0.25) return "#0a66c2";
  return "#3a5a8c";
}

// Nucleotide bead colors (classic bioinformatics palette)
const NUC = { A: "#3fbf7f", T: "#e05d5d", C: "#3f7fbf", G: "#ffd166" };

function generateDNA(data) {
  const W = 980, H = 360;
  const weeks = data.weeks;
  const weekCounts = weeks.map((w) =>
    w.contributionDays.reduce((a, d) => a + d.contributionCount, 0)
  );
  const maxW = Math.max(1, ...weekCounts);
  const total = data.totalContributions;
  const N = weeks.length;

  // Strand polylines
  const pts1 = [], pts2 = [];
  for (let i = 0; i < N; i++) {
    const x = rungX(i, N);
    pts1.push(`${x.toFixed(1)},${strandY(i, N, 0).toFixed(1)}`);
    pts2.push(`${x.toFixed(1)},${strandY(i, N, Math.PI).toFixed(1)}`);
  }
  const d1 = `M ${pts1.join(" L ")}`;
  const d2 = `M ${pts2.join(" L ")}`;

  // Rungs + base-pair labels + nucleotide beads
  const rungs = [];
  const beads = [];
  for (let i = 0; i < N; i++) {
    const count = weekCounts[i];
    const x = rungX(i, N);
    const y1 = strandY(i, N, 0);
    const y2 = strandY(i, N, Math.PI);
    const intensity = count / maxW;

    if (count > 0) {
      const w = (2 + 3.2 * intensity).toFixed(1);
      const cls = intensity > 0.75 ? "rung rung-hot" : "rung";
      const delay = ((i * 0.11) % 2.4).toFixed(2);
      rungs.push(`<line x1="${x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${rungColor(intensity)}" stroke-width="${w}" class="${cls}" style="animation-delay:${delay}s"/>`);
      if (intensity > 0.3) {
        const pair = i % 2 === 0 ? ["A", "T"] : ["C", "G"];
        rungs.push(`<text x="${x.toFixed(1)}" y="183" class="basepair" opacity="0.55">${pair[0]}${pair[1]}</text>`);
      }
    }

    // Nucleotide beads on the backbones (every week)
    const pair = i % 2 === 0 ? ["A", "T"] : ["C", "G"];
    beads.push(`<circle cx="${x.toFixed(1)}" cy="${y1.toFixed(1)}" r="2.1" fill="${NUC[pair[0]]}" opacity="0.85"/>`);
    beads.push(`<circle cx="${x.toFixed(1)}" cy="${y2.toFixed(1)}" r="2.1" fill="${NUC[pair[1]]}" opacity="0.85"/>`);
  }

  // Week guides (vertical hairline per base pair)
  const guides = [];
  for (let i = 0; i < N; i++) {
    const x = rungX(i, N);
    guides.push(`<line x1="${x.toFixed(1)}" y1="48" x2="${x.toFixed(1)}" y2="312" stroke="#ffffff" stroke-width="1" opacity="0.035"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs>
    <style>
      @keyframes helixin { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes rungpulse {
        0%, 100% { opacity: 0.65; }
        50%      { opacity: 1; }
      }
      @keyframes energyblur { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.6; } }
      .helix { animation: helixin 1.6s ease-out both; }
      .strand { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .strand-glow { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .rung { stroke-linecap: round; }
      .rung-hot { animation: rungpulse 1.8s ease-in-out infinite; }
      .energy { animation: energyblur 1.6s ease-in-out infinite; }
      .basepair { fill: #9db8ff; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 6.5px; text-anchor: middle; letter-spacing: 0.5px; }
      .label { fill: #aab8e8; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 10px; letter-spacing: 1px; }
      .title { fill: #9db8ff; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 12px; font-weight: bold; letter-spacing: 2px; }
    </style>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1b2a55" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0b0e1a" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- ── Background ── -->
  <rect width="${W}" height="${H}" fill="#0b0e1a"/>
  <ellipse cx="490" cy="180" rx="460" ry="175" fill="url(#bgGlow)"/>
  ${guides.join("")}

  <!-- ── Helix ── -->
  <g class="helix">
    <!-- Strand glows -->
    <path d="${d1}" class="strand-glow" stroke="#3b82f6" stroke-width="12" opacity="0.16"/>
    <path d="${d2}" class="strand-glow" stroke="#8b5cf6" stroke-width="12" opacity="0.16"/>

    <!-- Rungs + labels (drawn under the backbones) -->
    <g>${rungs.join("")}</g>

    <!-- Backbones -->
    <path d="${d1}" class="strand" stroke="#3b82f6" stroke-width="4.5"/>
    <path d="${d2}" class="strand" stroke="#8b5cf6" stroke-width="4.5"/>

    <!-- Nucleotide beads -->
    <g>${beads.join("")}</g>

    <!-- Energy packets riding the strands -->
    <circle r="4.5" fill="#ffffff">
      <animateMotion dur="7s" repeatCount="indefinite" path="${d1}"/>
    </circle>
    <circle r="10" fill="#3b82f6" class="energy">
      <animateMotion dur="7s" repeatCount="indefinite" path="${d1}"/>
    </circle>
    <circle r="4.5" fill="#ffffff">
      <animateMotion dur="11s" repeatCount="indefinite" begin="2s" path="${d2}"/>
    </circle>
    <circle r="10" fill="#8b5cf6" class="energy">
      <animateMotion dur="11s" repeatCount="indefinite" begin="2s" path="${d2}"/>
    </circle>
  </g>

  <!-- ── Frame labels ── -->
  <text x="40" y="30" class="title">DOUBLE_HELIX_${YEAR}</text>
  <text x="${W - 40}" y="30" text-anchor="end" class="title" style="opacity:0.75">@${GITHUB_USER}</text>
  <text x="40" y="${H - 16}" class="label">${total} commits · ${N} base pairs</text>
  <text x="${W - 40}" y="${H - 16}" text-anchor="end" class="label" style="opacity:0.55">A-T · C-G · one pair per week</text>

  <!-- ── Border ── -->
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#1b2a55" stroke-width="1.5" rx="6"/>
</svg>`;
}

async function main() {
  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const calendar = process.env.MOCK_DATA === "1"
    ? mockCalendar()
    : await fetchContributions(GITHUB_USER, TOKEN);
  const svg = generateDNA(calendar);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated: ${outPath}`);
  console.log(`Contributions: ${calendar.totalContributions}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
