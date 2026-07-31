const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_USER = process.env.GITHUB_USER || "DinDja";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = process.argv[2] || "dist/voxel-terrain.svg";
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
          "User-Agent": "voxel-terrain-generator",
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
  let seed = 1337;
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
        v < 0.2
          ? 0
          : Math.floor(1 + rnd() * (3 + 22 * Math.abs(Math.sin(w / 5 + d / 3))));
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

// === ISOMETRIC PROJECTION (classic 2:1, i.e. 30°) ===
// Unit vectors:
//   X axis (weekday) → ( 7.794,  4.5)
//   Z axis (week)    → (−7.794,  4.5)
//   Y axis (height)  → ( 0,    −8.55)
const S = 9;
const VX = { x: S * 0.866, y: S * 0.5 };
const VZ = { x: -S * 0.866, y: S * 0.5 };
const VY = { x: 0, y: -S * 0.95 };
const MAX_H = 8; // max blocks per column

function point(x, z) {
  return { x: 669 + x * VX.x + z * VZ.x, y: 70 + (x + z) * VX.y };
}

// --- Color ramps by column height (deep blue → azure → violet → hot) ---
function baseColor(h) {
  if (h >= 7) return "#e0507a";
  if (h >= 5) return "#6a5acd";
  if (h >= 3) return "#0a66c2";
  if (h >= 2) return "#0f4fa8";
  return "#123a8c";
}

