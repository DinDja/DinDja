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
// The helix is drawn with real depth: segments whose midpoint is on the
// viewer-facing half of the cylinder (sin θ < 0) are the "front" layer and
// are drawn on top; the others form the "back" layer drawn underneath.
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

  const xs = [], y1s = [], y2s = [], thetas = [];
  for (let i = 0; i < N; i++) {
    xs.push(rungX(i, N));
    y1s.push(strandY(i, N, 0));
    y2s.push(strandY(i, N, Math.PI));
    thetas.push((i / PERIOD) * 2 * Math.PI);
  }

  // Split a strand into a single path containing only front (or back)
  // segments. Each segment is classified by the sign of sin at its midpoint.
  function splitStrand(ys, front) {
    let d = "";
    let penUp = true;
    for (let i = 0; i < N - 1; i++) {
      const isFront = Math.sin(thetas[i]) + Math.sin(thetas[i + 1]) < 0;
      if (isFront === front) {
        d += (penUp ? `M ${xs[i].toFixed(1)},${ys[i].toFixed(1)}` : "") +
          ` L ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
        penUp = false;
      } else {
        penUp = true;
      }
    }
    return d || `M ${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  }

  const backRungs = [], frontRungs = [];
  const backBeads = [], frontBeads = [];
  const labels = [];

  for (let i = 0; i < N; i++) {
    const count = weekCounts[i];
    const x = xs[i], y1 = y1s[i], y2 = y2s[i];
    const intensity = count / maxW;
    const front = Math.sin(thetas[i]) < 0;
    const pair = i % 2 === 0 ? ["A", "T"] : ["C", "G"];
    const delay = ((i * 0.11) % 2.4).toFixed(2);

    if (count > 0) {
      const w = front
        ? (2.5 + 4.5 * intensity).toFixed(1)
        : (1.6 + 2.4 * intensity).toFixed(1);
      const cls = front
        ? intensity > 0.75 ? "rung rung-hot" : "rung"
        : "rung rung-back";
      const rung = `<line x1="${x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${rungColor(intensity)}" stroke-width="${w}" class="${cls}" style="animation-delay:${delay}s"/>`;
      if (front) frontRungs.push(rung); else backRungs.push(rung);

      if (intensity > 0.3) {
        labels.push(`<text x="${x.toFixed(1)}" y="183" class="basepair" opacity="${front ? 0.75 : 0.28}">${pair[0]}${pair[1]}</text>`);
      }

      if (front && intensity > 0.6) {
        frontRungs.push(`<circle cx="${x.toFixed(1)}" cy="${CY}" r="2.2" fill="#e0f2ff" opacity="0.9"/>`);
      }
    }

    const mkBead = (y, c, f) =>
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${f ? 2.7 : 1.7}" fill="${c}" opacity="${f ? 0.95 : 0.42}"/>`;
    if (front) {
      frontBeads.push(mkBead(y1, NUC[pair[0]], true));
      frontBeads.push(mkBead(y2, NUC[pair[1]], true));
    } else {
      backBeads.push(mkBead(y1, NUC[pair[0]], false));
      backBeads.push(mkBead(y2, NUC[pair[1]], false));
    }
  }

  const d1F = splitStrand(y1s, true), d1B = splitStrand(y1s, false);
  const d2F = splitStrand(y2s, true), d2B = splitStrand(y2s, false);

  // Hottest week marker
  let peakIdx = 0;
  for (let i = 1; i < N; i++) if (weekCounts[i] > weekCounts[peakIdx]) peakIdx = i;
  const peakX = xs[peakIdx];

  // Seeded rng for background particles (deterministic output)
  let rng = 424242;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  const particles = [];
  for (let i = 0; i < 46; i++) {
    particles.push({
      x: 8 + rand() * (W - 16),
      y: 8 + rand() * (H - 16),
      r: 0.4 + rand() * 0.9,
      c: rand() > 0.5 ? "#7fb3ff" : "#b794f6",
      tw: 2.6 + rand() * 3.2,
      dl: rand() * 3,
    });
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs>
    <style>
      @keyframes helixin { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes rungpulse {
        0%, 100% { opacity: 0.6; }
        50%      { opacity: 1; }
      }
      @keyframes twinkle { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.75; } }
      @keyframes halo {
        0%, 100% { opacity: 0.2; transform: scale(1); }
        50%      { opacity: 0.55; transform: scale(1.25); }
      }
      @keyframes peakpulse {
        0%, 100% { transform: rotate(45deg) scale(1); }
        50%      { transform: rotate(45deg) scale(1.45); }
      }
      @keyframes energyblur { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.6; } }
      .helix { animation: helixin 1.6s ease-out; }
      .strand { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .flow { fill: none; stroke-linecap: round; }
      .rung { stroke-linecap: round; }
      .rung-back { opacity: 0.4; }
      .rung-hot { animation: rungpulse 1.8s ease-in-out infinite; }
      .particle { animation: twinkle 3.2s ease-in-out infinite; }
      .peak-halo { fill: #ffd166; transform-origin: ${peakX.toFixed(1)}px ${CY}px; animation: halo 2s ease-in-out infinite; }
      .peak { fill: #ffd166; transform-origin: ${peakX.toFixed(1)}px ${CY}px; animation: peakpulse 2s ease-in-out infinite; }
      .energy { animation: energyblur 1.6s ease-in-out infinite; }
      .basepair { fill: #9db8ff; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 6.5px; text-anchor: middle; letter-spacing: 0.5px; }
      .label { fill: #aab8e8; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 10px; letter-spacing: 1px; }
      .title { fill: #9db8ff; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 12px; font-weight: bold; letter-spacing: 2px; }
    </style>
    <linearGradient id="strandGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="50%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1b2a55" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0b0e1a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgGlow2" cx="30%" cy="25%" r="60%">
      <stop offset="0%" stop-color="#14225c" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#0b0e1a" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- ── Background ── -->
  <rect width="${W}" height="${H}" fill="#0b0e1a"/>
  <ellipse cx="490" cy="180" rx="460" ry="175" fill="url(#bgGlow)"/>
  <ellipse cx="330" cy="120" rx="360" ry="150" fill="url(#bgGlow2)"/>
  ${particles.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" fill="${p.c}" class="particle" style="animation-duration:${p.tw.toFixed(1)}s;animation-delay:${p.dl.toFixed(1)}s"/>`).join("")}

  <!-- Week guides (vertical hairline per base pair) -->
  ${xs.map((x) => `<line x1="${x.toFixed(1)}" y1="48" x2="${x.toFixed(1)}" y2="312" stroke="#ffffff" stroke-width="1" opacity="0.03"/>`).join("")}

  <g class="helix">
    <!-- ── Back layer: dim strands + flowing nucleotides ── -->
    <path d="${d1B}" class="strand" stroke="url(#strandGrad)" stroke-width="11" opacity="0.07"/>
    <path d="${d2B}" class="strand" stroke="url(#strandGrad)" stroke-width="11" opacity="0.07"/>
    <path d="${d1B}" class="strand" stroke="url(#strandGrad)" stroke-width="4.5" opacity="0.4"/>
    <path d="${d2B}" class="strand" stroke="url(#strandGrad)" stroke-width="4.5" opacity="0.4"/>
    <path d="${d1B}" class="flow" stroke="#ffffff" stroke-width="2" stroke-dasharray="2 30" opacity="0.2">
      <animate attributeName="stroke-dashoffset" from="640" to="0" dur="9s" repeatCount="indefinite"/>
    </path>
    <path d="${d2B}" class="flow" stroke="#ffffff" stroke-width="2" stroke-dasharray="2 30" opacity="0.2">
      <animate attributeName="stroke-dashoffset" from="640" to="0" dur="9s" repeatCount="indefinite" begin="1.2s"/>
    </path>

    <!-- ── Back rungs, labels and beads ── -->
    <g>${backRungs.join("")}</g>
    <g>${labels.filter(() => false).join("")}</g>
    <g>${backBeads.join("")}</g>

    <!-- ── Axis spine (cylinder illusion) ── -->
    <line x1="${AX}" y1="${CY}" x2="${AW}" y2="${CY}" stroke="#3b82f6" stroke-width="34" opacity="0.035"/>
    <line x1="${AX}" y1="${CY}" x2="${AW}" y2="${CY}" stroke="#22d3ee" stroke-width="10" opacity="0.06"/>
    <line x1="${AX}" y1="${CY}" x2="${AW}" y2="${CY}" stroke="#ffffff" stroke-width="1.2" opacity="0.14"/>

    <!-- ── Front rungs, labels and beads ── -->
    <g>${frontRungs.join("")}</g>
    <g>${labels.join("")}</g>
    <g>${frontBeads.join("")}</g>

    <!-- ── Front layer: bright strands + flowing nucleotides ── -->
    <path d="${d1F}" class="strand" stroke="url(#strandGrad)" stroke-width="24" opacity="0.05"/>
    <path d="${d2F}" class="strand" stroke="url(#strandGrad)" stroke-width="24" opacity="0.05"/>
    <path d="${d1F}" class="strand" stroke="url(#strandGrad)" stroke-width="13" opacity="0.14"/>
    <path d="${d2F}" class="strand" stroke="url(#strandGrad)" stroke-width="13" opacity="0.14"/>
    <path d="${d1F}" class="strand" stroke="url(#strandGrad)" stroke-width="4.5"/>
    <path d="${d2F}" class="strand" stroke="url(#strandGrad)" stroke-width="4.5"/>
    <path d="${d1F}" class="flow" stroke="#9bd1ff" stroke-width="2.5" stroke-dasharray="2 30" opacity="0.85">
      <animate attributeName="stroke-dashoffset" from="640" to="0" dur="8s" repeatCount="indefinite"/>
    </path>
    <path d="${d2F}" class="flow" stroke="#d4b8ff" stroke-width="2.5" stroke-dasharray="2 30" opacity="0.85">
      <animate attributeName="stroke-dashoffset" from="640" to="0" dur="8s" repeatCount="indefinite" begin="1.2s"/>
    </path>

    <!-- ── Peak week marker ── -->
    <circle cx="${peakX.toFixed(1)}" cy="${CY}" r="13" class="peak-halo"/>
    <rect x="${(peakX - 4.5).toFixed(1)}" y="${CY - 4.5}" width="9" height="9" class="peak"/>

    <!-- ── Energy packets riding the strands ── -->
    <circle r="4.5" fill="#ffffff">
      <animateMotion dur="8s" repeatCount="indefinite" path="${d1F}"/>
    </circle>
    <circle r="10" fill="#3b82f6" class="energy">
      <animateMotion dur="8s" repeatCount="indefinite" path="${d1F}"/>
    </circle>
    <circle r="4.5" fill="#ffffff">
      <animateMotion dur="12s" repeatCount="indefinite" begin="2s" path="${d2F}"/>
    </circle>
    <circle r="10" fill="#8b5cf6" class="energy">
      <animateMotion dur="12s" repeatCount="indefinite" begin="2s" path="${d2F}"/>
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
