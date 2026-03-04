/**
 * scripts/download-cache.ts
 *
 * Download and cache election data files locally.
 * This includes:
 * - District identifiers (districts.json)
 * - Constituency identifiers (constituencies.json)
 * - Party symbols (symbols.json)
 *
 * Run with:
 *   npx ts-node scripts/download-cache.ts
 *
 * Configuration is hardcoded here; update the ELECTION_YEAR and URLs below
 * to download data for different elections.
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

/**
 * Configuration for which election data to download.
 * Update these values to download different election data.
 */
const ELECTION_CONFIG = {
  year: 2079,
  candidatesUrl: '/cache/ElectionResultCentral2079.txt', // Local cache (already exists)
  // If you want to download from remote instead, use:
  // candidatesUrl: 'https://result.election.gov.np/JSONFiles/ElectionResultCentral2079.txt',
};

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

interface DistrictIdentifier {
  distId: number;
  consts: number;
}

interface ConstituencyIdentifier {
  distId: number;
  consts: number;
}

interface CandidateRecord {
  SymbolID: number;
  SymbolName: string;
  DistrictCd: number;
  DistrictName: string;
  State: number;
  SCConstID: string;
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

    // Use a Map to deduplicate symbols by ID
    const symbolMap = new Map<number, Symbol>();

    for (const candidate of candidates) {
      const symbolId = candidate.SymbolID;
      const symbolName = candidate.SymbolName;

      if (typeof symbolId === 'number' && typeof symbolName === 'string') {
        if (!symbolMap.has(symbolId)) {
          symbolMap.set(symbolId, {
            symbolId,
            symbolName,
          });
        }
      }
    }

    const symbols = Array.from(symbolMap.values()).sort(
      (a, b) => a.symbolId - b.symbolId
    );

    log(`✅ Extracted ${symbols.length} unique symbols`);
    return symbols;
  } catch (err) {
    throw new Error(`Failed to extract symbols: ${(err as Error).message}`);
  }
}

/**
 * Extract district identifiers from candidates data.
 * Returns array of { distId, consts } (district ID and constituency count).
 */
async function extractDistrictIdentifiers(
  candidatesPath: string
): Promise<DistrictIdentifier[]> {
  try {
    log('🔍 Extracting district identifiers from candidates data...');

    const text = await fsPromises.readFile(candidatesPath, 'utf8');
    const candidates = JSON.parse(text);

    if (!Array.isArray(candidates)) {
      throw new Error('Candidates data is not an array');
    }

    // Map to track { districtId -> Set of constituencies }
    const districtMap = new Map<number, Set<number>>();

    for (const candidate of candidates) {
      const districtId = candidate.DistrictCd;
      const constituencyId = candidate.SCConstID;

      if (typeof districtId === 'number' && constituencyId != null) {
        const constId =
          typeof constituencyId === 'string'
            ? parseInt(constituencyId, 10)
            : constituencyId;
        if (!isNaN(constId)) {
          if (!districtMap.has(districtId)) {
            districtMap.set(districtId, new Set());
          }
          districtMap.get(districtId)!.add(constId);
        }
      }
    }

    // Convert to array format: { distId, consts }
    const districts = Array.from(districtMap.entries())
      .map(([distId, constSet]) => ({
        distId,
        consts: constSet.size,
      }))
      .sort((a, b) => a.distId - b.distId);

    log(`✅ Extracted ${districts.length} districts with constituency counts`);
    return districts;
  } catch (err) {
    throw new Error(
      `Failed to extract district identifiers: ${(err as Error).message}`
    );
  }
}

/**
 * Extract constituency identifiers from candidates data.
 * Returns array of { distId, consts } (district ID and consecutive constituency number).
 */
async function extractConstituencyIdentifiers(
  candidatesPath: string
): Promise<ConstituencyIdentifier[]> {
  try {
    log('🔍 Extracting constituency identifiers from candidates data...');

    const text = await fsPromises.readFile(candidatesPath, 'utf8');
    const candidates = JSON.parse(text);

    if (!Array.isArray(candidates)) {
      throw new Error('Candidates data is not an array');
    }

    // Set to track unique { distId, consts } pairs
    const constituencySet = new Set<string>();

    for (const candidate of candidates) {
      const districtId = candidate.DistrictCd;
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

async function run() {
  const start = Date.now();
  log('Starting cache download...');
  log(`Processing election year: ${ELECTION_CONFIG.year}`);

  try {
    const cacheDir = path.join(process.cwd(), 'public', 'cache');
    await fsPromises.mkdir(cacheDir, { recursive: true });

    const candidatesPath = path.join(
      cacheDir,
      `ElectionResultCentral${ELECTION_CONFIG.year}.txt`
    );

    // Check if candidates file exists
    const candidatesExist = await fileExists(candidatesPath);
    if (!candidatesExist) {
      throw new Error(
        `Candidates file not found at ${candidatesPath}\n` +
          'Please download the candidates data first using:\n' +
          `  curl -o ${candidatesPath} "${ELECTION_CONFIG.candidatesUrl}"`
      );
    }

    const size = await humanFileSize(candidatesPath);
    log(`📦 Using candidates data: ${candidatesPath} (${size})`);

    // Step 1: Extract and save symbols
    log('\n📦 Processing symbols...');
    const symbols = await extractSymbols(candidatesPath);
    const symbolsPath = path.join(cacheDir, 'symbols.json');
    await fsPromises.writeFile(symbolsPath, JSON.stringify(symbols, null, 2));
    log(`✅ Saved ${symbols.length} symbols to symbols.json`);

    // Step 2: Extract and save district identifiers
    log('\n📦 Processing district identifiers...');
    const districtIds = await extractDistrictIdentifiers(candidatesPath);
    const districtIdPath = path.join(cacheDir, 'districts.json');
    await fsPromises.writeFile(
      districtIdPath,
      JSON.stringify(districtIds, null, 2)
    );
    log(`✅ Saved ${districtIds.length} districts to districts.json`);

    // Step 3: Extract and save constituency identifiers
    log('\n📦 Processing constituency identifiers...');
    const constituencyIds =
      await extractConstituencyIdentifiers(candidatesPath);
    const constituencyIdPath = path.join(cacheDir, 'constituencies.json');
    await fsPromises.writeFile(
      constituencyIdPath,
      JSON.stringify(constituencyIds, null, 2)
    );
    log(
      `✅ Saved ${constituencyIds.length} constituencies to constituencies.json`
    );

    const totalTime = (Date.now() - start) / 1000;
    log(
      `\n✨ Cache download completed successfully in ${totalTime.toFixed(2)}s`
    );
    log('\n📝 Summary of generated files:');
    log('   /public/cache/symbols.json');
    log('   /public/cache/districts.json');
    log('   /public/cache/constituencies.json');
    log('\nThese files are used by the app to optimize data loading.');

    process.exit(0);
  } catch (err) {
    const e = err as Error;
    errorLog('Cache download failed:', e.message);
    if (e.stack) {
      const stack = e.stack.split('\n').slice(0, 6).join('\n');
      errorLog(stack);
    }
    errorLog('\nTroubleshooting tips:');
    errorLog(' - Ensure ElectionResultCentral2079.txt exists in /public/cache');
    errorLog(' - Check that /public/cache directory is writable');
    errorLog(' - Verify the candidates file is valid JSON');
    process.exit(1);
  }
}

run();
