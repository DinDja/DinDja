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
  const W = 1100, H = 480;
  const maxCommits = Math.max(1, ...repoData.map((r) => r.commits));
  const roofColors = ["#0A66C2", "#6A5ACD", "#238636", "#DA3633", "#BF4B8A", "#B9B500"];

  // animation keyframes via style
  const css = `
    @keyframes twinkle { 0%,100%{opacity:0.3} 50%{opacity:1} }
    @keyframes smoke { 0%{opacity:0;transform:translateY(0) scale(1)} 50%{opacity:0.6;transform:translateY(-8px) scale(1.4)} 100%{opacity:0;transform:translateY(-18px) scale(0.6)} }
    @keyframes firework { 0%{opacity:1;r:2;transform:translate(0,0)} 60%{opacity:0.8;r:3;transform:translate(var(--fx),var(--fy))} 100%{opacity:0;r:0.5;transform:translate(var(--fx2),var(--fy2))} }
    @keyframes build-grow { 0%{transform:scaleY(0);opacity:0} 60%{transform:scaleY(1.05)} 80%{transform:scaleY(0.98)} 100%{transform:scaleY(1);opacity:1} }
    @keyframes neon-flicker { 0%,100%{opacity:0.7} 3%{opacity:1;fill:#ffd700} 4%{opacity:0.4} 5%{opacity:1} 20%{opacity:0.7} }
    @keyframes star-shoot { 0%{opacity:0;transform:translateY(4px)} 30%{opacity:1} 100%{opacity:0;transform:translateY(-80px)} }
    @keyframes cloud-drift { 0%{transform:translateX(-20px)} 100%{transform:translateX(20px)} }
    .city-bg { fill: #0D1117; }
    .ground { fill: #161B22; }
    .star { fill: #ffffff; animation: twinkle 2s ease-in-out infinite; }
    .building-body { animation: build-grow 1.2s ease-out both; }
    .window-on { fill: #ffd700; animation: neon-flicker 3s ease-in-out infinite; }
    .window-off { fill: #30363D; }
    .window-bug { fill: #DA3633; animation: twinkle 0.6s ease-in-out infinite; }
    .smoke { fill: #8B949E; animation: smoke 1.8s ease-out infinite; }
    .firework { fill: #ffdd44; animation: firework 1.4s ease-out infinite; }
    .roof { fill: url(#roofGrad); }
    .antenna { stroke: #58A6FF; stroke-width: 1.5; }
    .cloud { fill: #21262D; opacity: 0.6; animation: cloud-drift 8s ease-in-out infinite alternate; }
    .label { fill: #C9D1D9; font-family: 'Courier New', monospace; }
    .title { fill: #ffd700; font-family: 'Courier New', monospace; font-size: 12px; font-weight: bold; }
    .chip { fill: #0A0A0A; stroke: #30363D; stroke-width: 1.5; rx: 4; }
    .chip-pin { fill: #C9A227; }
    .chip-label { fill: #58A6FF; font-family: 'Courier New', monospace; font-size: 6px; }
    .trace-line { stroke: #C9A227; stroke-width: 1.2; fill: none; stroke-dasharray: 4 8; animation: twinkle 2.5s linear infinite; }
    .trace-solid { stroke: #C9A227; stroke-width: 1.4; fill: none; }
    .via { fill: #161B22; stroke: #C9A227; stroke-width: 1; }
  `;

  let defs = `<defs><style>${css}</style>
    <linearGradient id="roofGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#58A6FF"/><stop offset="100%" stop-color="#0A66C2"/></linearGradient>
    <radialGradient id="moonGrad"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#8B949E"/></radialGradient>
  </defs>`;

  // Sky: dark with stars
  let sky = `<rect width="${W}" height="${H}" class="city-bg"/>
  <rect x="0" y="0" width="${W}" height="${340}" fill="#0D1117"/>
  <circle cx="180" cy="60" r="22" fill="url(#moonGrad)" opacity="0.9"/>
  <circle cx="180" cy="60" r="26" fill="#FFFFFF" opacity="0.06"/>`;

  const seed = 7777;
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  for (let i = 0; i < 80; i++) {
    sky += `<circle cx="${rand() * W}" cy="${rand() * 200}" r="${0.4 + rand() * 1.2}" class="star" style="animation-delay:${rand() * 3}s"/>`;
  }

  // Clouds drifting
  for (let i = 0; i < 4; i++) {
    sky += `<ellipse cx="${100 + i * 260}" cy="${80 - i * 15}" rx="${40 + rand() * 30}" ry="12" class="cloud" style="animation-delay:${i * 1.5}s"/>`;
  }

  // Ground — PCB substrate style
  sky += `<rect x="0" y="330" width="${W}" height="${150}" class="ground"/>
  <rect x="0" y="328" width="${W}" height="4" fill="#30363D"/>`;

  // Chip city logo (like a PCB chip at bottom center)
  sky += `<rect x="${W / 2 - 55}" y="410" width="110" height="50" rx="6" class="chip"/>
  <text x="${W / 2}" y="432" text-anchor="middle" class="chip-label" style="font-size:7px">SKYLINE-GEN v1.0</text>
  <text x="${W / 2}" y="446" text-anchor="middle" class="chip-label" style="font-size:5px">@${GITHUB_USER}</text>
  <rect x="${W / 2 - 62}" y="422" width="6" height="10" class="chip-pin"/>`;

  // Buildings
  const floorH = 10;
  const startX = 80;
  const spacing = 162;
  let buildingIdx = 0;
  for (const rd of repoData) {
    const commits = rd.commits || BUILD[rd.repo] || 50;
    const pct = Math.min(1, commits / maxCommits);
    const floors = Math.max(3, Math.round(pct * 18));
    const buildH = floors * floorH + 16;
    const buildW = 70 + pct * 50;
    const left = startX + spacing * buildingIdx + (70 - buildW) / 2;
    const bottomY = 328;
    const roofY = bottomY - buildH;

    const ciState = ciData.find((c) => c.repo === rd.repo)?.state || "unknown";
    const hasFireworks = rd.repo === repoData[0].repo; // biggest project gets fireworks

    // Body with grow animation
    sky += `<rect x="${left}" y="${roofY + 8}" width="${buildW}" height="${buildH - 8}" class="building-body" style="animation-delay:${0.2 + buildingIdx * 0.15}s;transform-origin:${left + buildW / 2}px ${bottomY}px" fill="#161B22" stroke="#30363D" stroke-width="1.5"/>`;

    // Windows — lit (CI green), dark, or buggy (CI red)
    const windowsPerFloor = Math.round(buildW / 16);
    for (let f = 0; f < floors; f++) {
      for (let w = 0; w < windowsPerFloor; w++) {
        const wx = left + 10 + w * 16 + (w % 2) * 4;
        const wy = bottomY - 16 - f * floorH;
        let winClass = "window-off";
        let delay = (f + w) * 0.05 + buildingIdx * 0.3;
        if (ciState === "success" && (f + w) % 3 !== 0) winClass = "window-on";
        else if (ciState === "failure" && (f + w) % 2 === 0) winClass = "window-bug";
        else if ((f + w) % 4 === 0) winClass = "window-on";
        sky += `<rect x="${wx}" y="${wy}" width="4" height="4" class="${winClass}" style="animation-delay:${delay}s"/>`;
      }
    }

    // Roof with antenna
    sky += `<path d="M${left - 4} ${roofY + 8} L${left + buildW / 2} ${roofY - 6} L${left + buildW + 4} ${roofY + 8}Z" class="roof"/>`;
    sky += `<line x1="${left + buildW / 2}" y1="${roofY - 6}" x2="${left + buildW / 2}" y2="${roofY - 18}" class="antenna"/>`;

    // Fireworks for biggest project
    if (hasFireworks) {
      for (let f = 0; f < 6; f++) {
        const fx = left + buildW / 2 + (f - 2.5) * 30;
        const fy = roofY - 18;
        sky += `<circle cx="${fx}" cy="${fy}" r="${1.5 + rand() * 2}" class="firework"
          style="--fx:${(f - 2.5) * 40}px;--fy:-${20 + rand() * 30}px;--fx2:${(f - 2.5) * 50}px;--fy2:-${30 + rand() * 50}px;animation-delay:${f * 0.18}s"/>`;
      }
    }

    // Smoke from buggy buildings
    if (ciState === "failure") {
      sky += `<circle cx="${left + buildW / 2}" cy="${roofY - 10}" r="5" class="smoke" style="animation-delay:0s"/>
      <circle cx="${left + buildW / 2 + 8}" cy="${roofY - 14}" r="4" class="smoke" style="animation-delay:0.6s"/>
      <circle cx="${left + buildW / 2 - 6}" cy="${roofY - 16}" r="3.5" class="smoke" style="animation-delay:1.2s"/>`;
    }

    // Name label below
    const name = rd.repo.length > 16 ? rd.repo.slice(0, 14) + ".." : rd.repo;
    sky += `<text x="${left + buildW / 2}" y="${bottomY + 18}" text-anchor="middle" class="label" style="font-size:8px">${name}</text>`;
    sky += `<text x="${left + buildW / 2}" y="${bottomY + 28}" text-anchor="middle" class="label" style="font-size:7px;opacity:0.6">${commits} commits</text>`;

    // Stack badge (chip style)
    const stack = STACKS[rd.repo] || [];
    stack.forEach((s, si) => {
      sky += `<rect x="${left + si * 18}" y="${bottomY + 32}" width="16" height="10" rx="2" class="chip"/>
      <text x="${left + si * 18 + 8}" y="${bottomY + 39}" text-anchor="middle" class="chip-label">${s}</text>`;
    });

    buildingIdx++;
  }

  // PCB traces connecting buildings
  for (let i = 0; i < REPOS.length - 1; i++) {
    const x1 = startX + spacing * i + 35;
    const x2 = startX + spacing * (i + 1) + 35;
    sky += `<path d="M${x1} 340 L${(x1 + x2) / 2} 340 L${(x1 + x2) / 2} 345 L${x2} 345" class="trace-line" style="animation-delay:${i * 0.3}s"/>`;
    sky += `<path d="M${x1} 340 L${(x1 + x2) / 2} 340 L${(x1 + x2) / 2} 345 L${x2} 345" class="trace-solid"/>`;
    sky += `<circle cx="${(x1 + x2) / 2}" cy="340" r="2.5" class="via"/>`;
  }

  // Edge border
  sky += `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" fill="none" stroke="#C9A227" stroke-width="1" opacity="0.25" rx="6"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">${defs}${sky}</svg>`;
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