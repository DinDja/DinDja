import { ArcadeRenderer, ARCADE_GAMES } from "pacman-contribution-graph";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import https from "https";

// usage: node scripts/arcade-render.mjs <game> <theme> <out.svg>
// env: GITHUB_USER, GITHUB_TOKEN
//
// The renderer's internal fetch() to api.github.com/graphql can hang on the
// GitHub runner (keep-alive connection issue), so patch globalThis.fetch with
// a reliable https.request-based implementation before rendering.

globalThis.fetch = (url, options = {}) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = options.body ? Buffer.from(options.body) : null;
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: options.method || "GET",
        headers: {
          ...(options.headers || {}),
          ...(body ? { "Content-Length": body.length } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage || "",
            json: async () => JSON.parse(text),
            text: async () => text,
          });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });

function render(game, theme, username, token) {
  return new Promise((resolve, reject) => {
    let svg = "";
    const renderer = new ArcadeRenderer({
      game,
      platform: "github",
      username,
      gameTheme: theme,
      playerStyle: "opportunistic",
      githubSettings: { accessToken: token },
      svgCallback: (s) => (svg = s),
      gameStatsCallback: () => {},
      gameOverCallback: () => resolve(svg),
      pointsIncreasedCallback: () => {},
    });
    renderer.start().catch(reject);
  });
}

try {
  const game = process.argv[2];
  const theme = process.argv[3] || "github-dark";
  const out = process.argv[4];
  if (!ARCADE_GAMES.includes(game)) throw new Error(`bad game: ${game}`);

  const t0 = Date.now();
  const svg = await Promise.race([
    render(game, theme, process.env.GITHUB_USER || "DinDja", process.env.GITHUB_TOKEN || ""),
    new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 90s")), 90000)),
  ]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, svg);
  console.log(`OK ${game}/${theme}: ${svg.length} bytes in ${Date.now() - t0}ms`);
} catch (e) {
  console.error(`FAIL: ${e.message}`);
  process.exit(1);
}
