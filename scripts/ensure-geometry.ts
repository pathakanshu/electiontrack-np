/**
 * scripts/ensure-geometry.ts
 *
 * Pre-build check: if `public/data/geometry.topo.json` already exists,
 * skip the expensive geometry generation step (which requires network
 * access to the Election Commission API).
 *
 * If the file is missing, delegate to `generate-geometry.ts`.
 *
 * Used by `npm run build` so builds don't fail when the ECN API is
 * unreachable but cached geometry is already present.
 */

import fs from 'fs';
import path from 'path';

const GEOMETRY_PATH = path.join(
  process.cwd(),
  'public',
  'data',
  'geometry.topo.json'
);

function log(...args: unknown[]) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function main() {
  if (fs.existsSync(GEOMETRY_PATH)) {
    const stat = fs.statSync(GEOMETRY_PATH);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
    log(
      `✅ geometry.topo.json already exists (${sizeMB} MB, modified ${stat.mtime.toISOString()}) — skipping generation.`
    );
    process.exit(0);
  }

  log('⚠️  geometry.topo.json not found — running generate-geometry…');

  // Dynamically import and run the generator
  try {
    await import('./generate-geometry');
    // generate-geometry.ts calls process.exit() internally on success/failure,
    // but just in case it doesn't:
    process.exit(0);
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] ERROR: generate-geometry failed:`,
      (err as Error).message
    );
    console.error(
      '\nThe build requires geometry data. Either:\n' +
        '  1. Ensure network access to result.election.gov.np, or\n' +
        '  2. Provide a pre-built public/data/geometry.topo.json file.\n'
    );
    process.exit(1);
  }
}

main();
