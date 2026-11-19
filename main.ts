// Port Azura's entrypoint: hands the finished open-world game to the make.fun judge.
// It copies game/ and screenshots/ from beside this file into the output directory
// (/output in the grader, or $MAKEFUN_OUTPUT_DIR outside it) and writes dossier.json
// there through the vendored make.fun library, with the scorer's own caps. Before it
// copies anything it validates the entry against those caps and fails loudly on the
// first problem, so a broken entry is never handed in: game/index.html must exist,
// game/ must hold at most 993 entries and 48 MiB of files with no path over 1000
// bytes, and screenshots/ must hold at most 4 PNG or JPEG images, none over 256 KiB.
// On success it prints one summary line (game entries and bytes, screenshot count,
// dossier bytes) so the build log shows exactly what was handed in.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse.
const TEXT_MAX_BYTES = 163840;
const SCREENSHOT_MAX = 4;
const SCREENSHOT_MAX_BYTES = 262144;
const GAME_MAX_ENTRIES = 993;
const GAME_MAX_BYTES = 50331648;
const GAME_PATH_MAX_BYTES = 1000;

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotDir = join(here, 'screenshots');

/** Stop the build with a clear error: a handed-in entry must never be silently wrong. */
function fail(message) {
  throw new Error(`entry invalid: ${message}`);
}

/** Every file under a directory, walked depth-first, with the directory count and total bytes.
 * Returns { files, directories, bytes }: the files' full paths, how many directories
 * were walked, and the files' sizes summed. */
function walkGame(dir) {
  const found = { files: [], directories: 0, bytes: 0 };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.directories++;
      const sub = walkGame(path);
      found.files.push(...sub.files);
      found.directories += sub.directories;
      found.bytes += sub.bytes;
    } else if (entry.isFile()) {
      found.files.push(path);
      found.bytes += statSync(path).size;
    } else {
      fail(`${relative(here, path)} is a symbolic link or special file, game/ holds plain files only`);
    }
  }
  return found;
}

// game/index.html is the one file the game must hold; without it there is nothing to play.
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');

const game = walkGame(gameDir);
const gameEntries = game.files.length + game.directories;
if (gameEntries > GAME_MAX_ENTRIES) fail(`game/ holds ${gameEntries} entries, cap is ${GAME_MAX_ENTRIES}`);
if (game.bytes > GAME_MAX_BYTES) fail(`game/ files come to ${game.bytes} bytes, cap is ${GAME_MAX_BYTES}`);
for (const file of game.files) {
  const rel = relative(gameDir, file);
  const pathBytes = Buffer.byteLength(rel, 'utf8');
  if (pathBytes > GAME_PATH_MAX_BYTES) fail(`game/${rel} is ${pathBytes} bytes, cap is ${GAME_PATH_MAX_BYTES}`);
}

// Screenshots: at most 4 PNG or JPEG images, each within the 256 KiB cap.
const shotNames = existsSync(shotDir)
  ? readdirSync(shotDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort()
  : [];
if (shotNames.length > SCREENSHOT_MAX) fail(`${shotNames.length} screenshots, cap is ${SCREENSHOT_MAX}`);
for (const name of shotNames) {
  const size = statSync(join(shotDir, name)).size;
  if (size > SCREENSHOT_MAX_BYTES) fail(`screenshot ${name} is ${size} bytes, cap is ${SCREENSHOT_MAX_BYTES}`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: SCREENSHOT_MAX, max_bytes: SCREENSHOT_MAX_BYTES },
  game_max_files: GAME_MAX_ENTRIES,
  game_max_bytes: GAME_MAX_BYTES,
  game_path_max_bytes: GAME_PATH_MAX_BYTES,
});
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(`handed in ${gameEntries} game entries (${game.bytes} bytes), ${shotNames.length} screenshots, dossier ${dossier.length} bytes`);
import { readFileSync } from 'node:fs';

// Read the dossier back from disk: it must exist, hold bytes, and parse as JSON,
// so a write that silently failed can never be handed in as a good entry.
if (!existsSync(join(out, 'dossier.json'))) fail('dossier.json is missing on disk');
const dossierText = readFileSync(join(out, 'dossier.json'), 'utf8');
if (dossierText.length === 0) fail('dossier.json is empty on disk');
let dossierData;
try {
  dossierData = JSON.parse(dossierText);
} catch {
  fail('dossier.json is not valid JSON');
}
console.log(`dossier verified: schema ${dossierData.schema}, ${dossierText.length} bytes read back`);
