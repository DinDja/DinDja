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

// Manhattan (90°) routing helper — orthogonal polyline with rounded corners
function route(sx, sy, ex, ey, mid) {
  if (sy === ey) return `M ${sx} ${sy} L ${ex} ${ey}`;
  if (sx === ex) return `M ${sx} ${sy} L ${ex} ${ey}`;
  const mx = mid !== undefined ? mid : (sx + ex) / 2;
  return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ey} L ${ex} ${ey}`;
}

function generatePCB(data) {
  const W = 980, H = 360;
  const weeks = data.weeks;
  const allDays = weeks.flatMap(w => w.contributionDays);
  const maxCount = Math.max(1, ...allDays.map(d => d.contributionCount));
  const total = data.totalContributions;

  // === LAYOUT ===
  // Era: pins spread so traces converge towards a central bus
  // Chips use QFP style (pins on all 4 sides)
  const chips = [
    { id: "U1", x: 70, y: 110, w: 110, h: 110, label: "CPU", pinsPerSide: 7, color: "#0d1a0d" },
    { id: "U2", x: 425, y: 60, w: 130, h: 80, label: "RAM", pinsPerSide: 6, color: "#1a0d0d" },
    { id: "U3", x: 800, y: 110, w: 110, h: 110, label: "GPU", pinsPerSide: 7, color: "#0d1a0d" },
    { id: "U4", x: 70, y: 250, w: 90, h: 70, label: "ROM", pinsPerSide: 5, color: "#0d180d" },
    { id: "U5", x: 810, y: 260, w: 90, h: 60, label: "PWR", pinsPerSide: 4, color: "#1a1a0d" },
    { id: "U6", x: 425, y: 230, w: 130, h: 70, label: "I/O", pinsPerSide: 6, color: "#0d1a1a" },
  ];

  // Pin helper for QFP chips (pins on all 4 sides)
  function chipPins(c) {
    const pins = [];
    const pps = c.pinsPerSide;
    const pinW = 6, pinH = 8;
    // top
    for (let i = 0; i < pps; i++) {
      const px = c.x + 8 + (i + 0.5) * ((c.w - 16) / pps);
      pins.push({ x: px - pinW / 2, y: c.y - pinH, w: pinW, h: pinH, side: "top", idx: i, cx: px, cy: c.y });
    }
    // bottom
    for (let i = 0; i < pps; i++) {
      const px = c.x + 8 + (i + 0.5) * ((c.w - 16) / pps);
      pins.push({ x: px - pinW / 2, y: c.y + c.h, w: pinW, h: pinH, side: "bottom", idx: i, cx: px, cy: c.y + c.h });
    }
    // left
    for (let i = 0; i < pps; i++) {
      const py = c.y + 8 + (i + 0.5) * ((c.h - 16) / pps);
      pins.push({ x: c.x - pinH, y: py - pinW / 2, w: pinH, h: pinW, side: "left", idx: i, cx: c.x, cy: py });
    }
    // right
    for (let i = 0; i < pps; i++) {
      const py = c.y + 8 + (i + 0.5) * ((c.h - 16) / pps);
      pins.push({ x: c.x + c.w, y: py - pinW / 2, w: pinH, h: pinW, side: "right", idx: i, cx: c.x + c.w, cy: py });
    }
    return pins;
  }

  const allPins = {};
  chips.forEach(c => { allPins[c.id] = chipPins(c); });

  // === TRACES — Manhattan routing connecting chip pins ===
  // Each entry: { from: "U1.top.3", to: "U2.left.2", color, anim }
  const traceConns = [
    { from: { chip: "U1", side: "right", idx: 2 }, to: { chip: "U2", side: "left", idx: 1 } },
    { from: { chip: "U1", side: "right", idx: 4 }, to: { chip: "U2", side: "left", idx: 3 } },
    { from: { chip: "U1", side: "bottom", idx: 3 }, to: { chip: "U4", side: "top", idx: 2 } },
    { from: { chip: "U1", side: "bottom", idx: 5 }, to: { chip: "U6", side: "left", idx: 1 } },
    { from: { chip: "U2", side: "right", idx: 2 }, to: { chip: "U3", side: "left", idx: 2 } },
    { from: { chip: "U2", side: "right", idx: 4 }, to: { chip: "U3", side: "left", idx: 4 } },
    { from: { chip: "U3", side: "bottom", idx: 3 }, to: { chip: "U5", side: "top", idx: 1 } },
    { from: { chip: "U3", side: "bottom", idx: 5 }, to: { chip: "U6", side: "right", idx: 3 } },
    { from: { chip: "U6", side: "top", idx: 2 }, to: { chip: "U2", side: "bottom", idx: 2 } },
    { from: { chip: "U4", side: "right", idx: 2 }, to: { chip: "U6", side: "left", idx: 4 } },
    { from: { chip: "U1", side: "top", idx: 3 }, to: { chip: "U3", side: "top", idx: 3 }, via: 490 },
    { from: { chip: "U5", side: "left", idx: 1 }, to: { chip: "U4", side: "right", idx: 4 }, via: 720 },
  ];

  function findPin(conn) {
    return allPins[conn.chip].find(p => p.side === conn.side && p.idx === conn.idx);
  }

  // Generate traces as polylines (Manhattan)
  const traces = traceConns.map((tc, i) => {
    const a = findPin(tc.from);
    const b = findPin(tc.to);
    if (!a || !b) return null;
    const sx = a.cx, sy = a.cy, ex = b.cx, ey = b.cy;
    let d;
    if (tc.via) {
      d = `M ${sx} ${sy} L ${tc.via} ${sy} L ${tc.via} ${ey} L ${ex} ${ey}`;
    } else if (Math.abs(sy - ey) < 5) {
      d = `M ${sx} ${sy} L ${ex} ${ey}`;
    } else if (Math.abs(sx - ex) < 5) {
      d = `M ${sx} ${sy} L ${ex} ${ey}`;
    } else {
      const mx = (sx + ex) / 2;
      d = `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ey} L ${ex} ${ey}`;
    }
    return { d, idx: i };
  }).filter(Boolean);

  // === PER-DAY: LEDs soldered along traces, lit by contribution count ===
  // Place an LED every few days along a trace path
  const leds = [];
  const traceCount = traces.length;
  allDays.forEach((day, i) => {
    const intensity = day.contributionCount / maxCount;
    if (intensity > 0.03) {
      const trace = traces[i % traceCount];
      // Sample a point along the trace by using the midpoint variance
      const t = ((i * 11) % 100) / 100;
      // parse "M x y L x y L x y L x y"
      const pts = trace.d.match(/-?\d+\.?\d*/g).map(Number);
      const segs = [];
      let totalLen = 0;
      for (let j = 0; j < pts.length - 2; j += 2) {
        const dx = pts[j + 2] - pts[j];
        const dy = pts[j + 3] - pts[j + 1];
        const len = Math.hypot(dx, dy);
        segs.push({ x1: pts[j], y1: pts[j + 1], x2: pts[j + 2], y2: pts[j + 3], len });
        totalLen += len;
      }
      let target = t * totalLen;
      let cx = pts[0], cy = pts[1];
      for (const s of segs) {
        if (target <= s.len) {
          const r = target / s.len;
          cx = s.x1 + (s.x2 - s.x1) * r;
          cy = s.y1 + (s.y2 - s.y1) * r;
          break;
        }
        target -= s.len;
      }
      const color = intensity > 0.7 ? "#00ff88" : intensity > 0.4 ? "#aaff00" : intensity > 0.15 ? "#ffaa00" : "#44aaff";
      leds.push({ cx, cy, r: 1.8 + intensity * 4, color, intensity, delay: (i * 0.05) % 3 });
    }
  });

  // Corner mounting holes
  const holes = [
    { x: 22, y: 22 }, { x: W - 22, y: 22 },
    { x: 22, y: H - 22 }, { x: W - 22, y: H - 22 },
  ];

  // Solder pad dots (decorative random pattern)
  const seed = 12345;
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  const padDots = [];
  for (let i = 0; i < 120; i++) {
    padDots.push({ x: 30 + rand() * (W - 60), y: 30 + rand() * (H - 60), r: 0.6 + rand() * 0.8 });
  }

  // === BUILD SVG ===
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs>
    <style>
      @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
      @keyframes flow { 0% { stroke-dashoffset: 60; } 100% { stroke-dashoffset: 0; } }
      @keyframes flicker {
        0%, 100% { opacity: 0.4; }
        8% { opacity: 1; }
        9% { opacity: 0.3; }
        10% { opacity: 0.9; }
        40%, 60% { opacity: 0.6; }
      }
      .substrate { fill: #0c2a1f; }
      .solder-mask { fill: #0a3d28; opacity: 0.92; }
      .trace { fill: none; stroke: #c9a227; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
      .trace-anim { fill: none; stroke: #ffd700; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;
                    stroke-dasharray: 8 24; animation: flow 1.6s linear infinite; opacity: 0.9; }
      .pad { fill: #c9a227; }
      .pad-ring { fill: none; stroke: #c9a227; stroke-width: 0.8; }
      .via { fill: #1a1a1a; stroke: #c9a227; stroke-width: 0.8; }
      .via-inner { fill: #0c2a1f; }
      .led-glow { animation: pulse 1.8s ease-in-out infinite; }
      .led-core { animation: flicker 2.4s ease-in-out infinite; }
      .chip-body { fill: #0a0a0a; stroke: #2a2a2a; stroke-width: 1; rx: 3; }
      .chip-text { fill: #9a9a9a; font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold; text-anchor: middle; }
      .chip-id { fill: #6a6a6a; font-family: 'Courier New', monospace; font-size: 7px; text-anchor: middle; }
      .pin { fill: #c9a227; }
      .silkscreen { fill: #e8e8e8; font-family: 'Courier New', monospace; opacity: 0.7; }
      .silkscreen-line { stroke: #e8e8e8; stroke-width: 0.6; opacity: 0.5; }
      .label { fill: #e8e8e8; font-family: 'Courier New', monospace; font-size: 8px; }
      .title { fill: #ffd700; font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold; }
      .hole-outer { fill: #1a1a1a; }
      .hole-inner { fill: #0c2a1f; }
    </style>
  </defs>

  <!-- ── Substrate (PCB base) ── -->
  <rect width="${W}" height="${H}" class="substrate"/>
  <rect width="${W}" height="${H}" class="solder-mask"/>

  <!-- Decorative copper dots (texture) -->
  ${padDots.map(d => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="#c9a227" opacity="0.12"/>`).join("")}

  <!-- ── Mounting holes ── -->
  ${holes.map(h => `
    <circle cx="${h.x}" cy="${h.y}" r="10" fill="#1a1a1a"/>
    <circle cx="${h.x}" cy="${h.y}" r="6.5" fill="none" stroke="#c9a227" stroke-width="1.2"/>
    <circle cx="${h.x}" cy="${h.y}" r="4" fill="#0c2a1f"/>
    <circle cx="${h.x}" cy="${h.y}" r="2" fill="#0a0a0a"/>
  `).join("")}

  <!-- ── Traces (Manhattan routing) ── -->
  <g>
    ${traces.map(t => `<path d="${t.d}" class="trace"/>`).join("")}
  </g>
  <g>
    ${traces.map(t => `<path d="${t.d}" class="trace-anim" style="animation-delay:${(t.idx * 0.13) % 2}s"/>`).join("")}
  </g>

  <!-- ── Vias at trace junctions ── -->
  ${[
    { x: 490, y: 110 }, { x: 490, y: 230 }, { x: 490, y: 60 },
    { x: 720, y: 290 }, { x: 200, y: 285 }, { x: 855, y: 175 },
  ].map(v => `
    <circle cx="${v.x}" cy="${v.y}" r="2.5" class="via"/>
    <circle cx="${v.x}" cy="${v.y}" r="1.2" class="via-inner"/>
  `).join("")}

  <!-- ── LEDs lit by contributions ── -->
  <g>
    ${leds.map(l => `
      <circle cx="${l.cx}" cy="${l.cy}" r="${l.r * 2}" fill="${l.color}" opacity="0.18" class="led-glow" style="animation-delay:${l.delay}s"/>
      <circle cx="${l.cx}" cy="${l.cy}" r="${l.r}" fill="${l.color}" opacity="0.95" class="led-core" style="animation-delay:${(l.delay + 0.4) % 3}s"/>
      <circle cx="${l.cx}" cy="${l.cy}" r="${l.r * 0.45}" fill="#ffffff" opacity="0.9"/>
    `).join("")}
  </g>

  <!-- ── IC Chips (QFP style) ── -->
  ${chips.map(c => {
    const pins = allPins[c.id];
    return `
    <g>
      ${pins.map(p => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" class="pin"/>`).join("")}
      <rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" class="chip-body"/>
      <!-- Pin 1 indicator -->
      <circle cx="${c.x + 7}" cy="${c.y + 7}" r="2" fill="#c9a227"/>
      <!-- Silkscreen outline -->
      <rect x="${c.x - 2}" y="${c.y - 2}" width="${c.w + 4}" height="${c.h + 4}" fill="none" class="silkscreen-line"/>
      <text x="${c.x + c.w/2}" y="${c.y + c.h/2 - 2}" class="chip-text">${c.label}</text>
      <text x="${c.x + c.w/2}" y="${c.y + c.h/2 + 10}" class="chip-id">${c.id}</text>
    </g>`;
  }).join("")}

  <!-- ── Silkscreen labels along traces ── -->
  <text x="${W/2}" y="30" text-anchor="middle" class="silkscreen" style="font-size:10px;font-weight:bold">GITHUB_COMMIT_BUS_${YEAR}</text>
  <text x="40" y="22" class="label">REV.${String(total).padStart(4, "0")}</text>
  <text x="${W - 40}" y="22" text-anchor="end" class="label">@${GITHUB_USER}</text>

  <!-- Bottom silkscreen info -->
  <text x="40" y="${H - 12}" class="label">${total} commits · ${YEAR}</text>
  <text x="${W - 40}" y="${H - 12}" text-anchor="end" class="label" style="opacity:0.4">PCB v2.0 · Manhattan routing</text>

  <!-- ── Edge cut border ── -->
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#0a0a0a" stroke-width="2" rx="6"/>
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="#c9a227" stroke-width="0.4" opacity="0.3" rx="4"/>
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
