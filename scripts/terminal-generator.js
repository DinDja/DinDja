const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_USER = process.env.GITHUB_USER || "DinDja";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = process.argv[2] || "dist/terminal-interactive.svg";

function fetchAPI(url, token) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "terminal-gen", Authorization: token ? `Bearer ${token}` : "" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ total_count: 0 }); }
      });
    }).on("error", () => resolve({ total_count: 0 }));
  });
}

async function fetchStats(user, token) {
  const [commitsR, prsR] = await Promise.all([
    fetchAPI(`https://api.github.com/search/commits?q=author:${user}+committer-date:>${new Date().toISOString().slice(0, 10)}`, token),
    fetchAPI(`https://api.github.com/search/issues?q=author:${user}+type:pr+state:open`, token),
  ]);
  return { today: commitsR.total_count || 0, prs: prsR.total_count || 0, roadmapPct: 82 };
}

function generateTerminalSVG(stats) {
  const W = 900, H = 520;
  const green = "#00ff88";
  const promptColor = "#58A6FF";
  const outputColor = "#C9D1D9";
  const accent = "#C9A227";
  const bg = "#0D1117";
  const panelBg = "#161B22";

  const css = `
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    @keyframes type-line { 0%{clip-path:inset(0 100% 0 0)} 100%{clip-path:inset(0 0 0 0)} }
    @keyframes cursor-pulse { 0%,100%{opacity:0} 50%{opacity:1} }
    @keyframes progress-fill { 0%{transform:scaleX(0);transform-origin:left} 100%{transform:scaleX(1);transform-origin:left} }
    @keyframes fade-in { 0%{opacity:0;transform:translateY(4px)} 100%{opacity:1;transform:translateY(0)} }
    @keyframes data-flow { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
    @keyframes pulse-ok { 0%,100%{opacity:0.7} 50%{opacity:1} }
    .bg { fill: ${bg}; }
    .panel { fill: ${panelBg}; stroke: #30363D; stroke-width: 1; rx: 4; }
    .prompt { fill: ${promptColor}; font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold; }
    .output { fill: ${outputColor}; font-family: 'Courier New', monospace; font-size: 10px; }
    .green { fill: ${green}; font-family: 'Courier New', monospace; font-size: 10px; }
    .blink { animation: blink 0.8s step-end infinite; }
    .type-anim { animation: type-line 1.4s ease-out both; }
    .cursor { fill: ${green}; animation: cursor-pulse 1s ease-in-out infinite; }
    .progress-bg { fill: ${panelBg}; stroke: #30363D; stroke-width: 0.8; }
    .progress-fill { fill: ${green}; animation: progress-fill 1.8s ease-out both; opacity: 0.9; }
    .progress-empty { fill: #21262D; }
    .fade { animation: fade-in 0.6s ease-out both; }
    .chip { fill: #0A0A0A; stroke: #30363D; stroke-width: 1; rx: 3; }
    .chip-label { fill: #58A6FF; font-family: 'Courier New', monospace; font-size: 6px; }
    .trace { stroke: ${accent}; stroke-width: 1; fill: none; stroke-dasharray: 6 10; animation: data-flow 2s linear infinite; }
    .trace-solid { stroke: ${accent}; stroke-width: 1.3; fill: none; }
    .via { fill: ${panelBg}; stroke: ${accent}; stroke-width: 1.2; }
    .bar-fill { fill: ${green}; animation: progress-fill 1.2s ease-out both; }
    .bar-bg { fill: #21262D; }
    .check { fill: ${green}; animation: pulse-ok 2s ease-in-out infinite; }
    .pending { fill: #D29922; animation: pulse-ok 1.4s ease-in-out infinite; }
    .title-silk { fill: ${accent}; font-family: 'Courier New', monospace; font-size: 9px; opacity: 0.7; }
  `;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs><style>${css}</style></defs>
  <rect width="${W}" height="${H}" class="bg"/>
  <rect width="${W}" height="${H}" class="panel"/>`;

  // PCB-style borders
  svg += `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" class="trace" rx="4" style="animation-delay:0s"/>`;
  svg += `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" class="trace-solid" rx="2"/>`;

  let y = 22;
  const linePad = 16;

  // title bar
  svg += `<rect x="14" y="${y}" width="${W - 28}" height="22" fill="#0A0A0A" rx="3" stroke="#C9A227" stroke-width="0.8"/>
  <text x="${W / 2}" y="${y + 15}" text-anchor="middle" class="output" style="fill:#ffd700;font-size:11px">root@workspace:~$ ./whoami.sh</text>`;
  y += 32;

  // Prompt 1 — type animation
  svg += `<text x="30" y="${y}" class="prompt">></text>
  <text x="45" y="${y}" class="green type-anim">whoami</text>`;
  y += linePad;
  svg += `<text x="45" y="${y}" class="output fade" style="animation-delay:0.8s">Bruno Andrade</text>`;
  y += linePad;
  svg += `<text x="45" y="${y}" class="output fade" style="animation-delay:1.2s;opacity:0.6" font-size="9px">Fullstack Developer · 3D Web · Enterprise Systems</text>`;
  y += 24;

  // Prompt 2 — skills
  svg += `<text x="30" y="${y}" class="prompt">></text>
  <text x="45" y="${y}" class="green">skills</text>`;
  y += linePad;

  const skills = ["React", "Next.js", "Node.js", "TypeScript", "Firebase", "Clean Architecture", "Three.js", "Electron", "NVIDIA NIM", "PostgreSQL", "Tailwind", "shadcn/ui"];
  skills.forEach((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const sx = 40 + col * 170;
    const sy = y + 4 + row * 15;
    svg += `<rect x="${sx}" y="${sy}" width="150" height="11" rx="2" class="chip"/>
    <text x="${sx + 6}" y="${sy + 8}" class="chip-label" style="font-size:6px">${s}</text>`;
  });
  y += 4 + Math.ceil(skills.length / 3) * 15 + 8;

  // Prompt 3 — projects
  svg += `<text x="30" y="${y}" class="prompt">></text>
  <text x="45" y="${y}" class="green">projects</text>`;
  y += linePad;

  const projects = [
    ["Editor-ThreeJS", "Editor 3D + IA · 1.5k func", true],
    ["SECTI-contratos", "Gestão contratual · 456 func", true],
    ["TSARA", "E-commerce · 656 func", true],
    ["INFO.SECTI", "Gestão de projetos · 501 func", true],
    ["PatentesLab", "Robô de patentes · 528 func", true],
    ["Sectinvent-rio", "Inventário · 369 func", true],
  ];
  projects.forEach(([name, desc, ok], i) => {
    const cY = y + i * 18;
    svg += `<text x="45" y="${cY}" class="output fade" style="animation-delay:${0.3 + i * 0.2}s;font-size:9px">${ok ? "✅" : "⏳"} ${name}</text>
    <text x="${45 + name.length * 8}" y="${cY}" class="output fade" style="animation-delay:${0.5 + i * 0.2}s;opacity:0.5;font-size:8px"> — ${desc}</text>`;
  });
  y += projects.length * 18 + 6;

  // Prompt 4 — roadmap with progress bar (PCB-style)
  svg += `<text x="30" y="${y}" class="prompt">></text>
  <text x="45" y="${y}" class="green">roadmap</text>`;
  y += linePad;

  const pct = stats.roadmapPct;
  const barW = 240, barH = 12;
  const fullW = barW * pct / 100;
  svg += `<rect x="40" y="${y - 2}" width="${barW + 4}" height="${barH + 4}" fill="#0A0A0A" rx="3" stroke="#C9A227" stroke-width="0.6"/>`;
  svg += `<rect x="42" y="${y}" width="${barW}" height="${barH}" class="progress-empty" rx="2"/>`;
  svg += `<rect x="42" y="${y}" width="${fullW}" height="${barH}" class="progress-fill" rx="2" style="animation-delay:0.4s"/>`;
  svg += `<text x="${42 + barW + 10}" y="${y + 9}" class="green fade" style="animation-delay:1.2s">${pct}%</text>`;
  y += barH + 10;

  const milestones = [
    ["Full Stack", true],
    ["Desktop (Electron)", true],
    ["3D Web", true],
    ["IA Integration", false],
    ["Rust/WASM", false],
  ];
  milestones.forEach(([label, done]) => {
    svg += `<rect x="45" y="${y + 1}" width="110" height="13" rx="2" class="chip"/>
    <text x="51" y="${y + 10}" class="chip-label" style="font-size:7px">${done ? "✅" : "⏳"} ${label}</text>`;
    y += 18;
  });

  y += 6;

  // Prompt 5 — stats
  svg += `<text x="30" y="${y}" class="prompt">></text>
  <text x="45" y="${y}" class="green">stats --verbose</text>`;
  y += linePad;

  svg += `<text x="45" y="${y}" class="output fade" style="animation-delay:0.6s;font-size:9px">
    Commits hoje: <tspan class="green">${stats.today}</tspan> │
    PRs abertos: <tspan class="green">${stats.prs}</tspan> │
    Builds falhando: <tspan class="green">0</tspan>
  </text>`;

  y += 22;

  // Blinking cursor at end
  svg += `<rect x="40" y="${y - 11}" width="8" height="12" class="cursor"/>`;

  // Bottom PCB traces + chip
  const bottom = H - 30;
  svg += `<rect x="${W / 2 - 45}" y="${bottom + 4}" width="90" height="16" rx="3" class="chip"/>
  <text x="${W / 2}" y="${bottom + 14}" text-anchor="middle" class="chip-label" style="font-size:7px">TERMINAL-GEN v1.0</text>`;
  svg += `<text x="${W / 2}" y="${bottom + 22}" text-anchor="middle" class="title-silk">@${GITHUB_USER}</text>`;

  return `${svg}</svg>`;
}

async function main() {
  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const stats = await fetchStats(GITHUB_USER, TOKEN);
  const svg = generateTerminalSVG(stats);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated: ${outPath}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });