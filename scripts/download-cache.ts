/**
 * scripts/download-cache.ts
 *
 * Download and cache election data locally.
 * This includes:
 * - District lookup (ID, name, province) - downloaded from Election Commission API
 * - Symbol images (downloaded from Election Commission API)
 * - Symbols metadata (symbols.json)
 * - Constituency identifiers (constituencies.json)
 *
 * The ECN now serves data through a secure handler requiring a CSRF token.
 * This script tries the secure handler first (via ecn-session.ts), then
 * falls back to the old direct URLs if that fails.
 *
 * Run with:
 *   npx tsx scripts/download-cache.ts
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

import { getCurrentElection } from '../src/config/elections';
import {
  bootstrapEcnSession,
  ecnFetch as ecnSessionFetch,
  isEcnReachable,
} from './ecn-session';

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

interface Symbol {
  symbolId: number;
  symbolName: string;
}

interface ConstituencyIdentifier {
  distId: number;
  consts: number;
}

interface CandidateRecord {
  SymbolID: number;
  SymbolName: string;
  SCConstID: string;
}

/**
 * Download district lookup from Election Commission API and cache it.
 */
/**
 * Whether the ECN secure handler is available for this run.
 * Set once at the start of downloadCache() and reused throughout.
 */
let ecnAvailable = false;

/**
 * Try fetching text via the ECN secure handler, falling back to a direct URL.
 *
 * @param ecnFilePath  Path for the secure handler, e.g. "JSONFiles/Election2082/Local/Lookup/districts.json"
 * @param directUrl    Direct URL fallback (old-style), e.g. "https://result.election.gov.np/JSONFiles/..."
 * @returns The response text.
 */
