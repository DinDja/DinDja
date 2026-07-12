const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_USER = process.env.GITHUB_USER || "DinDja";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = process.argv[2] || "dist/city-skyline.svg";

const REPOS = ["Editor-ThreeJS", "SECTI-contratos", "TSARA", "hubSECTI", "PatentesLab", "Sectinvent-rio"];
const BUILD = { "Editor-ThreeJS": 184, "SECTI-contratos": 85, "TSARA": 152, "hubSECTI": 82, "PatentesLab": 70, "Sectinvent-rio": 58 };
const STACKS = {
  "Editor-ThreeJS": ["R3F", "THREE", "ELEC", "NIM"],
  "SECTI-contratos": ["RT", "FB", "SHCN"],
  TSARA: ["NX", "FB", "SHCN", "PAY"],
  hubSECTI: ["RT", "FB", "NTFY"],
  PatentesLab: ["NX", "FB", "NTFY", "INPI"],
  "Sectinvent-rio": ["NX", "FB", "SHCN"],
};
const STARS_DATA = [
  null, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null,
];

function fetchGraphQL(query, variables, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request(
      { hostname: "api.github.com", path: "/graphql", method: "POST",
        headers: { "User-Agent": "city-generator", "Content-Type": "application/json",
                   Authorization: token ? `Bearer ${token}` : "" } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { const j = JSON.parse(data); if (j.errors) reject(new Error(j.errors[0].message)); else resolve(j); }
          catch { reject(new Error(data.slice(0, 200))); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function fetchCommitCounts(user, token) {
  const promises = REPOS.map((repo) =>
    fetchGraphQL(
      `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { defaultBranchRef { target { ... on Commit { history { totalCount } } } } } }`,
      { owner: user, name: repo },
      token
    ).then((r) => ({ repo, commits: r.data.repository.defaultBranchRef.target.history.totalCount }))
     .catch(() => ({ repo, commits: 0 }))
  );
  return await Promise.all(promises);
}

async function fetchCIStatus(user, token) {
  const promises = REPOS.map((repo) =>
    fetch(
      `https://api.github.com/repos/${user}/${repo}/commits/main/status`,
      { headers: { Authorization: token ? `Bearer ${token}` : "", "User-Agent": "city-generator" } }
    ).then(r => r.json()).then(d => ({ repo, state: d.state || "unknown" }))
     .catch(() => ({ repo, state: "unknown" }))
  );
  return await Promise.all(promises);
}

function generateCitySkylineSVG(repoData, ciData) {
  const W = 1200, H = 560;
  const maxCommits = Math.max(1, ...repoData.map((r) => r.commits));
  const totalCommits = repoData.reduce((a, r) => a + (r.commits || 0), 0);

  const floorH = 11;
  const startX = 100;
  const endX = W - 100;
  const availableWidth = endX - startX;
  const gap = 22;
  const totalGaps = gap * (REPOS.length - 1);
  const buildArea = availableWidth - totalGaps;
  const buildW = Math.floor(buildArea / REPOS.length);
  const spacing = buildW + gap;

  let buildingIdx = 0;
  const buildings = [];

  for (const rd of repoData) {
    const commits = rd.commits || BUILD[rd.repo] || 50;
    const pct = Math.min(1, commits / maxCommits);
    const floors = Math.max(4, Math.round(pct * 22));
    const h = floors * floorH + 20;
    const w = Math.max(60, buildW - 4 + Math.round(pct * 10));
    const left = startX + spacing * buildingIdx + Math.round((buildW - w) / 2);
    const bottomY = 370;
    const roofY = bottomY - h;
    const ciState = ciData.find((c) => c.repo === rd.repo)?.state || "unknown";
    const isTop = rd.repo === repoData[0].repo;

    let style = "modern";
    if (buildingIdx === 1) style = "spire";
    else if (buildingIdx === 2) style = "stepped";
    else if (buildingIdx === 3) style = "dome";
    else if (buildingIdx === 4) style = "tower";
    else if (buildingIdx === 5) style = "tilted";

    const colorScheme = [
      { body: "#1a2332", stroke: "#2a3a55", roof: "#2a3a55", accent: "#3a5a8a" },
      { body: "#1e2a3a", stroke: "#2e4058", roof: "#4a6a9a", accent: "#5a8aba" },
      { body: "#16202e", stroke: "#263850", roof: "#3a5a7a", accent: "#6a9aba" },
      { body: "#1c2838", stroke: "#2c3e56", roof: "#2a4a6a", accent: "#4a7aaa" },
      { body: "#182434", stroke: "#283c54", roof: "#3a6a8a", accent: "#5a8aaa" },
      { body: "#1a2836", stroke: "#2a3e58", roof: "#4a7a9a", accent: "#6a9aba" },
    ];

    buildings.push({
      repo: rd.repo,
      commits,
      pct,
      left,
      top: roofY,
      w,
      h,
      bottomY,
      ciState,
      floors,
      isTop,
      style,
      cs: colorScheme[buildingIdx],
      stack: STACKS[rd.repo] || [],
      idx: buildingIdx,
    });
    buildingIdx++;
  }

  const seed = 7777;
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };

  const css = `
    @keyframes twinkle { 0%,100%{opacity:0.2;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
    @keyframes twinkle-slow { 0%,100%{opacity:0.15} 50%{opacity:0.7} }
    @keyframes shooting-star { 0%{opacity:0;transform:translate(0,0)} 5%{opacity:1} 15%{opacity:1} 20%{opacity:0;transform:translate(160px,80px)} }
    @keyframes cloud-drift { 0%{transform:translateX(-100px)} 100%{transform:translateX(100px)} }
    @keyframes cloud-drift-reverse { 0%{transform:translateX(80px)} 100%{transform:translateX(-80px)} }
    @keyframes window-pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
    @keyframes window-bug { 0%,100%{opacity:0.4;fill:#da3633} 25%{fill:#ff6b6b} 50%{opacity:1;fill:#ff0000} 75%{fill:#ff4444} }
    @keyframes smoke-rise { 0%{opacity:0;transform:translateY(0) scale(0.8)} 30%{opacity:0.5} 100%{opacity:0;transform:translateY(-30px) scale(1.6)} }
    @keyframes firework-burst { 0%{opacity:1;transform:scale(0.3)} 50%{opacity:0.8;transform:scale(2)} 100%{opacity:0;transform:scale(0.5)} }
    @keyframes firework-trail { 0%{opacity:1;r:4} 100%{opacity:0;r:0.5;transform:translateY(-60px)} }
    @keyframes glow-pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
    @keyframes river-shimmer { 0%,100%{opacity:0.1} 50%{opacity:0.25} }
    @keyframes crane-swing { 0%,100%{transform:rotate(-5deg)} 50%{transform:rotate(5deg)} }
    @keyframes moon-glow { 0%,100%{opacity:0.7;r:38} 50%{opacity:1;r:42} }
    @keyframes car-move { 0%{transform:translateX(-50px)} 100%{transform:translateX(1300px)} }
    @keyframes car-move2 { 0%{transform:translateX(1300px)} 100%{transform:translateX(-50px)} }
    .star { fill:#ffffff; animation:twinkle var(--d) ease-in-out infinite; animation-delay:var(--del); }
    .star-slow { animation:twinkle-slow var(--d) ease-in-out infinite; animation-delay:var(--del); }
    .cloud { opacity:0.35; animation:cloud-drift var(--d) ease-in-out infinite alternate; animation-delay:var(--del); }
    .cloud-rev { opacity:0.25; animation:cloud-drift-reverse var(--d) ease-in-out infinite alternate; animation-delay:var(--del); }
    .building-group { cursor:pointer; }
    .building-group:hover .building-body { filter:brightness(1.3); }
    .building-group:hover .building-label-text { opacity:1; }
    .building-group:hover .window-off { fill:#2a4a7a; }
    .window-lit { fill:#ffd700; animation:window-pulse var(--d) ease-in-out infinite; animation-delay:var(--del); }
    .window-dim { fill:#1a2a3a; }
    .window-bug-anim { animation:window-bug 0.8s ease-in-out infinite; }
    .smoke { fill:#8B949E; animation:smoke-rise 2.5s ease-out infinite; animation-delay:var(--del); }
    .firework-dot { animation:firework-burst 1.8s ease-out infinite; animation-delay:var(--del); }
    .firework-trail { animation:firework-trail 1.2s ease-out infinite; animation-delay:var(--del); }
    .shooting-star { animation:shooting-star 1.2s linear infinite; animation-delay:var(--del); }
    .river-glow { animation:river-shimmer 4s ease-in-out infinite; }
    .crane { animation:crane-swing 3s ease-in-out infinite alternate; transform-origin:var(--ox) var(--oy); }
    .car { animation:car-move 12s linear infinite; }
    .car-rev { animation:car-move2 15s linear infinite; }
    .moon-core { animation:moon-glow 4s ease-in-out infinite alternate; }
    .glow-ring { animation:glow-pulse 3s ease-in-out infinite; }
    .ant-glow { stroke:#58a6ff; stroke-width:1.5; animation:glow-pulse 2s ease-in-out infinite; }
    .building-label-text { opacity:0; transition:opacity 0.3s ease; }
  `;

  function b(tag, attrs, content) {
    const attrStr = Object.entries(attrs)
      .map(([k, v]) => `${k}="${v}"`).join(" ");
    if (content === undefined || content === null) return `<${tag} ${attrStr}/>`;
    return `<${tag} ${attrStr}>${content}</${tag}>`;
  }

  function e(tag, content) {
    return `<${tag}>${content}</${tag}>`;
  }

  function rect(attrs) { return b("rect", attrs); }
  function circle(attrs) { return b("circle", attrs); }
  function line(attrs) { return b("line", attrs); }
  function path(attrs) { return b("path", attrs); }
  function text(attrs, content) { return b("text", attrs, content); }
  function g(attrs, content) { return b("g", attrs, content); }
  function poly(attrs, content) { return b("polygon", attrs, content); }
  function ell(attrs) { return b("ellipse", attrs); }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs>
    <style>${css}</style>
    <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050a14"/>
      <stop offset="40%" stop-color="#0a1628"/>
      <stop offset="70%" stop-color="#0f1f3a"/>
      <stop offset="100%" stop-color="#141e30"/>
    </linearGradient>
    <linearGradient id="water-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1628"/>
      <stop offset="100%" stop-color="#050d1a"/>
    </linearGradient>
    <linearGradient id="ground-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#0f0f1a"/>
    </linearGradient>
    <linearGradient id="road-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a2a3e"/>
      <stop offset="100%" stop-color="#1a1a2e"/>
    </linearGradient>
    <radialGradient id="moon-grad" cx="40%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#f0edd4"/>
      <stop offset="50%" stop-color="#e8dcc8"/>
      <stop offset="100%" stop-color="#c4b89a"/>
    </radialGradient>
    <radialGradient id="moon-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f0edd4" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#f0edd4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="build-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="var(--c1)" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="var(--c2)" stop-opacity="0.7"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft-glow">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>`;

  // Sky
  svg += rect({ width: W, height: H, fill: "url(#sky-grad)" });

  // Moon
  svg += circle({ cx: 900, cy: 80, r: 60, fill: "url(#moon-glow)", class: "moon-core" });
  svg += circle({ cx: 900, cy: 80, r: 32, fill: "url(#moon-grad)", opacity: "0.95" });
  const craters = [
    [895, 72, 5, 0.15], [908, 78, 3, 0.12], [888, 85, 4, 0.1],
    [902, 90, 3.5, 0.12], [893, 65, 2.5, 0.08], [910, 70, 2, 0.1],
    [885, 77, 2, 0.08], [906, 88, 2.5, 0.1],
  ];
  for (const [cx, cy, r, o] of craters) {
    svg += circle({ cx, cy, r, fill: "#b8a88a", opacity: o });
  }

  // Stars
  for (let i = 0; i < 140; i++) {
    const cx = 10 + rand() * (W - 20);
    const cy = 5 + rand() * 180;
    const r = 0.3 + rand() * 1.8;
    const d = 1.5 + rand() * 4;
    const del = rand() * 5;
    const cls = r > 1.2 ? "star" : "star-slow";
    svg += circle({ cx, cy, r, class: cls, style: `--d:${d}s;--del:${del}s` });
  }

  // Shooting stars
  for (let i = 0; i < 3; i++) {
    const sx = 200 + rand() * 400;
    const sy = 20 + rand() * 60;
    svg += line({
      x1: sx, y1: sy, x2: sx + 160, y2: sy + 80,
      stroke: "url(#moon-grad)", "stroke-width": "1.5", opacity: "0.6",
      class: "shooting-star", style: `--del:${8 + i * 6}s`,
    });
  }

  // Clouds
  svg += g({ class: "cloud", style: "--d:25s;--del:0s" },
    ell({ cx: 150, cy: 50, rx: 80, ry: 20, fill: "#1a2a3a" }) +
    ell({ cx: 200, cy: 45, rx: 50, ry: 15, fill: "#1a2a3a" })
  );
  svg += g({ class: "cloud-rev", style: "--d:35s;--del:5s" },
    ell({ cx: 700, cy: 65, rx: 100, ry: 18, fill: "#1a2a44" }) +
    ell({ cx: 760, cy: 60, rx: 60, ry: 14, fill: "#1a2a44" })
  );
  svg += g({ class: "cloud", style: "--d:30s;--del:10s" },
    ell({ cx: 1050, cy: 35, rx: 70, ry: 16, fill: "#16263a" }) +
    ell({ cx: 1100, cy: 32, rx: 45, ry: 12, fill: "#16263a" })
  );

  // Background city silhouette (far bg)
  for (let i = 0; i < 12; i++) {
    const bx = i * 110 + rand() * 40;
    const bh = 60 + rand() * 120;
    const bw = 40 + rand() * 60;
    const by = 370 - bh;
    const alpha = 0.15 + rand() * 0.1;
    svg += rect({ x: bx, y: by, width: bw, height: bh, fill: "#0a1525", opacity: alpha });
    if (rand() > 0.5) {
      svg += rect({ x: bx + 2, y: by - 8, width: bw - 4, height: 8, fill: "#0a1525", opacity: alpha + 0.05 });
    }
  }

  // Crane (construction site)
  svg += g({ class: "crane", style: "--ox:260px;--oy:350px" },
    line({ x1: 260, y1: 300, x2: 260, y2: 350, stroke: "#3a3a5a", "stroke-width": 3 }),
    line({ x1: 260, y1: 300, x2: 310, y2: 270, stroke: "#3a3a5a", "stroke-width": 2 }),
    line({ x1: 260, y1: 285, x2: 310, y2: 270, stroke: "#3a3a5a", "stroke-width": 1.5 }),
    line({ x1: 310, y1: 270, x2: 310, y2: 300, stroke: "#c9a227", "stroke-width": 1.5, class: "ant-glow" }),
  );

  // Ground / river
  svg += rect({ x: 0, y: 370, width: W, height: 30, fill: "url(#ground-grad)" });
  svg += rect({ x: 0, y: 400, width: W, height: 40, fill: "url(#water-grad)" });
  svg += rect({ x: 0, y: 440, width: W, height: 10, fill: "url(#ground-grad)" });

  // River shimmer
  for (let i = 0; i < 30; i++) {
    const rx = rand() * W;
    const ry = 405 + rand() * 30;
    const rw = 20 + rand() * 60;
    svg += ell({
      cx: rx, cy: ry, rx: rw, ry: 2,
      fill: "#58a6ff", opacity: "0.08", class: "river-glow",
      style: `--del:${rand() * 4}s`,
    });
  }

  // Road with markings
  svg += rect({ x: 0, y: 435, width: W, height: 6, fill: "url(#road-grad)" });
  for (let i = 0; i < 30; i++) {
    svg += rect({ x: i * 45 + 10, y: 437.5, width: 20, height: 1.5, fill: "#c9a227", opacity: "0.4" });
  }

  // Cars
  const carSvg = (x, y, color) => {
    return rect({ x, y: y + 3, width: 18, height: 6, rx: 2, fill: color }) +
      rect({ x: x + 3, y, width: 10, height: 5, rx: 1.5, fill: color, opacity: "0.8" }) +
      circle({ cx: x + 4, cy: y + 9, r: 2, fill: "#1a1a2e" }) +
      circle({ cx: x + 14, cy: y + 9, r: 2, fill: "#1a1a2e" });
  };
  svg += g({ class: "car" }, carSvg(0, 445, "#4a6a9a"));
  svg += g({ class: "car-rev" }, carSvg(0, 445, "#6a4a9a"));

  // Street lamps
  for (let i = 0; i < 7; i++) {
    const lx = 80 + i * 185;
    svg += line({ x1: lx, y1: 370, x2: lx, y2: 340, stroke: "#3a3a5a", "stroke-width": 2 });
    svg += path({
      d: `M${lx} 340 Q${lx + 8} 340 ${lx + 8} 345`,
      stroke: "#3a3a5a", "stroke-width": 1.5, fill: "none",
    });
    svg += circle({ cx: lx + 8, cy: 345, r: 3, fill: "#ffd700", opacity: "0.7", filter: "url(#glow)" });
    svg += circle({ cx: lx + 8, cy: 345, r: 8, fill: "#ffd700", opacity: "0.1" });
  }

  // Trees
  for (let i = 0; i < 8; i++) {
    const tx = 50 + i * 155 + rand() * 30;
    svg += rect({ x: tx - 1.5, y: 358, width: 3, height: 12, fill: "#2a3a2a" });
    svg += circle({ cx: tx, cy: 352, r: 8 + rand() * 4, fill: "#0a3a0a", opacity: "0.6" });
    svg += circle({ cx: tx, cy: 350, r: 6 + rand() * 3, fill: "#0a4a0a", opacity: "0.5" });
  }

  // Buildings
  for (const bd of buildings) {
    const { left, top, w, h, bottomY, ciState, floors, isTop, style, cs, repo, commits, stack, idx } = bd;
    const roofY = top;
    const bodyColor = cs.body;

    let buildingGroup = `<g class="building-group">`;

    // Title tooltip
    buildingGroup += `<title>${repo}
Commits: ${commits}
CI: ${ciState === "success" ? "Passing" : ciState === "failure" ? "Failing" : ciState === "pending" ? "Pending" : "Unknown"}
Stack: ${stack.join(", ")}</title>`;

    // Building shadow
    buildingGroup += rect({
      x: left + 6, y: roofY + 6, width: w, height: h - 6,
      fill: "#000", opacity: "0.25",
    });

    // Building body
    buildingGroup += rect({
      x: left, y: roofY + (style === "stepped" ? 20 : 8),
      width: w, height: h - (style === "stepped" ? 28 : 16),
      rx: "2",
      fill: bodyColor, stroke: cs.stroke, "stroke-width": "1.2",
    });

    // LED strip on top
    buildingGroup += rect({
      x: left, y: roofY + (style === "stepped" ? 18 : 6),
      width: w, height: 2,
      fill: ciState === "success" ? "#00ff88" : ciState === "failure" ? "#ff3333" : "#ffd700",
      opacity: "0.5",
    });

    // Skyline accent ridge
    buildingGroup += rect({
      x: left + 4, y: roofY + (style === "stepped" ? 20 : 8) + h - 18,
      width: w - 8, height: 1,
      fill: cs.accent, opacity: "0.3",
    });

    // Roof style
    if (style === "spire") {
      buildingGroup += poly({
        points: `${left - 4},${roofY + 8} ${left + w / 2},${roofY - 25} ${left + w + 4},${roofY + 8}`,
        fill: cs.roof, stroke: cs.stroke, "stroke-width": "1",
      });
      buildingGroup += line({
        x1: left + w / 2, y1: roofY - 25, x2: left + w / 2, y2: roofY - 40,
        stroke: "#58a6ff", "stroke-width": "1.5", class: "ant-glow",
      });
    } else if (style === "dome") {
      buildingGroup += path({
        d: `M${left - 2} ${roofY + 8} Q${left + w / 2} ${roofY - 25} ${left + w + 2} ${roofY + 8}Z`,
        fill: cs.roof, stroke: cs.stroke, "stroke-width": "1",
      });
      buildingGroup += circle({ cx: left + w / 2, cy: roofY - 12, r: 3, fill: "#ffd700", opacity: "0.6" });
      buildingGroup += line({
        x1: left + w / 2, y1: roofY - 12, x2: left + w / 2, y2: roofY - 22,
        stroke: "#58a6ff", "stroke-width": "1", class: "ant-glow",
      });
    } else if (style === "stepped") {
      const stepW = w * 0.7;
      buildingGroup += rect({
        x: left + (w - stepW) / 2, y: roofY,
        width: stepW, height: 22,
        fill: cs.roof, stroke: cs.stroke, "stroke-width": "1", rx: "1",
      });
      buildingGroup += rect({
        x: left + (w - stepW * 0.6) / 2, y: roofY - 6,
        width: stepW * 0.6, height: 8,
        fill: cs.accent, stroke: cs.stroke, "stroke-width": "0.8", rx: "1",
      });
    } else if (style === "tilted") {
      buildingGroup += poly({
        points: `${left - 3},${roofY + 8} ${left + w / 2 - 5},${roofY - 18} ${left + w / 2 + 5},${roofY - 18} ${left + w + 3},${roofY + 8}`,
        fill: cs.roof, stroke: cs.stroke, "stroke-width": "1",
      });
      buildingGroup += rect({
        x: left + w / 2 - 4, y: roofY - 30, width: 8, height: 14,
        fill: cs.accent, stroke: cs.stroke, "stroke-width": "0.8",
      });
      buildingGroup += line({
        x1: left + w / 2, y1: roofY - 30, x2: left + w / 2, y2: roofY - 42,
        stroke: "#58a6ff", "stroke-width": "1.2", class: "ant-glow",
      });
    } else if (style === "tower") {
      buildingGroup += rect({
        x: left + w / 2 - 12, y: roofY - 10,
        width: 24, height: 18,
        fill: cs.roof, stroke: cs.stroke, "stroke-width": "1",
      });
      buildingGroup += rect({
        x: left + w / 2 - 3, y: roofY - 20,
        width: 6, height: 12,
        fill: cs.accent, stroke: cs.stroke, "stroke-width": "0.8",
      });
      buildingGroup += circle({
        cx: left + w / 2, cy: roofY - 22,
        r: 4, fill: "#ff4444", opacity: "0.7", filter: "url(#glow)",
      });
    } else {
      // modern flat
      buildingGroup += poly({
        points: `${left - 2},${roofY + 8} ${left + w / 2},${roofY - 4} ${left + w + 2},${roofY + 8}`,
        fill: cs.roof, stroke: cs.stroke, "stroke-width": "1",
      });
      buildingGroup += line({
        x1: left + w / 2, y1: roofY - 4, x2: left + w / 2, y2: roofY - 14,
        stroke: "#58a6ff", "stroke-width": "1", class: "ant-glow",
      });
    }

    // Windows
    const wCols = Math.max(3, Math.floor((w - 16) / 14));
    const wRows = Math.max(2, Math.floor((h - 30) / floorH));
    const wPadX = Math.round((w - 16 - wCols * 10) / 2) + 8;
    const wPadY = 18;
    const wSpacingX = 10;
    const wSpacingY = floorH;

    const wOff = (f, c) => {
      return (f * 7 + c * 13 + idx * 5) % 4 === 0;
    };
    const wBug = (f, c) => {
      return ciState === "failure" && (f + c) % 5 === 0;
    };
    const wOn = (f, c) => {
      if (ciState === "success" && (f + c) % 5 !== 0 && (f + c) % 11 === 0) return true;
      if (ciState === "success" && (f + c) % 3 === 0) return true;
      return wOff(f, c) && rand() > 0.5;
    };

    for (let f = 0; f < wRows; f++) {
      for (let c = 0; c < wCols; c++) {
        const wx = left + wPadX + c * wSpacingX;
        const wy = roofY + wPadY + f * wSpacingY;
        const isLit = wOn(f, c);
        const isBugg = !isLit && wBug(f, c);
        const cls = isBugg ? "window-bug-anim" :
          isLit ? `window-lit` : "window-dim";

        let size = isLit ? 3 : 2.5;
        buildingGroup += rect({
          x: wx, y: wy, width: size, height: size,
          fill: isLit ? "#ffd700" : isBugg ? "#da3633" : "#1a2a3a",
          class: cls,
          style: isLit ? `--d:${2 + rand() * 3}s;--del:${(f + c) * 0.08 + idx * 0.2}s` : "",
        });

        if (isLit) {
          buildingGroup += rect({
            x: wx - 2, y: wy - 2, width: size + 4, height: size + 4,
            fill: "#ffd700", opacity: "0.06",
          });
        }
      }
    }

    // Smoke for failing CI
    if (ciState === "failure") {
      for (let s = 0; s < 4; s++) {
        buildingGroup += circle({
          cx: left + w / 2 + (s - 1.5) * 12,
          cy: roofY - 5,
          r: 4 + s * 2,
          class: "smoke",
          fill: "#8B949E",
          opacity: "0.4",
          style: `--del:${s * 0.7}s`,
        });
      }
    }

    // Fireworks for top project
    if (isTop) {
      const colors = ["#ffd700", "#ff6b6b", "#58a6ff", "#00ff88", "#bf4b8a"];
      for (let f = 0; f < 7; f++) {
        const fx = left + w / 2 + (f - 3) * 28;
        const fy = roofY - 20;
        const color = colors[f % colors.length];
        buildingGroup += circle({
          cx: fx, cy: fy, r: 2,
          fill: color,
          class: "firework-dot",
          style: `--del:${f * 0.2}s`,
        });
        buildingGroup += line({
          x1: fx, y1: fy, x2: fx + (f - 3) * 15, y2: fy - 20 - f * 5,
          stroke: color,
          "stroke-width": "0.8",
          opacity: "0.5",
          class: "firework-trail",
          style: `--del:${f * 0.2}s`,
        });
      }
    }

    // Label (visible on hover via CSS, always visible with opacity)
    const shortName = repo.length > 18 ? repo.slice(0, 16) + ".." : repo;
    const nameX = left + w / 2;
    const nameY = bottomY + 16;
    buildingGroup += text({
      x: nameX, y: nameY,
      "text-anchor": "middle",
      fill: "#c9d1d9",
      "font-family": "'Courier New', monospace",
      "font-size": "8.5",
      class: "building-label-text",
    }, shortName);
    buildingGroup += text({
      x: nameX, y: nameY + 12,
      "text-anchor": "middle",
      fill: "#8B949E",
      "font-family": "'Courier New', monospace",
      "font-size": "7",
      class: "building-label-text",
    }, `${commits} commits`);

    // Stack badges
    const stackTags = STACKS[repo] || [];
    for (let si = 0; si < stackTags.length; si++) {
      const bx = nameX - (stackTags.length * 17) / 2 + si * 17;
      buildingGroup += rect({
        x: bx, y: nameY + 18,
        width: 15, height: 9,
        rx: "1.5",
        fill: "#0a0a0a",
        stroke: "#30363d",
        "stroke-width": "0.8",
        opacity: "0.7",
      });
      buildingGroup += text({
        x: bx + 7.5, y: nameY + 25,
        "text-anchor": "middle",
        fill: "#58a6ff",
        "font-family": "'Courier New', monospace",
        "font-size": "5",
        opacity: "0.8",
      }, stackTags[si]);
    }

    buildingGroup += `</g>`;
    svg += buildingGroup;
  }

  // Water reflections
  for (const bd of buildings) {
    const { left, w, h, bottomY, cs } = bd;
    const reflectY = bottomY + 2;
    const reflectH = Math.max(8, Math.round(h * 0.08));
    svg += rect({
      x: left + 4, y: reflectY,
      width: w - 8, height: reflectH,
      fill: cs.body, opacity: "0.12",
    });
  }

  // Constellation: stars from repos
  for (let i = 0; i < REPOS.length; i++) {
    for (let j = i + 1; j < REPOS.length; j++) {
      if (rand() > 0.4) continue;
      const bi = buildings[i];
      const bj = buildings[j];
      svg += line({
        x1: bi.left + bi.w / 2, y1: bi.top - 10,
        x2: bj.left + bj.w / 2, y2: bj.top - 10,
        stroke: "#ffd700", "stroke-width": "0.3", opacity: "0.15",
        "stroke-dasharray": "2 4",
      });
    }
  }

  // PCB-style bottom bar
  svg += rect({ x: W / 2 - 90, y: H - 30, width: 180, height: 20, rx: "4", fill: "#0a0a0a", stroke: "#c9a227", "stroke-width": "0.8" });
  svg += text({
    x: W / 2, y: H - 17,
    "text-anchor": "middle",
    fill: "#58a6ff",
    "font-family": "'Courier New', monospace",
    "font-size": "7",
  }, "CITY-GEN v2.0");
  svg += text({
    x: W / 2, y: H - 8,
    "text-anchor": "middle",
    fill: "#c9a227",
    "font-family": "'Courier New', monospace",
    "font-size": "5",
    opacity: "0.5",
  }, `@${GITHUB_USER} · ${totalCommits} commits`);

  // Edge border glow
  svg += rect({ x: 2, y: 2, width: W - 4, height: H - 4, fill: "none", stroke: "#c9a227", "stroke-width": "0.5", opacity: "0.15", rx: "6" });

  svg += `</svg>`;
  return svg;
}

async function main() {
  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const [repoData, ciData] = await Promise.all([
    fetchCommitCounts(GITHUB_USER, TOKEN),
    fetchCIStatus(GITHUB_USER, TOKEN),
  ]);
  const svg = generateCitySkylineSVG(repoData, ciData);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated: ${outPath}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
