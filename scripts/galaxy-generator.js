const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_USER = process.env.GITHUB_USER || "DinDja";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = process.argv[2] || "dist/galaxy.svg";
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
          "User-Agent": "galaxy-generator",
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
  let seed = 42;
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
        v < 0.18
          ? 0
          : Math.floor(1 + rnd() * (4 + 20 * Math.abs(Math.sin(w / 6 + d / 2))));
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

// === GALAXY GEOMETRY — sunflower phyllotaxis ===
// Each week of the year is a "seed" on a golden-angle spiral:
//   θ = i · 137.5078°  (golden angle — packs seeds evenly, no overlap)
//   r = Rmin + (Rmax − Rmin)·√(i/N)  (square-root growth keeps arms readable)
const CX = 490, CY = 172;
const RMIN = 46, RMAX = 296;
const GOLDEN = 2.399963229728653; // 137.5078° in radians

function weekPolar(i, N) {
  const r = RMIN + (RMAX - RMIN) * Math.sqrt(i / Math.max(1, N - 1));
  const th = i * GOLDEN;
  return { r, th };
}

function polarToXY(p, jitter = 0) {
  const jr = jitter ? (Math.random() - 0.5) * jitter : 0;
  const jt = jitter ? (Math.random() - 0.5) * jitter * 0.06 : 0;
  const r = p.r + jr;
  const th = p.th + jt;
  return { x: CX + r * Math.cos(th), y: CY + r * Math.sin(th) };
}

// Star palette: colder (dim blue) → hotter (white → warm gold)
function starPalette(int) {
  if (int > 0.85) return { core: "#ffe9b0", glow: "#ffb347" };
  if (int > 0.6) return { core: "#ffffff", glow: "#a8c8ff" };
  if (int > 0.35) return { core: "#cfe0ff", glow: "#6f9dff" };
  if (int > 0.15) return { core: "#9db8ff", glow: "#4d7df0" };
  return { core: "#6b8cff", glow: "#2f56c8" };
}