async function fetchWithFallback(
  ecnFilePath: string | null,
  directUrl: string
): Promise<string> {
  // Try ECN secure handler first
  if (ecnAvailable && ecnFilePath) {
    try {
      const text = await ecnSessionFetch(ecnFilePath);
      return text;
    } catch (err) {
      log(
        `   ⚠️  ECN handler failed for "${ecnFilePath}": ${(err as Error).message}`
      );
      log(`   Falling back to direct URL…`);
    }
  }

  // Fallback: direct URL
  const response = await fetch(directUrl);
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${directUrl}`
    );
  }
  return response.text();
}

async function downloadDistrictLookup(
  url: string,
  ecnFilePath: string,
  outputPath: string
): Promise<void> {
  try {
    log('\n⬇️  Downloading district lookup...');
    log(`   ECN path: ${ecnFilePath}`);
    log(`   Fallback URL: ${url}`);

    const text = await fetchWithFallback(ecnFilePath, url);
    const data = JSON.parse(text);

    // Ensure it's an array
    if (!Array.isArray(data)) {
      throw new Error('District lookup data is not an array');
    }

    await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    await fsPromises.writeFile(outputPath, JSON.stringify(data, null, 2));

    const size = await humanFileSize(outputPath);
    log(
      `✅ Downloaded and cached district lookup (${size}, ${data.length} districts)`
    );
  } catch (err) {
    throw new Error(
      `Failed to download district lookup: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Download candidates data (large result file).
 */
async function downloadCandidates(
  url: string,
  ecnFilePath: string,
  outputPath: string
): Promise<void> {
  try {
    log('\n⬇️  Downloading candidates data...');
    log(`   ECN path: ${ecnFilePath}`);
    log(`   Fallback URL: ${url}`);

    const text = await fetchWithFallback(ecnFilePath, url);

    // Verify valid JSON before saving
    try {
      JSON.parse(text);
    } catch {
      throw new Error('Downloaded data is not valid JSON');
    }

    await fsPromises.writeFile(outputPath, text);

    const size = await humanFileSize(outputPath);
    log(`✅ Downloaded and cached candidates data (${size})`);
  } catch (err) {
    throw new Error(
      `Failed to download candidates data: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Extract unique symbols from the candidate results data.
 */
async function extractSymbols(candidatesPath: string): Promise<Symbol[]> {
  try {
    log('🔍 Extracting symbols from candidates data...');

    const text = await fsPromises.readFile(candidatesPath, 'utf8');
    const candidates = JSON.parse(text);

    if (!Array.isArray(candidates)) {
      throw new Error('Candidates data is not an array');
    }

    const symbolMap = new Map<number, string>();

    for (const candidate of candidates) {
      // 2079 uses SymbolID, 2082 uses SYMBOLCODE
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

    log(`✅ Extracted ${symbols.length} unique symbols`);
    return symbols;
  } catch (err) {
    throw new Error(`Failed to extract symbols: ${(err as Error).message}`);
  }
}

/**
 * Download symbol images from Election Commission API.
 */
async function downloadSymbolImages(
  baseUrl: string,
  symbols: Symbol[],
  outputDir: string
): Promise<void> {
  try {
    log(`\n⬇️  Downloading ${symbols.length} symbol images...`);
    log(`   Destination: ${outputDir}`);

    await fsPromises.mkdir(outputDir, { recursive: true });

    let downloaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const symbol of symbols) {
      const imageUrl = `${baseUrl}/${symbol.symbolId}.jpg`;
      const imagePath = path.join(outputDir, `${symbol.symbolId}.jpg`);

      try {
        // Check if already cached
        if (await fileExists(imagePath)) {
          skipped++;
          continue;
        }

        log(`   ⬇️  ${imageUrl}`);
        const response = await fetch(imageUrl);
        if (!response.ok) {
          errorLog(
            `   ⚠️  Failed ${symbol.symbolId} (${symbol.symbolName}): HTTP ${response.status} — ${imageUrl}`
          );
          failed++;
          continue;
        }

        const buffer = await response.arrayBuffer();
        await fsPromises.writeFile(imagePath, Buffer.from(buffer));
        downloaded++;
      } catch (err) {
        errorLog(
          `   ⚠️  Error ${symbol.symbolId} (${symbol.symbolName}): ${err instanceof Error ? err.message : String(err)} — ${imageUrl}`
        );
        failed++;
      }
    }

    log(
      `✅ Symbols: ${downloaded} new, ${skipped} cached, ${failed} failed (${symbols.length} total)`
    );
    if (failed > 0) {
      log(
        `⚠️  ${failed} images failed — they may not be available on the server yet`
      );
    }
  } catch (err) {
    throw new Error(
      `Failed to download symbol images: ${(err as Error).message}`
    );
  }
}

/**
 * Extract constituency identifiers from candidates data.
 */
async function extractConstituencyIdentifiers(
  candidatesPath: string,
  districtLookupPath: string
): Promise<ConstituencyIdentifier[]> {
  try {
    log('\n🔍 Extracting constituency identifiers from candidates data...');

    const text = await fsPromises.readFile(candidatesPath, 'utf8');
    const candidates = JSON.parse(text);

    // Create a map of district names to IDs from the lookup file
    // This handles cases (like 2074) where candidates data lacks DistrictCd
    const districtNameMap = new Map<string, number>();
    try {
      if (await fileExists(districtLookupPath)) {
        const lookupText = await fsPromises.readFile(
          districtLookupPath,
          'utf8'
        );
        const lookup = JSON.parse(lookupText);
        if (Array.isArray(lookup)) {
          for (const d of lookup) {
            if (d.name && d.id) {
              // Normalize name just in case
              districtNameMap.set(d.name.trim(), d.id);
            }
          }
        }
      }
    } catch (err) {
      log(
        `⚠️  Warning: Could not read district lookup for name mapping: ${(err as Error).message}`
      );
    }

    if (!Array.isArray(candidates)) {
      throw new Error('Candidates data is not an array');
    }

    const constituencySet = new Set<string>();

    for (const candidate of candidates) {
      let districtId = candidate.DistrictCd;

      // Fallback: look up by name if DistrictCd is missing
      if (!districtId && candidate.DistrictName) {
        districtId = districtNameMap.get(candidate.DistrictName.trim());
      }

      const constituencyId = candidate.SCConstID;

      if (typeof districtId === 'number' && constituencyId != null) {
        const constId =
          typeof constituencyId === 'string'
            ? parseInt(constituencyId, 10)
            : constituencyId;
        if (!isNaN(constId)) {
          constituencySet.add(`${districtId},${constId}`);
        }
      }
    }

    const constituencies = Array.from(constituencySet)
      .map((pair) => {
        const [distId, consts] = pair.split(',').map(Number);
        return { distId, consts };
      })
      .sort((a, b) =>
        a.distId === b.distId ? a.consts - b.consts : a.distId - b.distId
      );

    log(`✅ Extracted ${constituencies.length} unique constituencies`);
    return constituencies;
  } catch (err) {
    throw new Error(
      `Failed to extract constituency identifiers: ${(err as Error).message}`
    );
  }
}

export async function downloadCache() {
  const election = getCurrentElection();
  const start = Date.now();
  log('Starting cache download...');
  log(`Processing election year: ${election.year}`);

  // ── Bootstrap ECN session ──
  try {
    log('\n🔐 Attempting ECN secure session bootstrap…');
    await bootstrapEcnSession();
    ecnAvailable = await isEcnReachable();
    if (ecnAvailable) {
      log('✅ ECN secure handler is reachable — will use it for downloads.');
    } else {
      log(
        '⚠️  ECN secure handler not reachable — will use direct URLs as fallback.'
      );
    }
  } catch (err) {
    log(`⚠️  ECN bootstrap failed: ${(err as Error).message}`);
    log('   Will use direct URLs as fallback.');
    ecnAvailable = false;
  }

  try {
    const baseCacheDir = path.join(process.cwd(), 'public', 'cache');
    const yearCacheDir = path.join(baseCacheDir, String(election.year));
    const symbolsDir = path.join(baseCacheDir, 'symbols');

    await fsPromises.mkdir(yearCacheDir, { recursive: true });

    // Derive the ECN file path for the candidates result file
    const candidatesFilename = path.basename(election.endpoints.candidates);
    const candidatesEcnPath = `JSONFiles/${candidatesFilename}`;
    const candidatesPath = path.join(yearCacheDir, candidatesFilename);

    if (!(await fileExists(candidatesPath))) {
      if (election.source.candidates) {
        await downloadCandidates(
          election.source.candidates,
          candidatesEcnPath,
          candidatesPath
        );
      } else {
        throw new Error(
          `Candidates file not found at ${candidatesPath} and no source URL configured.`
        );
      }
    }

    const size = await humanFileSize(candidatesPath);
    log(`📦 Using candidates data: ${candidatesPath} (${size})`);

    // Step 1: Download district lookup (skip if already cached)
    const districtLookupPath = path.join(yearCacheDir, 'districtLookup.json');
    const districtLookupEcnPath = `JSONFiles/Election${election.year}/Local/Lookup/districts.json`;
    if (await fileExists(districtLookupPath)) {
      const dlSize = await humanFileSize(districtLookupPath);
      log(`📦 District lookup already cached (${dlSize}), skipping download.`);
    } else {
      await downloadDistrictLookup(
        election.source.districtLookup,
        districtLookupEcnPath,
        districtLookupPath
      );
    }

    // Step 2: Extract symbols metadata
    log('\n📦 Processing symbols...');
    const symbols = await extractSymbols(candidatesPath);
    const symbolsJsonPath = path.join(yearCacheDir, 'symbols.json');
    await fsPromises.writeFile(
      symbolsJsonPath,
      JSON.stringify(symbols, null, 2)
    );
    log(`✅ Saved ${symbols.length} symbols metadata to symbols.json`);

    // Step 3: Download symbol images
    await downloadSymbolImages(
      election.source.symbolImages,
      symbols,
      symbolsDir
    );

    // Step 4: Extract and save constituency identifiers
    const constituencyIds = await extractConstituencyIdentifiers(
      candidatesPath,
      districtLookupPath
    );
    const constituencyIdPath = path.join(yearCacheDir, 'constituencies.json');
    await fsPromises.writeFile(
      constituencyIdPath,
      JSON.stringify(constituencyIds, null, 2)
    );
    log(
      `✅ Saved ${constituencyIds.length} constituencies to constituencies.json`
    );

    // Step 5: Download PR national aggregate (if configured for this election)
    if (election.source.prNational) {
      const prFilename = 'PRHoRPartyTop5.txt';
      const prOutputPath = path.join(yearCacheDir, prFilename);
      const prEcnPath = `JSONFiles/Election${election.year}/Common/${prFilename}`;

      if (await fileExists(prOutputPath)) {
        const prSize = await humanFileSize(prOutputPath);
        log(
          `\n📦 PR national aggregate already cached (${prSize}), skipping download.`
        );
      } else {
        try {
          log('\n⬇️  Downloading PR national aggregate...');
          log(`   ECN path: ${prEcnPath}`);
          log(`   Fallback URL: ${election.source.prNational}`);

          const text = await fetchWithFallback(
            prEcnPath,
            election.source.prNational
          );

          // Verify valid JSON before saving
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            log(
              '⚠️  PR national data is not an array — skipping (may not be published yet).'
            );
          } else {
            await fsPromises.writeFile(prOutputPath, text);
            const prSize = await humanFileSize(prOutputPath);
            log(
              `✅ Downloaded and cached PR national aggregate (${prSize}, ${parsed.length} parties)`
            );
          }
        } catch (err) {
          // PR data is optional — log but don't fail the entire cache download.
          log(
            `⚠️  Could not download PR national aggregate: ${(err as Error).message}`
          );
          log('   This is non-fatal — FPTP data was downloaded successfully.');
        }
      }
    } else {
      log(
        '\nℹ️  No PR source URL configured for this election — skipping PR download.'
      );
    }

    const totalTime = (Date.now() - start) / 1000;
    log(
      `\n✨ Cache download completed successfully in ${totalTime.toFixed(2)}s`
    );
    log('\n📝 Summary of generated files:');
    log(`   /public/cache/${election.year}/districtLookup.json`);
    log(`   /public/cache/${election.year}/symbols.json`);
    log('   /public/cache/symbols/ (shared images)');
    log(`   /public/cache/${election.year}/constituencies.json`);
    if (election.source.prNational) {
      log(`   /public/cache/${election.year}/PRHoRPartyTop5.txt`);
    }
    log('\nAll data is now cached locally for offline use.');
  } catch (err) {
    const e = err as Error;
    errorLog('Cache download failed:', e.message);
    if (e.stack) {
      const stack = e.stack.split('\n').slice(0, 6).join('\n');
      errorLog(stack);
    }
    errorLog('\nTroubleshooting tips:');
    errorLog(' - Check that /public/cache directory is writable');
    errorLog(' - Verify internet connection for downloading data');
    throw e;
  }
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('download-cache.ts')) {
  downloadCache().catch(() => process.exit(1));
}
