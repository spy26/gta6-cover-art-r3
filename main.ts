// Vice Keyart Studio — gta6-cover-art-01 entry (Node 22, standard library
// only). The program hands the app in: it copies this directory's app/ and
// screenshots/ to /output and writes /output/dossier.json with the vendored
// make.fun library, the summary the judge reads. The app itself is plain
// static files a desktop browser loads offline: app/index.html plus its ES
// modules, four bundled sample photos, no library and no network request.
//
// Try it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function handIn() {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'app'), join(outDir, 'app'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  const shots = join(repoRoot, 'screenshots');
  if (existsSync(shots)) cpSync(shots, join(outDir, 'screenshots'), { recursive: true });

  // The scorer's own caps (reference/gate.json): only text_max_bytes shapes
  // the bytes; the others refuse an entry the scorer would refuse (more
  // than 4 screenshots or one over 256 KiB; more than 993 files in app/ or
  // 48 MiB of app files, in all, or a path under app/ over 1000 bytes).
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  return dossier.length;
}

const bytes = handIn();
console.log(`Vice Keyart Studio handed in: dossier.json is ${bytes} bytes.`);
