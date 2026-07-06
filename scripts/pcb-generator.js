const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_USER = process.env.GITHUB_USER || "DinDja";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = process.argv[2] || "dist/circuit-board.svg";
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
          "User-Agent": "pcb-generator",
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
          } catch { reject(new Error(data.slice(0, 200))); }
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

function generatePCB(data) {
  const W = 900, H = 530;
  const weeks = data.weeks;
  const maxCount = Math.max(1, ...weeks.flatMap(w => w.contributionDays.map(d => d.contributionCount)));
  const totalWeeks = weeks.length;
  const totalDays = weeks.reduce((s, w) => s + w.contributionDays.length, 0);

  // PCB traces
  const traces = [
    { x1: 40, y1: 60, x2: 860, y2: 60 }, { x1: 40, y1: 100, x2: 860, y2: 100 },
    { x1: 40, y1: 140, x2: 860, y2: 140 }, { x1: 40, y1: 200, x2: 860, y2: 200 },
    { x1: 40, y1: 260, x2: 860, y2: 260 }, { x1: 40, y1: 320, x2: 860, y2: 320 },
    { x1: 40, y1: 380, x2: 860, y2: 380 }, { x1: 40, y1: 440, x2: 860, y2: 440 },
    { x1: 40, y1: 480, x2: 860, y2: 480 },
    { x1: 100, y1: 60, x2: 100, y2: 140 }, { x1: 200, y1: 100, x2: 200, y2: 260 },
    { x1: 300, y1: 60, x2: 300, y2: 200 }, { x1: 400, y1: 140, x2: 400, y2: 320 },
    { x1: 500, y1: 60, x2: 500, y2: 200 }, { x1: 600, y1: 200, x2: 600, y2: 440 },
    { x1: 700, y1: 100, x2: 700, y2: 320 }, { x1: 800, y1: 60, x2: 800, y2: 140 },
    { x1: 150, y1: 60, x2: 250, y2: 200 }, { x1: 350, y1: 140, x2: 450, y2: 260 },
    { x1: 550, y1: 60, x2: 650, y2: 200 }, { x1: 750, y1: 200, x2: 820, y2: 320 },
    { x1: 120, y1: 200, x2: 220, y2: 380 }, { x1: 480, y1: 260, x2: 580, y2: 440 },
  ];

  const vias = [
    { x: 100, y: 60 }, { x: 100, y: 140 }, { x: 200, y: 100 }, { x: 200, y: 260 },
    { x: 300, y: 60 }, { x: 300, y: 200 }, { x: 400, y: 140 }, { x: 400, y: 320 },
    { x: 500, y: 60 }, { x: 500, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 440 },
    { x: 700, y: 100 }, { x: 700, y: 320 }, { x: 800, y: 60 }, { x: 800, y: 140 },
  ];

  const chips = [
    { x: 60, y: 170, w: 70, h: 90, label: "CPU" },
    { x: 770, y: 350, w: 75, h: 65, label: "GPU" },
    { x: 380, y: 350, w: 90, h: 70, label: "RAM" },
    { x: 60, y: 400, w: 70, h: 60, label: "ROM" },
    { x: 620, y: 50, w: 70, h: 60, label: "PWR" },
    { x: 210, y: 60, w: 60, h: 50, label: "I/O" },
  ];

  // Build animated segments from contributions
  let dayI = 0;
  const activeSegs = [];
  const glows = [];

  for (const week of weeks) {
    for (const day of week.contributionDays) {
      const intensity = day.contributionCount / maxCount;
      if (intensity > 0.02) {
        const tr = traces[dayI % traces.length];
        const t = ((dayI * 7) % totalDays) / totalDays;
        const mx = tr.x1 + (tr.x2 - tr.x1) * t;
        const my = tr.y1 + (tr.y2 - tr.y1) * t;
        const segLen = 3 + intensity * 18;
        const ang = Math.atan2(tr.y2 - tr.y1, tr.x2 - tr.x1);
        const ex = mx + Math.cos(ang) * segLen;
        const ey = my + Math.sin(ang) * segLen;
        const color = intensity > 0.7 ? "#00ff88" : intensity > 0.4 ? "#ffaa00" : intensity > 0.15 ? "#ff6600" : "#44aaff";
        activeSegs.push({ x1: mx, y1: my, x2: ex, y2: ey, color, intensity, delay: Math.random() * 3 });
        glows.push({ cx: mx, cy: my, r: 1.5 + intensity * 7, color, delay: Math.random() * 3 });
      }
      dayI++;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <style>
      @keyframes pulse { 0%,100% { opacity:0.3; } 50% { opacity:1; } }
      @keyframes flow { 0% { stroke-dashoffset:80; } 100% { stroke-dashoffset:0; } }
      @keyframes blink { 0%,100% { opacity:0.15; } 50% { opacity:0.8; } }
      .trace { fill:none; stroke:#1a3a2a; stroke-width:2; }
      .trace-active { fill:none; stroke-width:2.5; animation: flow 2s ease-in-out infinite; }
      .via { fill:#1a3a2a; stroke:#2d5a3a; stroke-width:1; }
      .glow { animation: pulse 2s ease-in-out infinite; }
      .chip { fill:#0d2818; stroke:#2d5a3a; stroke-width:1.5; rx:4; }
      .pin { fill:#1a3a2a; stroke:#2d5a3a; stroke-width:0.5; }
      .label { fill:#44aaff; font-family:'Courier New',monospace; font-size:10px; text-anchor:middle; }
      .stat { fill:#2d5a3a; font-family:'Courier New',monospace; font-size:9px; }
      .title { fill:#44aaff; font-family:'Courier New',monospace; font-size:13px; font-weight:bold; }
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="#0a1a10" rx="8"/>
  <rect x="2" y="2" width="${W-4}" height="${H-4}" fill="none" stroke="#1a3a2a" stroke-width="1" rx="8"/>

  ${traces.map(t => `<line x1="${t.x1}" y1="${t.y1}" x2="${t.x2}" y2="${t.y2}" class="trace"/>`).join("")}

  ${activeSegs.map(s => `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.color}" class="trace-active" style="stroke-dasharray:${3+s.intensity*18};animation-delay:${s.delay}s"/>`).join("")}

  ${glows.map(g => `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="${g.color}" opacity="0.5" class="glow" style="animation-delay:${g.delay}s"/><circle cx="${g.cx}" cy="${g.cy}" r="${g.r*0.35}" fill="${g.color}" opacity="0.9"/>`).join("")}

  ${vias.map(v => `<circle cx="${v.x}" cy="${v.y}" r="4" class="via"/><circle cx="${v.x}" cy="${v.y}" r="1.8" fill="#0d2818"/>`).join("")}

  ${chips.map(c => {
    const pins = [];
    for (let i = 0; i < 4; i++) { const py = c.y + 12 + i * ((c.h - 24) / 3); pins.push(`<rect x="${c.x-6}" y="${py-2}" width="6" height="4" class="pin"/>`); }
    for (let i = 0; i < 4; i++) { const py = c.y + 12 + i * ((c.h - 24) / 3); pins.push(`<rect x="${c.x+c.w}" y="${py-2}" width="6" height="4" class="pin"/>`); }
    return `<g>${pins.join("")}<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" class="chip"/><circle cx="${c.x+c.w/2}" cy="${c.y+4}" r="2.5" fill="#1a3a2a"/><text x="${c.x+c.w/2}" y="${c.y+c.h/2+3}" class="label">${c.label}</text></g>`;
  }).join("")}

  <rect x="20" y="${H-48}" width="${W-40}" height="28" fill="none" stroke="#1a3a2a" stroke-width="1" rx="3"/>
  <text x="30" y="${H-31}" class="stat">SYS: ONLINE</text>
  <text x="200" y="${H-31}" class="stat">COMMITS: ${data.totalContributions}</text>
  <text x="450" y="${H-31}" class="stat">UPTIME: ${YEAR}</text>
  <text x="700" y="${H-31}" class="stat">NODE: ${GITHUB_USER}</text>

  <text x="30" y="30" class="title">${YEAR} // CIRCUIT_BOARD.SVG</text>
  <text x="${W-30}" y="30" text-anchor="end" class="title">REV ${totalWeeks}.${String(data.totalContributions).slice(0,3)}</text>
</svg>`;
}

async function main() {
  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const calendar = await fetchContributions(GITHUB_USER, TOKEN);
  const svg = generatePCB(calendar);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated: ${outPath}`);
  console.log(`Contributions: ${calendar.totalContributions}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
