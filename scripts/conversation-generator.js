const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_USER = process.env.GITHUB_USER || "DinDja";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = process.argv[2] || "dist/ai-conversation.svg";

function fetchAPI(url, token) {
  return new Promise((resolve) => {
    https.get(url, { headers: { "User-Agent": "conversation-gen", Authorization: token ? `Bearer ${token}` : "" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({ total_count: 0 }); } });
    }).on("error", () => resolve({ total_count: 0 }));
  });
}

async function fetchData(user, token) {
  const today = new Date().toISOString().slice(0, 10);
  const [prsR, bugsR, issuesR] = await Promise.all([
    fetchAPI(`https://api.github.com/search/issues?q=author:${user}+type:pr+state:open`, token),
    fetchAPI(`https://api.github.com/search/issues?q=author:${user}+label:bug+state:open`, token),
    fetchAPI(`https://api.github.com/search/issues?q=author:${user}+state:open`, token),
  ]);
  return { prs: prsR.total_count || 3, bugs: bugsR.total_count || 1, issues: issuesR.total_count || 5 };
}

async function fetchCIStatus(user, token) {
  const REPOS = ["Editor-ThreeJS", "SECTI-contratos", "TSARA", "hubSECTI", "PatentesLab", "Sectinvent-rio"];
  const results = await Promise.all(
    REPOS.map((repo) =>
      fetchAPI(`https://api.github.com/repos/${user}/${repo}/commits/main/status`, token)
        .then((d) => ({ repo, state: d.state || "unknown" }))
        .catch(() => ({ repo, state: "unknown" }))
    )
  );
  return results;
}

