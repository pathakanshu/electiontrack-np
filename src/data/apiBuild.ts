/**
 * src/data/apiBuild.ts
 *
 * Build-time API functions that read from the filesystem directly.
 * This is used during the build process (generate-geometry.ts) when
 * fetch() cannot be used with relative URLs.
 *
 * Usage:
 * - Import in scripts/generate-geometry.ts
 * - Use instead of the regular api.ts functions during build
 * - Reads cache files directly from disk
 */

import fs from 'fs';
import path from 'path';
import { getCurrentElection } from '../config/elections';

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
