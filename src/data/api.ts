/**
 * src/data/api.ts
 *
 * Data fetching functions that use the centralized election configuration.
 * All API endpoints are now defined in src/config/elections.ts, making it
 * easy to support multiple elections.
 */

import { getCurrentElection } from '../config/elections';

/**
 * Fetch provinces GeoJSON from the current election's configuration.
 */
export async function fetchProvinces() {
  const election = getCurrentElection();
  const res = await fetch(election.endpoints.provinces);
  const data = await res.json();
  return data;
}

/**
 * Fetch districts GeoJSON for a specific province from the current election.
 */
export async function fetchDistricts(provinceId: number) {
  const election = getCurrentElection();
  const url = election.endpoints.districts(provinceId);
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

/**
 * Fetch constituencies GeoJSON for a specific district from the current election.
 */
export async function fetchConstituencies(districtId: number) {
  const election = getCurrentElection();
  const url = election.endpoints.constituencies(districtId);
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

/**
 * Fetch district lookup data (ID, name, parent province) from the current election.
 * Returns array of { id, name, parentId } objects.
 */
export async function fetchDistrictLookup() {
  const election = getCurrentElection();
  const url = election.endpoints.districtLookup;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch district lookup: ${res.status} ${res.statusText}`
    );
  }
  const data = await res.json();
  return data;
}

/**
 * Fetch district identifiers from the current election's lookup.
 * This is an alias for fetchDistrictLookup for backward compatibility.
 * Returns array of { id, name, parentId } objects.
 */
export async function fetchDistrictIdentifiers() {
  return fetchDistrictLookup();
}

/**
 * Fetch constituency identifiers from the current election's cache.
 * Returns array of { distId, consts } objects.
 */
export async function fetchConstituencyIdentifiers() {
  const election = getCurrentElection();
  const url = election.endpoints.constituencyIdentifiers;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch constituency identifiers: ${res.status} ${res.statusText}`
    );
  }
  const data = await res.json();
  return data;
}

/**
 * Fetch party symbols from the current election's cache.
 * Returns array of { symbolId, symbolName } objects.
 */
export async function fetchSymbols() {
  const election = getCurrentElection();
  const url = election.endpoints.symbolIdentifiers;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch symbols: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data;
}

/**
 * Fetch all candidate results from the current election.
 * This is the primary function to fetch election results data.
 *
 * The data includes all candidates with their votes, parties, symbols, etc.
 */
export async function fetchCandidates() {
  const election = getCurrentElection();
  const url = election.endpoints.candidates;

  const res = await fetch(url);

  // Check HTTP status early so we don't try to parse an error page as JSON
  if (!res.ok) {
    throw new Error(`fetchCandidates: HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();

  try {
    // If the server indicates JSON, parse accordingly. Otherwise still attempt to
    // parse but surface a helpful log containing the raw response on failure.
    if (contentType.includes('application/json')) {
      return JSON.parse(text);
    } else {
      // Try parsing anyway; many servers sometimes omit the correct content-type.
      return JSON.parse(text);
    }
  } catch (err) {
    // Log the start of the response to help debug cases where an HTML page
    // (e.g. index.html or an error page) is returned instead of JSON.
    console.error(
      '[fetchCandidates] failed to parse response as JSON; first 2000 chars:',
      text.slice(0, 2000)
    );
    throw new Error(`fetchCandidates: response is not valid JSON (${err})`);
  }
}

/**
 * Fetch results for a specific constituency from the current election.
 * This is a fallback in case we need per-constituency data.
 *
 * @param districtId - The district ID
 * @param constituencyId - The constituency ID
 */
/**
 * Fetch the national PR (Proportional Representation) aggregate data
 * from the current election's configuration.
 *
 * Returns an array of party-level vote totals across all constituencies.
 * Returns an empty array if the current election has no PR endpoint configured.
 */
export async function fetchPRNational(): Promise<unknown[]> {
  const election = getCurrentElection();
  const url = election.endpoints.prNational;

  if (!url) {
    return [];
  }

  const res = await fetch(url);

  if (!res.ok) {
    // PR data may not exist yet (e.g. 2082 before results are published).
    // Return empty rather than throwing so the app degrades gracefully.
    console.warn(
      `[fetchPRNational] HTTP ${res.status} for ${url} — returning empty array`
    );
    return [];
  }

  const text = await res.text();

  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    console.warn(
      '[fetchPRNational] Response is not valid JSON; first 500 chars:',
      text.slice(0, 500)
    );
    return [];
  }
}

export async function fetchConstituencyCandidates(
  districtId: number,
  constituencyId: number
) {
  const election = getCurrentElection();

  if (!election.endpoints.constituencyResults) {
    throw new Error(
      'Constituency-specific results URL not configured for this election'
    );
  }

  // Get the URL from the function
  const url = election.endpoints.constituencyResults(
    districtId,
    constituencyId
  );

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `fetchConstituencyCandidates: HTTP ${res.status} ${res.statusText}`
    );
  }
  const data = await res.json();
  return data;
}
