import { ArcadeRenderer, ARCADE_GAMES } from "pacman-contribution-graph";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

// usage: node scripts/arcade-render.mjs <game> <theme> <out.svg>
// env: GITHUB_USER, GITHUB_TOKEN
// one process per game/theme: the GitHub GraphQL fetch hangs on a reused
// keep-alive connection, so a fresh process per render keeps it reliable.

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
