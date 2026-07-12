const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_USER = process.env.GITHUB_USER || "DinDja";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = process.argv[2] || "dist/city-skyline.svg";

const REPOS = ["Editor-ThreeJS", "SECTI-contratos", "TSARA", "hubSECTI", "PatentesLab", "Sectinvent-rio"];
const BUILD = { "Editor-ThreeJS": 184, "SECTI-contratos": 85, "TSARA": 152, "hubSECTI": 82, "PatentesLab": 70, "Sectinvent-rio": 58 };

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
  const PX = 4;
  const maxCommits = Math.max(1, ...repoData.map((r) => r.commits));

  const BODY = "#F5F5F5";
  const GROUND = "#F19D3E";
  const DARK = "#0A0B08";
  const W_ON = "#FAED42";
  const W_OFF = "#3a3a4a";
  const SKY = "#0D1117";
  const STAR = "#FAED42";
  const W_GREEN = "#4ade80";
  const W_RED = "#ef4444";

  const totalCommits = repoData.reduce((a, r) => a + (r.commits || 0), 0);
  const bottom = H - 100;
  const pw = PX;

  function px(x, y, w, h, fill, extras) {
    const a = `x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"`;
    return `<rect ${a}${extras ? " " + extras : ""}/>`;
  }

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs>
    <style>
      @keyframes w { 0%,100%{opacity:0.3} 50%{opacity:1} }
      @keyframes we { 0%,100%{opacity:0.3;fill:#ef4444} 25%{fill:#ff6b6b} 50%{opacity:1;fill:#ff0000} 75%{fill:#ff4444} }
      .wl { animation:w 2s ease-in-out infinite; }
      .we { animation:we 0.8s ease-in-out infinite; }
    </style>
  </defs>`;

  const seed = 7777;
  let rng = seed;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };

  // Sky
  s += `<rect width="${W}" height="${H}" fill="${SKY}"/>`;

  // Pixel stars
  for (let i = 0; i < 80; i++) {
    const sx = Math.floor(rand() * W / PX) * PX;
    const sy = Math.floor(rand() * (bottom - 40) / PX) * PX;
    const size = PX * (0.5 + Math.floor(rand() * 2));
    s += px(sx, sy, size, size, STAR, `opacity="${0.3 + rand() * 0.7}"`);
  }

  // Buildings
  const totalW = W - 160;
  const gap = Math.floor(totalW / REPOS.length / 6);
  const bW = Math.floor((totalW - gap * (REPOS.length - 1)) / REPOS.length / PX) * PX;
  const spacing = bW + gap;
  const startX = Math.floor((W - (bW * REPOS.length + gap * (REPOS.length - 1))) / 2 / PX) * PX;

  const roofStyles = ["flat", "peak", "step", "dome", "twin", "saw"];

  for (let i = 0; i < repoData.length; i++) {
    const rd = repoData[i];
    const commits = rd.commits || BUILD[rd.repo] || 50;
    const pct = Math.min(1, commits / maxCommits);
    const floors = Math.max(3, Math.round(pct * 18));
    const bh = floors * PX * 2 + PX * 4;
    const bx = startX + spacing * i;
    const by = bottom - bh;
    const ci = ciData.find((c) => c.repo === rd.repo)?.state || "unknown";
    const roof = roofStyles[i % roofStyles.length];

    // Building body
    s += px(bx, by, bW, bh, BODY);

    // Dark outline (left + bottom)
    s += px(bx, by, PX, bh, DARK);
    s += px(bx, bottom - PX, bW, PX, DARK);

    // Roof
    if (roof === "peak") {
      const rx = bx - PX;
      const ry = by - PX * 3;
      s += `<polygon points="${rx},${by} ${bx + bW / 2},${ry} ${bx + bW + PX},${by}" fill="${DARK}"/>`;
      s += px(bx + bW / 2 - PX / 2, ry - PX, PX, PX, DARK);
    } else if (roof === "step") {
      const sw = bW - PX * 2;
      s += px(bx + PX, by - PX * 2, sw, PX * 2, DARK);
      s += px(bx + PX * 2, by - PX * 3, sw - PX * 2, PX, DARK);
    } else if (roof === "dome") {
      s += `<path d="M${bx} ${by} Q${bx + bW / 2} ${by - PX * 3} ${bx + bW} ${by}" fill="${DARK}"/>`;
    } else if (roof === "twin") {
      const tw = bW / 2 - PX;
      s += px(bx, by - PX * 2, tw, PX * 2, DARK);
      s += px(bx + bW - tw, by - PX * 2, tw, PX * 2, DARK);
    } else if (roof === "saw") {
      for (let t = 0; t < Math.floor(bW / (PX * 2)); t++) {
        s += px(bx + t * PX * 2, by - PX, PX, PX, DARK);
      }
    } else {
      s += px(bx, by, bW, PX, DARK);
    }

    // Antenna
    if (i === 0 || i === 2) {
      const ax = bx + bW / 2 - PX / 2;
      s += px(ax, by - PX * 3 - PX * (i + 1), PX, PX * 3 + PX * (i + 1), DARK);
    }

    // Windows grid
    const wCols = Math.floor((bW - PX * 4) / (PX * 3));
    const wRows = Math.floor((bh - PX * 4) / (PX * 3));
    const wPadX = PX * 2 + Math.floor((bW - PX * 4 - wCols * PX * 3) / 2);
    const wPadY = PX * 2;

    for (let r = 0; r < wRows; r++) {
      for (let c = 0; c < wCols; c++) {
        const wx = bx + wPadX + c * PX * 3;
        const wy = by + wPadY + r * PX * 3;
        const isLit = ci === "success" ? (r + c + i) % 5 !== 0 :
                      ci === "failure" ? (r + c) % 3 !== 0 :
                      (r + c + i * 2) % 4 !== 0;

        if (isLit) {
          let color = W_ON;
          let cls = "wl";
          if (ci === "success") color = W_GREEN;
          else if (ci === "failure") { color = W_RED; cls = "we"; }
          s += px(wx, wy, PX * 2, PX * 2, color,
            `class="${cls}" style="animation-delay:${((r * wCols + c) * 0.08 + i * 0.3).toFixed(2)}s"`);
        } else if (ci === "failure" && (r + c + i) % 7 === 0) {
          s += px(wx, wy, PX * 2, PX * 2, W_RED, `class="we" style="animation-delay:${(i * 0.3).toFixed(2)}s"`);
        } else {
          s += px(wx, wy, PX * 2, PX * 2, W_OFF);
        }
      }
    }

    // Label
    const label = rd.repo.length > 16 ? rd.repo.slice(0, 14) + ".." : rd.repo;
    const ly = bottom + PX * 4;
    const lx = bx + bW / 2;
    const lSize = Math.max(9, Math.min(11, Math.floor(bW / 6)));
    s += `<text x="${lx}" y="${ly}" text-anchor="middle" fill="#C9D1D9" font-family="'Courier New',monospace" font-size="${lSize}" font-weight="bold">${label}</text>`;
    s += `<text x="${lx}" y="${ly + lSize + 2}" text-anchor="middle" fill="#8B949E" font-family="'Courier New',monospace" font-size="${Math.max(7, lSize - 2)}">${commits} commits</text>`;
  }

  // Ground
  s += px(0, bottom, W, PX, DARK);
  s += px(0, bottom + PX, W, PX * 5, GROUND);
  s += px(0, bottom + PX * 6, W, PX, DARK);

  // Ground pixel pattern
  for (let gx = 0; gx < W; gx += PX * 3) {
    if (rand() > 0.6) {
      s += px(gx, bottom + PX + Math.floor(rand() * 3) * PX, PX, PX, DARK, 'opacity="0.3"');
    }
  }

  // Bottom bar
  const barY = bottom + PX * 8;
  s += px(W / 2 - 100, barY, 200, PX * 4, DARK);
  s += `<text x="${W / 2}" y="${barY + PX * 3}" text-anchor="middle" fill="#FAED42" font-family="'Courier New',monospace" font-size="9">CITY-GEN px v2.0  @${GITHUB_USER}</text>`;

  // Total commits
  s += `<text x="${W / 2}" y="${barY + PX * 7}" text-anchor="middle" fill="#8B949E" font-family="'Courier New',monospace" font-size="8">${totalCommits} commits  ·  ${REPOS.length} repos</text>`;

  s += `</svg>`;
  return s;
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
