const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_USER = process.env.GITHUB_USER || "DinDja";
const TOKEN = process.env.GITHUB_TOKEN || "";
const OUTPUT = process.argv[2] || "dist/matrix-rain.svg";
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
          "User-Agent": "matrix-rain-generator",
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
  let seed = 777;
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
        v < 0.22
          ? 0
          : Math.floor(1 + rnd() * (4 + 18 * Math.abs(Math.sin(w / 4.5 + d))));
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

// === MATRIX RAIN — one column per week of the year ===
const KATAKANA = [
  "ア","イ","ウ","エ","オ","カ","キ","ク","ケ","コ","サ","シ","ス","セ","ソ",
  "タ","チ","ツ","テ","ト","ナ","ニ","ヌ","ネ","ノ","ハ","ヒ","フ","ヘ","ホ",
  "マ","ミ","ム","メ","モ","ヤ","ユ","ヨ","ラ","リ","ル","レ","ロ","ワ","ヲ","ン",
];
const ASCII = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GLYPHS = [...KATAKANA, ...ASCII.split("")];

const COLS = 60;        // columns of rain
const COL_W = 16;       // px per column
const X0 = 10;          // left margin
const GY = 17;          // vertical glyph pitch
const FS = 13;          // font size

function generateMatrix(data) {
  const W = 980, H = 360;
  const weeks = data.weeks;
  const weekMax = weeks.map((w) =>
    Math.max(0, ...w.contributionDays.map((d) => d.contributionCount))
  );
  const maxW = Math.max(1, ...weekMax);
  const total = data.totalContributions;
  const N = weeks.length;

  // Seeded rng (deterministic glyphs)
  let rng = 20260731;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  const pickGlyph = () => GLYPHS[Math.floor(rand() * GLYPHS.length)];

  const columns = [];
  for (let c = 0; c < COLS; c++) {
    // column c ↔ week c (first N columns); the tail columns are ambient noise
    const intensity = c < N ? weekMax[c] / maxW : 0.08 + rand() * 0.14;

    const trailLen = Math.round(10 + intensity * 14); // glyphs per trail
    const dur = (5.5 - 2.2 * intensity).toFixed(2);   // fall speed
    const headOpacity = 0.55 + 0.45 * intensity;

    const chars = [];
    for (let k = 0; k < trailLen; k++) {
      const fade = Math.pow(1 - k / trailLen, 1.6);
      chars.push({
        ch: pickGlyph(),
        k,
        opacity: Math.max(0.06, fade),
        bright: rand() < 0.08,
      });
    }

    const T = (trailLen + 2) * GY; // loop distance (2 copies per column)
    const x = X0 + c * COL_W + COL_W / 2;

    columns.push({ x, T, trailLen, dur, headOpacity, chars, intensity });
  }

  // One keyframe per column so each has its own speed
  const keyframes = columns
    .map((col, i) =>
      `@keyframes fall${i} { from { transform: translateY(0); } to { transform: translateY(${col.T}px); } }`
    )
    .join("\n");

  const scanlines = [];
  for (let y = 18; y < H; y += 36) {
    scanlines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#00ff41" stroke-width="1" opacity="0.05"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="auto">
  <defs>
    <style>
      ${keyframes}
      .head { fill: #f2fff2; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: ${FS}px; font-weight: bold; text-anchor: middle; }
      .glyph { fill: #00c853; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: ${FS}px; text-anchor: middle; }
      .glyph-bright { fill: #39ff6a; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: ${FS}px; text-anchor: middle; }
      .label { fill: #00ff41; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 10px; letter-spacing: 1px; }
      .title { fill: #00ff41; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 12px; font-weight: bold; letter-spacing: 2px; }
      .watermark { fill: #00c853; font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; font-size: 92px; font-weight: bold; letter-spacing: 6px; text-anchor: middle; opacity: 0.05; }
    </style>
  </defs>

  <!-- ── Background ── -->
  <rect width="${W}" height="${H}" fill="#010801"/>
  ${scanlines.join("")}
  <text x="490" y="212" class="watermark">GITHUB_MATRIX</text>

  <!-- ── Rain columns ── -->
  ${columns.map((col, i) => {
    // Two copies of the trail, offset by T, so translateY loops seamlessly
    const copies = [0, col.T].map((off) =>
      col.chars.map((g) => {
        const y = off + g.k * GY;
        const cls = g.bright ? "glyph-bright" : "glyph";
        return `<text x="${col.x.toFixed(1)}" y="${(y + GY - 3).toFixed(1)}" class="${cls}" opacity="${g.opacity.toFixed(2)}">${g.ch}</text>`;
      }).join("")
    );
    const headY = (col.T + GY - 3).toFixed(1);
    const headY2 = (2 * col.T + GY - 3).toFixed(1);
    const delay = (-rand() * 9).toFixed(2);
    return `
  <g style="animation: fall${i} ${col.dur}s linear infinite; animation-delay:${delay}s">
    ${copies[0]}
    <text x="${col.x.toFixed(1)}" y="${headY}" class="head" opacity="${col.headOpacity.toFixed(2)}">${col.chars[0] ? col.chars[0].ch : "ア"}</text>
    ${copies[1]}
    <text x="${col.x.toFixed(1)}" y="${headY2}" class="head" opacity="${col.headOpacity.toFixed(2)}">${col.chars[0] ? col.chars[0].ch : "ア"}</text>
  </g>`;
  }).join("")}

  <!-- ── Frame labels ── -->
  <text x="40" y="30" class="title">${GITHUB_USER}@matrix:~$ git log --contributions ${YEAR}</text>
  <text x="${W - 40}" y="30" text-anchor="end" class="title" style="opacity:0.75">sudo make me productive</text>
  <text x="40" y="${H - 16}" class="label">${total} commits decoded · ${N} weeks</text>
  <text x="${W - 40}" y="${H - 16}" text-anchor="end" class="label" style="opacity:0.55">the grid has you</text>

  <!-- ── Border ── -->
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#0f4d20" stroke-width="1.5" rx="6"/>
</svg>`;
}

async function main() {
  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const calendar = process.env.MOCK_DATA === "1"
    ? mockCalendar()
    : await fetchContributions(GITHUB_USER, TOKEN);
  const svg = generateMatrix(calendar);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated: ${outPath}`);
  console.log(`Contributions: ${calendar.totalContributions}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