function generateConversationSVG(data, ci) {
  const W = 920, H = 580;
  const bg = "#0D1117";
  const panelBg = "#161B22";
  const accent = "#C9A227";
  const green = "#00ff88";
  const blue = "#58A6FF";
  const yellow = "#D29922";
  const red = "#DA3633";
  const gray = "#8B949E";

  const css = `
    @keyframes type-block { 0%{clip-path:inset(0 100% 0 0)} 100%{clip-path:inset(0 0 0 0)} }
    @keyframes fade-up { 0%{opacity:0;transform:translateY(8px)} 100%{opacity:1;transform:translateY(0)} }
    @keyframes pulse-status { 0%,100%{opacity:0.7} 50%{opacity:1} }
    @keyframes data-flow { 0%{stroke-dashoffset:20} 100%{stroke-dashoffset:0} }
    @keyframes blink-cursor { 0%,100%{opacity:0} 50%{opacity:1} }
    @keyframes typing { 0%{width:0} 60%{width:100%} }
    .bg { fill: ${bg}; }
    .panel { fill: ${panelBg}; stroke: #30363D; stroke-width: 1; rx: 4; }
    .bubble-system { fill: #0A1A1A; stroke: ${green}; stroke-width: 1; rx: 6; }
    .bubble-workspace { fill: #0A0A1A; stroke: ${blue}; stroke-width: 1; rx: 6; }
    .bubble-tasks { fill: #1A0A0A; stroke: ${yellow}; stroke-width: 1; rx: 6; }
    .bubble-mission { fill: #0A0A0A; stroke: ${accent}; stroke-width: 1.5; rx: 6; }
    .text-system { fill: ${green}; font-family: 'Courier New', monospace; }
    .text-workspace { fill: ${blue}; font-family: 'Courier New', monospace; }
    .text-tasks { fill: ${yellow}; font-family: 'Courier New', monospace; }
    .text-mission { fill: ${accent}; font-family: 'Courier New', monospace; }
    .text-neutral { fill: #C9D1D9; font-family: 'Courier New', monospace; }
    .text-dim { fill: ${gray}; font-family: 'Courier New', monospace; opacity: 0.7; }
    .fade { animation: fade-up 0.6s ease-out both; }
    .type-block { animation: type-block 1.2s ease-out both; }
    .pulse { animation: pulse-status 2s ease-in-out infinite; }
    .trace-anim { stroke: ${accent}; stroke-width: 1; fill: none; stroke-dasharray: 4 8; animation: data-flow 1.6s linear infinite; }
    .trace-solid { stroke: ${accent}; stroke-width: 1.2; fill: none; }
    .cursor-write { fill: ${green}; animation: blink-cursor 0.7s step-end infinite; }
    .chip { fill: #0A0A0A; stroke: #30363D; stroke-width: 1; rx: 3; }
    .chip-pin { fill: ${accent}; }
    .status-ok { fill: ${green}; animation: pulse-status 3s ease-in-out infinite; }
    .status-warn { fill: ${yellow}; animation: pulse-status 1.5s ease-in-out infinite; }
    .status-fail { fill: ${red}; animation: pulse-status 0.8s ease-in-out infinite; }
    .via { fill: ${panelBg}; stroke: ${accent}; stroke-width: 1; }
  `;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs><style>${css}</style>
  <radialGradient id="glow-system" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#00ff88" stop-opacity="0.15"/><stop offset="100%" stop-color="#0D1117" stop-opacity="0"/></radialGradient>
  <radialGradient id="glow-mission" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#C9A227" stop-opacity="0.12"/><stop offset="100%" stop-color="#0D1117" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" class="bg"/>
  <rect width="${W}" height="${H}" class="panel"/>`;

  // PCB border + traces
  svg += `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" class="trace-anim" rx="5" style="animation-delay:0s"/>`;
  svg += `<rect x="7" y="7" width="${W - 14}" height="${H - 14}" fill="none" class="trace-solid" rx="4"/>`;

  let y = 24;

  // Header chip
  svg += `<rect x="${W / 2 - 80}" y="${y}" width="160" height="20" rx="3" fill="#0A0A0A" stroke="${accent}" stroke-width="1"/>
  <text x="${W / 2}" y="${y + 13}" text-anchor="middle" class="text-mission" font-size="9">SYSTEM LOG — Auto-análise do Workspace</text>`;
  y += 34;

  // === SYSTEM bubble ===
  svg += `<circle cx="${W / 2}" cy="${y + 8}" r="40" fill="url(#glow-system)"/>`;
  svg += `<rect x="82" y="${y}" width="760" height="52" class="bubble-system"/>
  <text x="100" y="${y + 18}" class="text-system" font-size="10px" font-weight="bold">SYSTEM</text>
  <text x="100" y="${y + 36}" class="text-dim" font-size="9px">Bom dia. Vamos analisar o workspace.</text>`;

  // Cursor blinking inside SYSTEM bubble
  svg += `<rect x="${100 + 228}" y="${y + 27}" width="6" height="9" class="cursor-write"/>`;

  y += 68;

  // Traces from system to workspace
  svg += `<path d="M${W / 2} ${y - 10} L${W / 2} ${y - 2}" class="trace-solid"/>`;
  svg += `<circle cx="${W / 2}" cy="${y - 10}" r="3" class="via"/>`;

  // === WORKSPACE: Projetos ativos ===
  svg += `<rect x="82" y="${y}" width="760" height="${10 + ci.length * 20 + 18}" class="bubble-workspace"/>
  <text x="100" y="${y + 16}" class="text-workspace" font-size="10px" font-weight="bold">WORKSPACE — Projetos ativos</text>`;
  let rowY = y + 28;
  ci.forEach((repo, i) => {
    const state = repo.state;
    const icon = state === "success" ? "🟢" : state === "failure" ? "🔴" : state === "pending" ? "🟡" : "⚪";
    const label = state === "success" ? "Build OK" : state === "failure" ? "Build FAIL" : state === "pending" ? "Pending" : "Unknown";
    svg += `<text x="110" y="${rowY + i * 20}" class="text-neutral fade" font-size="9px" style="animation-delay:${0.3 + i * 0.2}s">${icon} ${repo.repo.padEnd(24)} ${label}</text>`;
  });
  let panelEnd = y + ci.length * 20 - 8;
  y += ci.length * 20 + 18 + 6;

  // === CI/CD ===
  svg += `<rect x="82" y="${y}" width="760" height="70" class="bubble-workspace"/>
  <text x="100" y="${y + 16}" class="text-workspace" font-size="10" font-weight="bold">CI/CD</text>`;
  svg += `<text x="110" y="${y + 32}" class="text-neutral fade" font-size="9px" style="animation-delay:0.5s">✅ GitHub Actions · 3 workflows ativos</text>`;
  svg += `<text x="110" y="${y + 48}" class="text-neutral fade" font-size="9px" style="animation-delay:0.7s">✅ Vercel · Netlify · Firebase · 6 projetos conectados</text>`;
  y += 78;

  // Traces
  svg += `<path d="M${W / 2} ${y - 10} L${W / 2} ${y - 2}" class="trace-solid"/>`;
  svg += `<circle cx="${W / 2}" cy="${y - 10}" r="3" class="via"/>`;

  // === TASKS ===
  svg += `<rect x="82" y="${y}" width="760" height="62" class="bubble-tasks"/>
  <text x="100" y="${y + 16}" class="text-tasks" font-size="10px" font-weight="bold">TASKS — Pendências</text>`;
  svg += `<text x="110" y="${y + 32}" class="text-neutral fade" font-size="9px" style="animation-delay:0.3s">🔵 ${data.prs} PRs abertos │ 🟡 ${data.issues} issues em progresso</text>`;
  svg += `<text x="110" y="${y + 48}" class="text-neutral fade" font-size="9px" style="animation-delay:0.6s">🔴 ${data.bugs} bug(s) crítico(s)</text>`;
  y += 70;

  svg += `<path d="M${W / 2} ${y - 10} L${W / 2} ${y - 2}" class="trace-solid"/>`;
  svg += `<circle cx="${W / 2}" cy="${y - 10}" r="3" class="via"/>`;

  // === MISSION ===
  svg += `<circle cx="${W / 2}" cy="${y + 25}" r="65" fill="url(#glow-mission)"/>`;
  svg += `<rect x="82" y="${y}" width="760" height="52" class="bubble-mission"/>
  <text x="100" y="${y + 16}" class="text-mission" font-size="10px" font-weight="bold">MISSION</text>`;
  svg += `<text x="100" y="${y + 34}" class="text-dim fade" font-size="9px" style="animation-delay:0.6s">"Construir um ecossistema completo de ferramentas 3D, enterprise e IA."</text>`;

  y += 60;

  // Bottom PCB chip
  const bottom = H - 28;
  svg += `<rect x="${W / 2 - 60}" y="${bottom}" width="120" height="18" rx="3" fill="#0A0A0A" stroke="${accent}" stroke-width="0.8"/>
  <text x="${W / 2}" y="${bottom + 12}" text-anchor="middle" class="text-mission" font-size="6px">CONVERSATION-GEN v1.0 · @${GITHUB_USER}</text>`;

  // Trace lines connecting sections vertically (right side)
  svg += `<line x1="${W - 14}" y1="38" x2="${W - 14}" y2="${bottom}" class="trace-anim" style="animation-delay:0.4s"/>`;
  [60, 180, 280, 360, 440].forEach((yy, i) => {
    svg += `<circle cx="${W - 14}" cy="${yy}" r="3" class="via"/>`;
  });

  return `${svg}</svg>`;
}

async function main() {
  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const [data, ciStatus] = await Promise.all([
    fetchData(GITHUB_USER, TOKEN),
    fetchCIStatus(GITHUB_USER, TOKEN),
  ]);
  const svg = generateConversationSVG(data, ciStatus);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated: ${outPath}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });