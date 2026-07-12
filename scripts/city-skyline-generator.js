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
      {
        hostname: "api.github.com", path: "/graphql", method: "POST",
        headers: {
          "User-Agent": "city-generator", "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : ""
        }
      },
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
  const P = 4; // Tamanho do "Pixel" (Grid)
  const snap = (v) => Math.floor(v / P) * P;

  // Paleta de Cores baseada na sua referência
  const C_BLACK = "#0A0B08";
  const C_WHITE = "#F5F5F5";
  const C_YELLOW = "#FAED42";
  const C_ORANGE = "#F19D3E";
  const C_SKY = "#1A1A24"; // Fundo noturno escuro para contraste
  const C_PASS = "#4ade80"; // Verde 8-bit
  const C_FAIL = "#ef4444"; // Vermelho 8-bit

  let seed = 7777;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto" shape-rendering="crispEdges">
  <defs>
    <style>
      .text-pixel { font-family: 'Courier New', Courier, monospace; font-weight: 900; }
      .text-small { font-family: 'Courier New', Courier, monospace; font-weight: bold; font-size: 11px; }
      .blink { animation: blinker 2s steps(2, start) infinite; }
      .blink-fast { animation: blinker 1s steps(2, start) infinite; }
      .cloud { animation: drift 40s linear infinite; }
      .car { animation: drift 15s linear infinite; }
      @keyframes blinker { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      @keyframes drift { from { transform: translateX(-200px); } to { transform: translateX(${W + 200}px); } }
    </style>
  </defs>`;

  function rect(x, y, w, h, fill, stroke = "", sw = 0, cls = "", style = "") {
    let sAttr = stroke ? `stroke="${stroke}" stroke-width="${sw}"` : "";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${sAttr} class="${cls}" style="${style}" />\n`;
  }

  // 1. Céu Base
  svg += rect(0, 0, W, H, C_SKY);

  // 2. Estrelas Pixeladas
  for (let i = 0; i < 40; i++) {
    let sx = snap(rand() * W);
    let sy = snap(rand() * (H - 200));
    let isBlink = rand() > 0.5;
    svg += rect(sx, sy, P, P, C_WHITE, "", 0, isBlink ? "blink" : "", `animation-delay: ${rand() * 2}s`);
  }

  // 3. Lua/Sol Enorme (Estilo 8-bit retro)
  const r = snap(90);
  const cx = snap(W - 250), cy = snap(180);
  for (let y = -r; y <= r; y += P) {
    for (let x = -r; x <= r; x += P) {
      if (x * x + y * y <= r * r) {
        svg += rect(cx + x, cy + y, P, P, C_ORANGE);
      }
    }
  }

  // 4. Nuvens 8-bit
  for (let i = 0; i < 5; i++) {
    let cy = snap(50 + rand() * 150);
    let delay = `animation-delay: -${rand() * 40}s`;
    let cloudHtml = `<g class="cloud" style="${delay}">`;
    cloudHtml += rect(0, cy, snap(60), snap(20), C_WHITE, C_BLACK, P);
    cloudHtml += rect(snap(20), cy - snap(12), snap(40), snap(16), C_WHITE, C_BLACK, P);
    cloudHtml += rect(snap(-12), cy + snap(8), snap(32), snap(12), C_WHITE, C_BLACK, P);
    cloudHtml += `</g>`;
    svg += cloudHtml;
  }

  // 5. Silhueta de Fundo (Prédios Escuros)
  let bgX = 0;
  while (bgX < W) {
    let bw = snap(60 + rand() * 80);
    let bh = snap(100 + rand() * 150);
    svg += rect(bgX, H - bh - snap(40), bw, bh, C_BLACK);
    // Antenas de fundo
    if (rand() > 0.6) svg += rect(bgX + snap(20), H - bh - snap(40) - snap(20), P, snap(20), C_BLACK);
    bgX += bw + snap(rand() * 20);
  }

  // 6. Prédios Principais (Projetos)
  const maxCommits = Math.max(1, ...repoData.map((r) => r.commits || BUILD[r.repo] || 50));
  const buildW = snap(130);
  const totalGaps = snap(W - (REPOS.length * buildW));
  const spacing = snap(totalGaps / (REPOS.length + 1));

  let curX = spacing;

  repoData.forEach((rd, idx) => {
    let commits = rd.commits || BUILD[rd.repo] || 50;
    let pct = commits / maxCommits;
    let h = snap(160 + pct * 200);
    let y = H - snap(50) - h;
    let ciState = ciData.find((c) => c.repo === rd.repo)?.state || "unknown";

    // Alternar entre estilos Light/Dark para criar contraste com a paleta
    let isLight = idx % 2 === 0;
    let bFill = isLight ? C_WHITE : C_BLACK;
    let bStroke = isLight ? C_BLACK : C_WHITE;
    let winFill = isLight ? C_BLACK : C_YELLOW;

    // Corpo do Prédio
    svg += rect(curX, y, buildW, h, bFill, C_BLACK, P);

    // Degraus no topo (Estilo bloco)
    let roofStyle = Math.floor(rand() * 3);
    if (roofStyle === 0) {
      svg += rect(curX + snap(20), y - snap(20), buildW - snap(40), snap(20), bFill, C_BLACK, P);
    } else if (roofStyle === 1) {
      svg += rect(curX + snap(12), y - snap(12), snap(24), snap(12), bFill, C_BLACK, P);
      svg += rect(curX + buildW - snap(36), y - snap(24), snap(24), snap(24), bFill, C_BLACK, P);
    } else {
      svg += rect(curX + buildW / 2 - P, y - snap(32), P * 2, snap(32), C_BLACK);
    }

    // Janelas estilo Pixel Art
    let winW = snap(12);
    let winH = snap(16);
    let gapX = snap(16);
    let gapY = snap(24);
    let cols = Math.floor((buildW - snap(20)) / gapX);
    let rows = Math.floor((h - snap(60)) / gapY);

    let startX = curX + (buildW - (cols * gapX - (gapX - winW))) / 2;
    let startY = y + snap(20);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rand() > 0.3) {
          let wx = startX + c * gapX;
          let wy = startY + r * gapY;
          svg += rect(wx, wy, winW, winH, winFill);
        }
      }
    }

    // Indicador CI/CD no topo como um LED retro
    let ciColor = ciState === "success" ? C_PASS : ciState === "failure" ? C_FAIL : C_ORANGE;
    svg += rect(curX + buildW / 2 - snap(8), y - snap(8), snap(16), snap(8), ciColor, C_BLACK, P);

    // Etiqueta do Prédio (Placa retro)
    let labelY = H - snap(50) - snap(30);
    svg += rect(curX - P, labelY, buildW + P * 2, snap(24), C_BLACK, C_WHITE, P);

    let shortName = rd.repo.length > 15 ? rd.repo.slice(0, 13) + ".." : rd.repo;
    svg += `<g shape-rendering="auto">
      <text x="${curX + buildW / 2}" y="${labelY + snap(16)}" text-anchor="middle" fill="${C_WHITE}" class="text-small">${shortName}</text>
    </g>`;

    curX += buildW + spacing;
  });

  // 7. Chão e Rua
  svg += rect(0, H - snap(50), W, snap(50), C_BLACK); // Base
  svg += rect(0, H - snap(46), W, P, C_WHITE); // Linha divisória

  // Faixas da rua
  for (let x = 0; x < W; x += snap(60)) {
    svg += rect(x, H - snap(24), snap(32), P, C_YELLOW);
  }

  // Carros 8-bit
  for (let i = 0; i < 3; i++) {
    let delay = `animation-delay: -${rand() * 15}s`;
    let cy = H - snap(36) + (i % 2) * snap(16);
    let carHtml = `<g class="car" style="${delay}">`;
    carHtml += rect(0, cy, snap(24), snap(8), C_WHITE, C_BLACK, P);
    carHtml += rect(snap(4), cy - snap(4), snap(12), snap(4), C_WHITE, C_BLACK, P);
    carHtml += rect(snap(4), cy + snap(8), snap(6), snap(4), C_ORANGE); // Roda 1
    carHtml += rect(snap(16), cy + snap(8), snap(6), snap(4), C_ORANGE); // Roda 2
    carHtml += `</g>`;
    svg += carHtml;
  }

  // 8. HUD Info Box (Estilo RPG Retro)
  let totalCommits = repoData.reduce((a, r) => a + (r.commits || 0), 0);
  let hudW = snap(360);
  let hudH = snap(32);
  let hudX = W / 2 - hudW / 2;
  let hudY = snap(16);

  svg += rect(hudX, hudY, hudW, hudH, C_BLACK, C_WHITE, P);
  svg += `<g shape-rendering="auto">
    <text x="${W / 2}" y="${hudY + snap(20)}" text-anchor="middle" fill="${C_YELLOW}" class="text-pixel" font-size="14">
      USER: ${GITHUB_USER} | COMMITS: ${totalCommits}
    </text>
  </g>`;

  // Borda Final Pixelada
  svg += rect(P, P, W - P * 2, H - P * 2, "none", C_WHITE, P * 2);

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