/**
 * scripts/update-cache.ts
 *
 * Refresh the cached candidate data for the current (live) election by
 * fetching the latest results from the Election Commission of Nepal (ECN)
 * through their secure handler.
 *
 * This script:
 *   1. Bootstraps an authenticated ECN session (CSRF + session cookie)
 *   2. Downloads the central candidate results file
 *   3. Writes it to public/cache/{year}/ElectionResultCentral{year}.txt
 *   4. Optionally re-extracts symbols metadata (symbols.json)
 *   5. Optionally re-downloads the district lookup if missing
 *
 * Run with:
 *   npx tsx scripts/update-cache.ts
 *   npm run update-cache
 *
 * Flags:
 *   --symbols    Also re-extract symbols.json from the fresh data
 *   --all        Re-download everything (district lookup, symbols, candidates)
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

import { getCurrentElection } from '../src/config/elections';
import { bootstrapEcnSession, ecnFetch, isEcnReachable } from './ecn-session';

// ── Helpers ─────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function log(...args: unknown[]) {
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

// ── Parse CLI flags ─────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2).map((a) => a.toLowerCase()));
const FLAG_SYMBOLS = args.has('--symbols') || args.has('--all');
const FLAG_ALL = args.has('--all');

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const election = getCurrentElection();
  const start = Date.now();

  log('╔══════════════════════════════════════════════╗');
  log('║       Election Cache Updater                 ║');
  log('╚══════════════════════════════════════════════╝');
  log(`Election: ${election.name} (${election.year})`);
  log(`Flags: ${FLAG_ALL ? '--all' : FLAG_SYMBOLS ? '--symbols' : '(none)'}`);
  log('');

  // ── 1. Bootstrap ECN session ──────────────────────────────────────
  log('🔐 Bootstrapping ECN session…');
  try {
    await bootstrapEcnSession();
  } catch (err) {
    errorLog(`Session bootstrap failed: ${(err as Error).message}`);
    errorLog('Cannot proceed without ECN access.');
    process.exit(1);
  }

  const reachable = await isEcnReachable();
  if (!reachable) {
    errorLog('ECN secure handler is not reachable after bootstrap.');
    errorLog('Check your network connection and try again.');
    process.exit(1);
  }
  log('✅ ECN session active and reachable.\n');

  // ── Paths ─────────────────────────────────────────────────────────
  const baseCacheDir = path.join(process.cwd(), 'public', 'cache');
  const yearCacheDir = path.join(baseCacheDir, String(election.year));
  await fsPromises.mkdir(yearCacheDir, { recursive: true });

  const candidatesFilename = path.basename(election.endpoints.candidates);
  const candidatesEcnPath = `JSONFiles/${candidatesFilename}`;
  const candidatesLocalPath = path.join(yearCacheDir, candidatesFilename);

  const districtLookupPath = path.join(yearCacheDir, 'districtLookup.json');
  const districtLookupEcnPath = `JSONFiles/Election${election.year}/Local/Lookup/districts.json`;

  const symbolsJsonPath = path.join(yearCacheDir, 'symbols.json');

  // ── 2. Download district lookup (if --all or missing) ─────────────
  if (FLAG_ALL || !(await fileExists(districtLookupPath))) {
    log('⬇️  Downloading district lookup…');
    try {
      const text = await ecnFetch(districtLookupEcnPath);
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        throw new Error('District lookup is not an array');
      }
      await fsPromises.writeFile(
        districtLookupPath,
        JSON.stringify(data, null, 2)
      );
      const size = await humanFileSize(districtLookupPath);
      log(`   ✅ Saved district lookup (${size}, ${data.length} districts)\n`);
    } catch (err) {
      errorLog(`Failed to download district lookup: ${(err as Error).message}`);
      if (await fileExists(districtLookupPath)) {
        log('   Using existing cached version.\n');
      } else {
        errorLog('No cached version available. Continuing anyway…\n');
      }
    }
  } else {
    const size = await humanFileSize(districtLookupPath);
    log(`📦 District lookup already cached (${size}), skipping.\n`);
  }

  // ── 3. Download candidate results ─────────────────────────────────
  log('⬇️  Downloading candidate results…');
  log(`   ECN path: ${candidatesEcnPath}`);

  // Back up the old file if it exists
  let backedUp = false;
  const backupPath = candidatesLocalPath + '.bak';
  if (await fileExists(candidatesLocalPath)) {
    const oldSize = await humanFileSize(candidatesLocalPath);
    log(`   Backing up existing file (${oldSize}) → .bak`);
    await fsPromises.copyFile(candidatesLocalPath, backupPath);
    backedUp = true;
  }

  try {
    const text = await ecnFetch(candidatesEcnPath, {
      timeoutMs: 120_000, // 2 minutes for the large file
    });

    // Validate JSON
    let data: any[];
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Response is not valid JSON');
    }

    if (!Array.isArray(data)) {
      throw new Error(`Expected array, got ${typeof data}`);
    }

    // Write the new file
    await fsPromises.writeFile(candidatesLocalPath, text);
    const newSize = await humanFileSize(candidatesLocalPath);

    // Count some stats
    const withVotes = data.filter((c: any) => (c.TotalVoteReceived ?? 0) > 0);
    const uniqueDistricts = new Set(
      data.map((c: any) => c.DistrictCd ?? c.DistrictName).filter(Boolean)
    );

    log(`   ✅ Saved candidate results (${newSize})`);
    log(`   📊 ${data.length} candidates total`);
    log(`   📊 ${withVotes.length} with votes`);
    log(`   📊 ${uniqueDistricts.size} districts`);

    // Check schema differences from old file
    if (data.length > 0) {
      const keys = Object.keys(data[0]);
      log(`   📋 Schema keys: ${keys.join(', ')}`);
    }

    // Remove backup on success
    if (backedUp) {
      await fsPromises.unlink(backupPath).catch(() => {});
    }

    log('');
  } catch (err) {
    errorLog(`Failed to download candidates: ${(err as Error).message}`);

    // Restore backup
    if (backedUp) {
      log('   Restoring backup…');
      await fsPromises.copyFile(backupPath, candidatesLocalPath);
      await fsPromises.unlink(backupPath).catch(() => {});
      log('   Backup restored.\n');
    }

    errorLog('Candidate data was not updated.\n');
  }

  // ── 4. Re-extract symbols.json (if --symbols or --all) ────────────
  if (FLAG_SYMBOLS || FLAG_ALL) {
    log('🔍 Extracting symbols from candidates data…');

    try {
      const text = await fsPromises.readFile(candidatesLocalPath, 'utf8');
      const candidates = JSON.parse(text);

      if (!Array.isArray(candidates)) {
        throw new Error('Candidates data is not an array');
      }

      const symbolMap = new Map<number, string>();
      for (const candidate of candidates) {
        // 2079 uses SymbolID, 2082 uses SYMBOLCODE — handle both
        const symbolId = candidate.SymbolID ?? candidate.SYMBOLCODE;
        const symbolName = candidate.SymbolName;

        if (
          typeof symbolId === 'number' &&
          symbolId > 0 &&
          typeof symbolName === 'string' &&
          symbolName.trim() !== ''
        ) {
          if (!symbolMap.has(symbolId)) {
            symbolMap.set(symbolId, symbolName.trim());
          }
        }
      }

      const symbols = Array.from(symbolMap.entries())
        .map(([symbolId, symbolName]) => ({ symbolId, symbolName }))
        .sort((a, b) => a.symbolId - b.symbolId);

      await fsPromises.writeFile(
        symbolsJsonPath,
        JSON.stringify(symbols, null, 2)
      );
      log(`   ✅ Saved ${symbols.length} symbols to symbols.json\n`);
    } catch (err) {
      errorLog(`Failed to extract symbols: ${(err as Error).message}\n`);
    }
  }

  // ── 5. Summary ────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log('╔══════════════════════════════════════════════╗');
  log('║       Update Complete                        ║');
  log('╚══════════════════════════════════════════════╝');
  log(`⏱  Finished in ${elapsed}s`);
  log('');
  log('Updated files:');

  const files = [
    candidatesLocalPath,
    districtLookupPath,
    ...(FLAG_SYMBOLS || FLAG_ALL ? [symbolsJsonPath] : []),
  ];

  for (const f of files) {
    if (await fileExists(f)) {
      const size = await humanFileSize(f);
      const rel = path.relative(process.cwd(), f);
      log(`   ✅ ${rel} (${size})`);
    }
  }

  log('');
  log('💡 Tip: Run with --symbols to also refresh symbols.json');
  log(
    '💡 Tip: Run with --all to refresh everything (lookup + candidates + symbols)'
  );
}

main().catch((err) => {
  errorLog('Unexpected error:', (err as Error).message);
  if ((err as Error).stack) {
    console.error((err as Error).stack);
  }
  process.exit(1);
});
