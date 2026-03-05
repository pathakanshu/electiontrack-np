/**
 * src/data/apiBuild.ts
 *
 * Build-time API functions that read from the filesystem directly,
 * with fallback to the ECN secure handler for remote data (GeoJSON).
 *
 * This is used during the build process (generate-geometry.ts) when
 * browser fetch() cannot be used with relative URLs.
 *
 * Usage:
 * - Import in scripts/generate-geometry.ts / dataBundlerBuild.ts
 * - Use instead of the regular api.ts functions during build
 * - Reads cache files directly from disk
 * - Fetches GeoJSON from ECN via secure session when direct URLs fail
 */

import fs from 'fs';
import path from 'path';
import { getCurrentElection } from '../config/elections';
import { bootstrapEcnSession, ecnFetchJson } from '../../scripts/ecn-session';

/**
 * Read and parse a JSON file from disk.
 */
async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Resolve a cache file path relative to public/cache/.
 */
function getCachePath(filename: string): string {
  const election = getCurrentElection();
  return path.join(process.cwd(), 'public', 'cache', election.id, filename);
}

/**
 * Build-time: Fetch district identifiers from local cache file.
 */
export async function fetchDistrictIdentifiersBuild(): Promise<any> {
  const filePath = getCachePath('districtLookup.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cache file not found: ${filePath}`);
  }
  return readJsonFile(filePath);
}

/**
 * Build-time: Fetch constituency identifiers from local cache file.
 */
export async function fetchConstituencyIdentifiersBuild(): Promise<any> {
  const filePath = getCachePath('constituencies.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cache file not found: ${filePath}`);
  }
  return readJsonFile(filePath);
}

/**
 * Build-time: Fetch symbols from local cache file.
 */
export async function fetchSymbolsBuild(): Promise<any> {
  const filePath = getCachePath('symbols.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cache file not found: ${filePath}`);
  }
  return readJsonFile(filePath);
}

// ── ECN-aware GeoJSON fetchers (for generate-geometry) ──────────────────

/**
 * Whether the ECN session has been bootstrapped for this process.
 * Lazily initialised on first GeoJSON fetch attempt.
 */
let ecnBootstrapped = false;

/**
 * Ensure the ECN session is ready. No-ops on subsequent calls.
 */
async function ensureEcnSession(): Promise<void> {
  if (ecnBootstrapped) return;
  try {
    await bootstrapEcnSession();
    ecnBootstrapped = true;
  } catch (err) {
    console.warn(
      '[apiBuild] ECN session bootstrap failed:',
      (err as Error).message
    );
  }
}

/**
 * Try fetching JSON from a direct URL first. If that fails (404, HTML
 * response, etc.), fall back to the ECN secure handler.
 */
async function fetchJsonWithEcnFallback(
  directUrl: string,
  ecnFilePath: string
): Promise<any> {
  // Try direct URL first
  try {
    const res = await fetch(directUrl);
    if (res.ok) {
      const text = await res.text();
      if (
        text.trimStart().startsWith('[') ||
        text.trimStart().startsWith('{')
      ) {
        return JSON.parse(text);
      }
    }
  } catch {
    // Direct URL failed — fall through to ECN
  }

  // Fall back to ECN secure handler
  await ensureEcnSession();
  return ecnFetchJson(ecnFilePath);
}

/**
 * Build-time: Fetch provinces GeoJSON.
 * Tries the direct URL, then falls back to the ECN secure handler.
 */
export async function fetchProvincesBuild(): Promise<any> {
  const election = getCurrentElection();
  return fetchJsonWithEcnFallback(
    election.endpoints.provinces,
    'JSONFiles/JSONMap/geojson/Province.json'
  );
}

/**
 * Build-time: Fetch districts GeoJSON for a given province.
 */
export async function fetchDistrictsBuild(provinceId: number): Promise<any> {
  const election = getCurrentElection();
  return fetchJsonWithEcnFallback(
    election.endpoints.districts(provinceId),
    `JSONFiles/JSONMap/geojson/District/STATE_C_${provinceId}.json`
  );
}

/**
 * Build-time: Fetch constituencies GeoJSON for a given district.
 */
export async function fetchConstituenciesBuild(
  districtId: number
): Promise<any> {
  const election = getCurrentElection();
  return fetchJsonWithEcnFallback(
    election.endpoints.constituencies(districtId),
    `JSONFiles/JSONMap/geojson/Const/dist-${districtId}.json`
  );
}