// Shade a #rrggbb hex color by a brightness factor
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function generateTerrain(data) {
  const W = 980, H = 360;
  const weeks = data.weeks;
  const allDays = weeks.flatMap((w) => w.contributionDays);
  const maxCount = Math.max(1, ...allDays.map((d) => d.contributionCount));
  const total = data.totalContributions;
  const N = weeks.length;

  const cols = 7; // days of the week

  // Build the voxel columns list (painter order: far → near, i.e. z asc, x asc)
  const columns = [];
  weeks.forEach((week, z) => {
    week.contributionDays.forEach((day, x) => {
      const count = day.contributionCount;
      if (count <= 0) return;
      const intensity = count / maxCount;
      const h = Math.max(1, Math.ceil(intensity * MAX_H));
      columns.push({ x, z, h, intensity, count });
    });
  });

  // Ground grid: rhombus border + iso lines along both axes
  const gridLines = [];
  for (let z = 0; z <= N; z++) {
    const a = point(0, z);
    const b = point(cols, z);
    gridLines.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="grid"/>`);
  }
  for (let x = 0; x <= cols; x++) {
    const a = point(x, 0);
    const b = point(x, N);
    gridLines.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="grid"/>`);
  }

  // Ground slab (subtle fill under the grid)
  const g0 = point(0, 0), g1 = point(cols, 0), g2 = point(cols, N), g3 = point(0, N);
  const groundSlab = `${g0.x.toFixed(1)},${g0.y.toFixed(1)} ${g1.x.toFixed(1)},${g1.y.toFixed(1)} ${g2.x.toFixed(1)},${g2.y.toFixed(1)} ${g3.x.toFixed(1)},${g3.y.toFixed(1)}`;

  // Corner labels (distance markers on the ground plane, subtle)
  const cornerLabel = (p, txt) =>
    `<text x="${(p.x - 4).toFixed(1)}" y="${(p.y - 6).toFixed(1)}" class="corner">${txt}</text>`;

  // Build voxel polygons for a column
  function voxelPolys(col) {
    const { x, z, h, intensity } = col;
    const base = point(x, z);
    const polys = [];
    const cBase = baseColor(h);
    const cTop = shade(cBase, 1.18);
    const cLeft = shade(cBase, 0.88);
    const cRight = shade(cBase, 0.68);

    for (let k = 0; k < h; k++) {
      const by = base.y + k * VY.y;
      // corners at this level (viewer-closest corner = B)
      const B = { x: base.x, y: by };
      const L = { x: base.x + VZ.x, y: by + VZ.y }; // left-back
      const R = { x: base.x + VX.x, y: by + VX.y }; // right-back
      const T = { x: base.x + VX.x + VZ.x, y: by + VX.y + VZ.y }; // far corner
      const Bu = { x: B.x, y: B.y + VY.y };
      const Lu = { x: L.x, y: L.y + VY.y };
      const Ru = { x: R.x, y: R.y + VY.y };
      const Tu = { x: T.x, y: T.y + VY.y };

      polys.push(`<polygon points="${B.x.toFixed(1)},${B.y.toFixed(1)} ${L.x.toFixed(1)},${L.y.toFixed(1)} ${Lu.x.toFixed(1)},${Lu.y.toFixed(1)} ${Bu.x.toFixed(1)},${Bu.y.toFixed(1)}" fill="${cLeft}" stroke="#0b0e1a" stroke-width="0.4"/>`);
      polys.push(`<polygon points="${B.x.toFixed(1)},${B.y.toFixed(1)} ${R.x.toFixed(1)},${R.y.toFixed(1)} ${Ru.x.toFixed(1)},${Ru.y.toFixed(1)} ${Bu.x.toFixed(1)},${Bu.y.toFixed(1)}" fill="${cRight}" stroke="#0b0e1a" stroke-width="0.4"/>`);
      if (k === h - 1) {
        polys.push(`<polygon points="${Bu.x.toFixed(1)},${Bu.y.toFixed(1)} ${Lu.x.toFixed(1)},${Lu.y.toFixed(1)} ${Tu.x.toFixed(1)},${Tu.y.toFixed(1)} ${Ru.x.toFixed(1)},${Ru.y.toFixed(1)}" fill="${cTop}" stroke="#0b0e1a" stroke-width="0.5"/>`);
      }
    }

    // Beacon on hot peaks (top face center, pulsing)
    let beacon = "";
    if (intensity > 0.82 || h === MAX_H) {
      const topY = base.y + h * VY.y;
      const cx = base.x;
      const cy = topY + VY.y + VX.y; // center of top face
      beacon = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.6" fill="#ffd166" class="beacon" style="animation-delay:${((x + z) % 6) * 0.35}s"/>`;
    }

    return {
      polys: polys.join(""),
      beacon,
      delay: ((x + z) * 0.045) % 2.5,
    };
  }

  const built = columns.map(voxelPolys);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs>
    <style>
      @keyframes rise {
        from { transform: translateY(18px); opacity: 0.2; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      @keyframes beaconpulse {
        0%, 100% { opacity: 0.25; }
        50%      { opacity: 1; }
      }
      @keyframes gridfade { from { opacity: 0; } to { opacity: 1; } }
      .rise { animation: rise 1.1s cubic-bezier(0.22, 0.68, 0.36, 1) both; }
      .beacon { animation: beaconpulse 2.2s ease-in-out infinite; }
      .grid { stroke: #274a8c; stroke-width: 1; opacity: 0.32; }
      .grid-fade { animation: gridfade 1.6s ease-out both; }
      .slab { fill: #0d1b3d; opacity: 0.45; }
      .label { fill: #aab8e8; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 10px; letter-spacing: 1px; }
      .title { fill: #9db8ff; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 12px; font-weight: bold; letter-spacing: 2px; }
      .corner { fill: #274a8c; font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 7px; }
    </style>
  </defs>

  <!-- ── Background ── -->
  <rect width="${W}" height="${H}" fill="#0b0e1a"/>
  <ellipse cx="490" cy="150" rx="430" ry="180" fill="#0d1b3d" opacity="0.35"/>

  <!-- ── Ground plane ── -->
  <g class="grid-fade">
    <polygon points="${groundSlab}" class="slab"/>
    ${gridLines.join("")}
    <polygon points="${groundSlab}" fill="none" stroke="#4d7df0" stroke-width="1.6" opacity="0.5"/>
    ${cornerLabel(g0, "JAN")}
    ${cornerLabel(g1, "SEG")}
    ${cornerLabel(g3, "DEZ")}
  </g>

  <!-- ── Voxel columns (painter order far → near) ── -->
  ${built.map((b) => `
  <g class="rise" style="animation-delay:${b.delay.toFixed(2)}s">
    ${b.polys}
    ${b.beacon}
  </g>`).join("")}

  <!-- ── Frame labels ── -->
  <text x="40" y="30" class="title">VOXEL_TERRAIN_${YEAR}</text>
  <text x="${W - 40}" y="30" text-anchor="end" class="title" style="opacity:0.75">@${GITHUB_USER}</text>
  <text x="40" y="${H - 16}" class="label">${total} commits · ${N} weeks</text>
  <text x="${W - 40}" y="${H - 16}" text-anchor="end" class="label" style="opacity:0.55">isometric 30° · height = activity</text>

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
  const svg = generateTerrain(calendar);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated: ${outPath}`);
  console.log(`Contributions: ${calendar.totalContributions}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