function generateGalaxy(data) {
  const W = 980, H = 360;
  const weeks = data.weeks;
  const allDays = weeks.flatMap((w) => w.contributionDays);
  const maxCount = Math.max(1, ...allDays.map((d) => d.contributionCount));
  const total = data.totalContributions;
  const N = weeks.length;

  // Seeded rng for background stars & decoration (deterministic output)
  let rng = 987654321;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };

  // --- Week markers: faint ring dots (the spiral path, visible even on idle weeks)
  const markers = [];
  for (let i = 0; i < N; i++) {
    const p = weekPolar(i, N);
    const { x, y } = polarToXY(p);
    markers.push({ x, y, i });
  }

  // --- Stars: one per active day, jittered around its week seed
  const stars = [];
  weeks.forEach((week, wIdx) => {
    const p = weekPolar(wIdx, N);
    week.contributionDays.forEach((day, dIdx) => {
      const count = day.contributionCount;
      if (count <= 0) return;
      const intensity = count / maxCount;
      const { x, y } = polarToXY(p, 7 + intensity * 5);
      const pal = starPalette(intensity);
      const r = 0.8 + 1.9 * Math.pow(intensity, 0.7);
      stars.push({
        x, y, r, core: pal.core, glow: pal.glow,
        intensity,
        tw: 1.6 + rand() * 2.4,
        delay: (rand() * 5) % 5,
        hue: dIdx + wIdx, // unused, kept for deterministic stability
      });
    });
  });

  // --- Background field stars (static)
  const fieldStars = [];
  for (let i = 0; i < 150; i++) {
    fieldStars.push({
      x: 10 + rand() * (W - 20),
      y: 10 + rand() * (H - 20),
      r: 0.3 + rand() * 0.8,
      o: 0.12 + rand() * 0.35,
    });
  }

  // --- Dust lanes: dark arcs hugging the spiral arms
  function spiralPath(offset, turns) {
    const pts = [];
    const steps = 110;
    for (let s = 0; s <= steps; s++) {
      const th = s * ((turns * 2 * Math.PI) / steps);
      const r = RMIN * 0.55 + (RMAX * 0.94 - RMIN * 0.55) * (th / (turns * 2 * Math.PI));
      const x = CX + r * Math.cos(th + offset);
      const y = CY + r * Math.sin(th + offset) * 0.96;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return `M ${pts.join(" L ")}`;
  }
  const dustLane1 = spiralPath(0.25, 3.2);
  const dustLane2 = spiralPath(Math.PI + 0.45, 3.2);

  // --- Nebulae (3 soft clouds, gentle rotation via galaxy group)
  const nebulae = [
    { cx: 335, cy: 115, rx: 185, ry: 95, rot: -24, color: "#16216b" },
    { cx: 645, cy: 235, rx: 165, ry: 88, rot: 22, color: "#3d1a6b" },
    { cx: 575, cy: 88, rx: 135, ry: 75, rot: 40, color: "#5d1a4a" },
  ];

  // Cluster hot stars into tiny open clusters (visual richness)
  const clusters = [];
  for (let i = 0; i < N; i++) {
    const p = weekPolar(i, N);
    const active = weeks[i].contributionDays.reduce((a, d) => a + d.contributionCount, 0);
    if (active > 0) {
      const { x, y } = polarToXY(p, 3);
      clusters.push({ x, y, o: 0.05 + 0.06 * Math.min(1, active / 12) });
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs>
    <style>
      @keyframes twinkle { 0%, 100% { opacity: 0.18; } 50% { opacity: 0.95; } }
      @keyframes corepulse {
        0%, 100% { opacity: 0.55; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.12); }
      }
      @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
      .star-glow { animation: twinkle 2.4s ease-in-out infinite; }
      .galaxy { animation: fadein 2.2s ease-out both; transform-origin: ${CX}px ${CY}px; }
      .core { animation: corepulse 5s ease-in-out infinite; transform-origin: ${CX}px ${CY}px; }
      .label { fill: #aab8e8; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 10px; letter-spacing: 1px; }
      .title { fill: #d6e4ff; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 12px; font-weight: bold; letter-spacing: 2px; }
    </style>
    <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="18%" stop-color="#d6e4ff"/>
      <stop offset="45%" stop-color="#4d7df0" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#16216b" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="neb1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2b3fae" stop-opacity="0.22"/>
      <stop offset="55%" stop-color="#16216b" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#16216b" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="neb2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#5b2bae" stop-opacity="0.20"/>
      <stop offset="55%" stop-color="#3d1a6b" stop-opacity="0.09"/>
      <stop offset="100%" stop-color="#3d1a6b" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="neb3" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8f2b66" stop-opacity="0.18"/>
      <stop offset="55%" stop-color="#5d1a4a" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#5d1a4a" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- ── Deep space background ── -->
  <rect width="${W}" height="${H}" fill="#0b0e1a"/>
  ${fieldStars.map((s) => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(1)}" fill="#ffffff" opacity="${s.o.toFixed(2)}"/>`).join("")}

  <!-- ── Rotating galaxy disk ── -->
  <g class="galaxy">
    <animateTransform attributeName="transform" type="rotate" from="0 ${CX} ${CY}" to="360 ${CX} ${CY}" dur="300s" repeatCount="indefinite"/>

    <!-- Nebulae -->
    <g>
      ${nebulae.map((n, i) => `
        <ellipse cx="${n.cx}" cy="${n.cy}" rx="${n.rx}" ry="${n.ry}" fill="url(#neb${i + 1})" transform="rotate(${n.rot} ${n.cx} ${n.cy})"/>
      `).join("")}
    </g>

    <!-- Faint disk rings -->
    ${[130, 195, 262].map((r) => `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.045"/>`).join("")}

    <!-- Dust lanes -->
    <path d="${dustLane1}" fill="none" stroke="#05060f" stroke-width="30" stroke-linecap="round" opacity="0.55"/>
    <path d="${dustLane2}" fill="none" stroke="#05060f" stroke-width="26" stroke-linecap="round" opacity="0.5"/>
    <path d="${dustLane1}" fill="none" stroke="#020309" stroke-width="12" stroke-linecap="round" opacity="0.6"/>
    <path d="${dustLane2}" fill="none" stroke="#020309" stroke-width="10" stroke-linecap="round" opacity="0.55"/>

    <!-- Open-cluster halos (soft light around active weeks) -->
    ${clusters.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="9" fill="#9db8ff" opacity="${c.o.toFixed(2)}"/>`).join("")}

    <!-- Week markers (spiral path) -->
    ${markers.map((m) => `<circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="1.1" fill="#ffffff" opacity="0.10"/>`).join("")}

    <!-- Stars (one per active day) -->
    ${stars.map((s) => `
      <circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${(s.r * 4.2).toFixed(1)}" fill="${s.glow}" opacity="0.22" class="star-glow" style="animation-duration:${s.tw.toFixed(1)}s;animation-delay:${s.delay.toFixed(1)}s"/>
      <circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(1)}" fill="${s.core}" opacity="0.96"/>
      ${s.intensity > 0.6 ? `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${(s.r * 0.42).toFixed(1)}" fill="#ffffff" opacity="0.9"/>` : ""}
    `).join("")}

    <!-- Galactic core -->
    <circle cx="${CX}" cy="${CY}" r="95" fill="url(#coreGrad)"/>
    <g class="core">
      <circle cx="${CX}" cy="${CY}" r="46" fill="url(#coreGrad)"/>
      <circle cx="${CX}" cy="${CY}" r="12" fill="#ffffff" opacity="0.95"/>
    </g>
  </g>

  <!-- ── Frame labels (static, outside rotation) ── -->
  <text x="40" y="30" class="title">GITHUB_GALAXY_${YEAR}</text>
  <text x="${W - 40}" y="30" text-anchor="end" class="title" style="opacity:0.75">@${GITHUB_USER}</text>
  <text x="40" y="${H - 16}" class="label">${total} commits · ${N} weeks</text>
  <text x="${W - 40}" y="${H - 16}" text-anchor="end" class="label" style="opacity:0.55">golden angle 137.5° · ${N} star systems</text>

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
  const svg = generateGalaxy(calendar);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated: ${outPath}`);
  console.log(`Contributions: ${calendar.totalContributions}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
