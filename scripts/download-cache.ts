/**
 * scripts/download-cache.ts
 *
 * Download and cache election data locally.
 * This includes:
 * - Symbol images (downloaded from Election Commission API)
 * - Symbols metadata (symbols.json)
 * - Constituency identifiers (constituencies.json)
 *
 * Run with:
 *   npx ts-node scripts/download-cache.ts
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
  candidatesUrl: '/cache/ElectionResultCentral2079.txt',
  symbolImageBaseUrl: 'https://result.election.gov.np/Images/symbol-hor-pa',
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

interface ConstituencyIdentifier {
  distId: number;
  consts: number;
}

interface CandidateRecord {
  SymbolID: number;
  SymbolName: string;
  DistrictCd: number;
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

    const symbolMap = new Map<number, string>();

    for (const candidate of candidates) {
      const symbolId = candidate.SymbolID;
      const symbolName = candidate.SymbolName;

      if (typeof symbolId === 'number' && typeof symbolName === 'string') {
        if (!symbolMap.has(symbolId)) {
          symbolMap.set(symbolId, symbolName);
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
  symbols: Symbol[],
  outputDir: string
): Promise<void> {
  try {
    log(`\n⬇️  Downloading ${symbols.length} symbol images...`);
    log(`   Destination: ${outputDir}`);

    await fsPromises.mkdir(outputDir, { recursive: true });

    let downloaded = 0;
    let failed = 0;

    for (const symbol of symbols) {
      const imageUrl = `${ELECTION_CONFIG.symbolImageBaseUrl}/${symbol.symbolId}.jpg`;
      const imagePath = path.join(outputDir, `${symbol.symbolId}.jpg`);

      try {
        // Check if already cached
        if (await fileExists(imagePath)) {
          downloaded++;
          continue;
        }

        const response = await fetch(imageUrl);
        if (!response.ok) {
          errorLog(
            `   ⚠️  Failed to download symbol ${symbol.symbolId}: HTTP ${response.status}`
          );
          failed++;
          continue;
        }

        const buffer = await response.arrayBuffer();
        await fsPromises.writeFile(imagePath, Buffer.from(buffer));
        downloaded++;

        if (downloaded % 10 === 0) {
          log(`   ⏳ Downloaded ${downloaded}/${symbols.length} symbols...`);
        }
      } catch (err) {
        errorLog(
          `   ⚠️  Error downloading symbol ${symbol.symbolId}: ${err instanceof Error ? err.message : String(err)}`
        );
        failed++;
      }
    }

    log(`✅ Downloaded ${downloaded} symbol images`);
    if (failed > 0) {
      log(
        `⚠️  Failed to download ${failed} images (they may not be available)`
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
  candidatesPath: string
): Promise<ConstituencyIdentifier[]> {
  try {
    log('\n🔍 Extracting constituency identifiers from candidates data...');

    const text = await fsPromises.readFile(candidatesPath, 'utf8');
    const candidates = JSON.parse(text);

    if (!Array.isArray(candidates)) {
      throw new Error('Candidates data is not an array');
    }

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
    const symbolsDir = path.join(cacheDir, 'symbols');

    await fsPromises.mkdir(cacheDir, { recursive: true });

    const candidatesPath = path.join(
      cacheDir,
      `ElectionResultCentral${ELECTION_CONFIG.year}.txt`
    );

    const candidatesExist = await fileExists(candidatesPath);
    if (!candidatesExist) {
      throw new Error(
        `Candidates file not found at ${candidatesPath}\n` +
          'Please download the candidates data first.'
      );
    }

    const size = await humanFileSize(candidatesPath);
    log(`📦 Using candidates data: ${candidatesPath} (${size})`);

    // Step 1: Extract symbols metadata
    log('\n📦 Processing symbols...');
    const symbols = await extractSymbols(candidatesPath);
    const symbolsJsonPath = path.join(cacheDir, 'symbols.json');
    await fsPromises.writeFile(
      symbolsJsonPath,
      JSON.stringify(symbols, null, 2)
    );
    log(`✅ Saved ${symbols.length} symbols metadata to symbols.json`);

    // Step 2: Download symbol images
    await downloadSymbolImages(symbols, symbolsDir);

    // Step 3: Extract and save constituency identifiers
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
    log('   /public/cache/symbols/ (115 .jpg images)');
    log('   /public/cache/constituencies.json');
    log('\nSymbol images are now cached locally for offline use.');

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
    errorLog(' - Verify internet connection for downloading symbol images');
    process.exit(1);
  }
}

run();
