/**
 * src/scripts/generate-geometry.ts
 *
 * Build-time generator script that:
 *  - Bundles remote GeoJSON using your bundlers
 *  - Converts to TopoJSON and simplifies via buildGeometry()
 *  - Writes result to public/data/geometry.topo.json (created by buildGeometry)
 *
 * This version adds verbose logging, timings, and robust error handling so you can
 * diagnose failures during CI or local development.
 *
 * Run with:
 *   npx ts-node src/scripts/generate-geometry.ts
 *
 * Notes:
 * - The bundler modules perform network requests at import/run-time; we import
 *   them dynamically to keep control flow explicit and to provide clearer logs.
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

function now(): string {
  return new Date().toISOString();
}

function log(...args: unknown[]) {
  // Prefix messages with timestamp for easier debugging in CI logs
  console.log(`[${now()}]`, ...args);
}

function errorLog(...args: unknown[]) {
  console.error(`[${now()}] ERROR:`, ...args);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsPromises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function humanFileSize(filePath: string): Promise<string> {
  try {
    const stat = await fsPromises.stat(filePath);
    const bytes = stat.size;
    const units = ['B', 'KB', 'MB', 'GB'];
    let u = 0;
    let n = bytes;
    while (n >= 1024 && u < units.length - 1) {
      n /= 1024;
      u++;
    }
    return `${n.toFixed(2)} ${units[u]}`;
  } catch {
    return 'n/a';
  }
}

async function run() {
  const start = Date.now();
  log('Starting geometry generation...');

  // Write a debug marker file immediately so we can tell the generator started.
  // This helps diagnose cases where the script runs but output isn't produced.
  try {
    const debugDir = path.join(process.cwd(), 'public', 'data');
    fs.mkdirSync(debugDir, { recursive: true });
    const markerPath = path.join(debugDir, '.generate-start');
    // Write a timestamp so it's easy to correlate logs with filesystem state
    fs.writeFileSync(markerPath, now(), { encoding: 'utf8' });
    log('Wrote debug start marker to', markerPath);
  } catch (markerErr) {
    errorLog(
      'Failed to write debug start marker:',
      (markerErr as Error).message
    );
  }

  try {
    // Dynamic import so any top-level awaits or network activity inside the bundler
    // are executed when we explicitly call them.
    log('Importing bundlers...');
    // Use CommonJS require to load the bundler modules so ts-node/Node resolve works
    // without needing `.ts` extensions (avoids TS5097 error).
    // Keep typings ergonomically with `typeof import(...)` casts.
    const bundlerModule =
      require('../src/data/dataBundler') as typeof import('../src/data/dataBundler');
    const buildModule =
      require('./build-geometry') as typeof import('./build-geometry');

    // Type the imports loosely here; the bundler functions return typed Feature arrays.
    const bundleProvinces = bundlerModule.bundleProvinces as () => Promise<
      any[]
    >;
    const bundleDistricts = bundlerModule.bundleDistricts as (
      p: number
    ) => Promise<any[]>;
    const bundleConstituencies = bundlerModule.bundleConstituencies as (
      d: number
    ) => Promise<any[]>;
    const buildGeometry = buildModule.buildGeometry as (
      provinces: any[],
      districts: any[],
      constituencies: any[]
    ) => void | Promise<void>;

    log('Fetching and bundling provinces...');
    const provinces = await bundleProvinces();
    log(`Fetched ${provinces.length} provinces.`);

    const districts: any[] = [];
    const provinceStart = Date.now();
    for (let i = 0; i < provinces.length; i++) {
      const prov = provinces[i];
      const id = prov?.properties?.province_id;
      if (typeof id !== 'number') {
        errorLog(
          `Province at index ${i} missing numeric properties.province_id; skipping.`
        );
        continue;
      }
      log(
        `  Bundling districts for province ${id} (${i + 1}/${provinces.length})...`
      );
      const ds = await bundleDistricts(id);
      log(`    got ${ds.length} districts`);
      districts.push(...ds);
    }
    log(
      `Bundled districts for all provinces in ${(Date.now() - provinceStart) / 1000}s. Total districts: ${districts.length}`
    );

    const constituencies: any[] = [];
    const districtsStart = Date.now();
    for (let i = 0; i < districts.length; i++) {
      const d = districts[i];
      const did = d?.properties?.district_id;
      if (typeof did !== 'number') {
        errorLog(
          `District at index ${i} missing numeric properties.district_id; skipping.`
        );
        continue;
      }
      log(
        `  Bundling constituencies for district ${did} (${i + 1}/${districts.length})...`
      );
      const cs = await bundleConstituencies(did);
      log(`    got ${cs.length} constituencies`);
      constituencies.push(...cs);
    }
    log(
      `Bundled constituencies for all districts in ${(Date.now() - districtsStart) / 1000}s. Total constituencies: ${constituencies.length}`
    );

    // Basic validation before passing to buildGeometry
    if (provinces.length === 0) {
      throw new Error('No provinces fetched; aborting geometry build.');
    }
    if (districts.length === 0) {
      throw new Error('No districts fetched; aborting geometry build.');
    }
    if (constituencies.length === 0) {
      throw new Error('No constituencies fetched; aborting geometry build.');
    }

    log('Calling buildGeometry to create TopoJSON...');
    const buildStart = Date.now();
    // buildGeometry writes to public/data/geometry.topo.json
    await buildGeometry(provinces, districts, constituencies);
    const buildElapsed = (Date.now() - buildStart) / 1000;
    log(`buildGeometry completed in ${buildElapsed}s`);

    // Verify output file exists and is valid JSON
    const outPath = path.join(
      process.cwd(),
      'public',
      'data',
      'geometry.topo.json'
    );
    log('Checking output file:', outPath);

    const exists = await fileExists(outPath);
    if (!exists) {
      throw new Error(`Expected output file not found at ${outPath}`);
    }

    const sizeStr = await humanFileSize(outPath);
    log(`Output file exists (${sizeStr}). Attempting to validate JSON...`);

    const raw = await fsPromises.readFile(outPath, 'utf8');

    // Quick sanity: ensure it starts with '{' and parses as JSON
    const trimmed = raw.trimLeft();
    if (!trimmed.startsWith('{')) {
      throw new Error(
        `Output file at ${outPath} does not look like JSON (starts with: ${trimmed.slice(0, 20)})`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse output JSON: ${(err as Error).message}`);
    }

    // Check basic TopoJSON shape
    const topo = parsed as Record<string, unknown>;
    if (
      topo.type !== 'Topology' ||
      typeof topo.objects !== 'object' ||
      topo.objects === null
    ) {
      throw new Error(
        'Output JSON is not a valid Topology (missing type === \"Topology\" or objects)'
      );
    }

    // Verify expected named objects exist
    const objs = topo.objects as Record<string, unknown>;
    const missing = [];
    for (const name of ['provinces', 'districts', 'constituencies']) {
      if (!(name in objs)) missing.push(name);
    }
    if (missing.length > 0) {
      throw new Error(
        `TopoJSON missing expected objects: ${missing.join(', ')}`
      );
    }

    log(
      'Validation passed. TopoJSON contains provinces, districts, constituencies.'
    );
    const totalTime = (Date.now() - start) / 1000;
    log(`Geometry generation finished successfully in ${totalTime}s`);
    process.exit(0);
  } catch (err) {
    const e = err as Error;
    errorLog('Geometry generation failed:', e.message);
    if (e.stack) {
      // Print a shortened stack trace for clarity
      const stack = e.stack.split('\n').slice(0, 6).join('\n');
      errorLog(stack);
    }
    // Offer some troubleshooting tips
    errorLog('Troubleshooting tips:');
    errorLog(
      ' - Ensure you have network access from this machine, since the bundler fetches remote GeoJSON.'
    );
    errorLog(
      ' - If you see HTML returned where JSON is expected, check that the remote endpoints are reachable and returning JSON.'
    );
    errorLog(
      ' - Make sure the output directory (public/data) is writable by this process.'
    );
    process.exit(1);
  }
}

run();
