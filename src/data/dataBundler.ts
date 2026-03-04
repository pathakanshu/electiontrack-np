/**
 * src/data/dataBundler.ts
 *
 * Bundles raw election data from API into typed GeoJSON Feature objects.
 *
 * This module:
 * - Fetches data using functions from ./api.ts (which use election config)
 * - Caches identifier lookups lazily to avoid network activity at import time
 * - Transforms raw data into typed Feature structures for the app
 *
 * Exports:
 *  - bundleProvinces(): Promise<Province[]>
 *  - bundleDistricts(province_id): Promise<District[]>
 *  - bundleConstituencies(district_id): Promise<Constituency[]>
 *  - bundleCandidates(): Promise<Candidate[]>
 *  - bundleLeadingCandidates(candidates): Promise<Candidate[]>
 */

import {
  fetchProvinces,
  fetchDistricts,
  fetchConstituencies,
  fetchCandidates,
  fetchDistrictIdentifiers,
  fetchConstituencyIdentifiers,
  fetchSymbols,
} from './api';

import type {
  ProvinceFeature,
  Province,
  DistrictFeature,
  District,
  DistrictIdentifier,
  ConstituencyIdentifier,
  Constituency,
  ConstituencyFeature,
  Candidate,
  CandidateIdentifier,
} from '../types/election';

/**
 * Cache for lookup lists loaded lazily to avoid network activity at import time.
 * These are keyed to a specific election's endpoints, so they must be cleared
 * whenever the active election changes (see invalidateCache below).
 */
let _districtIdentifiers: DistrictIdentifier[] | null = null;
let _constituencyIdentifiers: ConstituencyIdentifier[] | null = null;
let _symbolMapping2079: Map<string, number> | null = null;

/**
 * Invalidate all module-level lazy caches.
 *
 * Call this before switching elections so that the next data load fetches
 * fresh identifiers from the newly active election's endpoints instead of
 * returning stale data from the previous election.
 *
 * This is called automatically by App.tsx via handleElectionChange.
 */
export function invalidateCache(): void {
  _districtIdentifiers = null;
  _constituencyIdentifiers = null;
  // Keep the 2079 symbol mapping — it's used for symbol recovery across all
  // elections and doesn't change when the active election changes.
}

/**
 * Fetch and cache district identifiers (lazy).
 * These map district IDs to their parent province IDs.
 */
export async function getDistrictIdentifiers(): Promise<DistrictIdentifier[]> {
  if (_districtIdentifiers) return _districtIdentifiers;

  try {
    const data = await fetchDistrictIdentifiers();
    _districtIdentifiers = data as DistrictIdentifier[];
    return _districtIdentifiers;
  } catch (err) {
    throw new Error(
      `Failed to fetch district identifiers: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Fetch and cache constituency identifiers (lazy).
 * These map district IDs to their constituency counts.
 */
async function getConstituencyIdentifiers(): Promise<ConstituencyIdentifier[]> {
  if (_constituencyIdentifiers) return _constituencyIdentifiers;

  try {
    const data = await fetchConstituencyIdentifiers();
    _constituencyIdentifiers = data as ConstituencyIdentifier[];
    return _constituencyIdentifiers;
  } catch (err) {
    throw new Error(
      `Failed to fetch constituency identifiers: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Fetch 2079 symbol mapping for recovery (lazy).
 */
async function getSymbolMapping2079(): Promise<Map<string, number>> {
  if (_symbolMapping2079) return _symbolMapping2079;

  try {
    const mapping = new Map<string, number>();
    // We fetch from the 2079 cache explicitly
    const res = await fetch('/cache/2079/symbols.json');
    if (res.ok) {
      const symbols = await res.json();
      for (const s of symbols) {
        if (s.symbolName && s.symbolId) {
          mapping.set(s.symbolName.trim(), s.symbolId);
        }
      }
    }
    _symbolMapping2079 = mapping;
    return _symbolMapping2079;
  } catch (err) {
    console.warn('[getSymbolMapping2079] Failed to load 2079 mapping:', err);
    return new Map();
  }
}

/**
 * Fetch and bundle all provinces as GeoJSON Features.
 */
export async function bundleProvinces(): Promise<Province[]> {
  // Ensure identifiers are available (lazy load)
  const districtIdentifiers = await getDistrictIdentifiers();

  // Fetch raw data
  const rawProvinces = await fetchProvinces();

  return rawProvinces.features.map((feature: ProvinceFeature) => {
    const province_id = feature.properties.STATE_C;
    const province_name = feature.properties.STATE_N;
    const geometry_coords = feature.geometry.coordinates;
    const district_ids: Array<number> = districtIdentifiers
      .filter((d) => d.parentId === province_id)
      .map((d) => d.id);

    return {
      type: 'Feature',
      properties: {
        province_id,
        name_np: province_name,
        name_en: null,
        district_ids,
      },
      geometry: {
        type: 'MultiPolygon',
        coordinates: geometry_coords,
      },
    } as Province;
  });
}

/**
 * Fetch and bundle all districts for a given province as GeoJSON Features.
 */
export async function bundleDistricts(
  province_id: number
): Promise<District[]> {
  // Ensure identifiers are available (lazy load)
  const constituencyIdentifiers = await getConstituencyIdentifiers();

  const rawDistricts = await fetchDistricts(province_id);
  return rawDistricts.features.map((feature: DistrictFeature) => {
    const district_id = feature.properties.DCODE;
    const district_name = feature.properties.DISTRICT_N;
    const geometry_coords = feature.geometry.coordinates;
    const province_id_local = feature.properties.STATE_C;
    const constituency_ids = constituencyIdentifiers
      .filter((c) => c.distId === district_id)
      .map((c) => Number(String(district_id) + String(c.consts)));

    return {
      type: 'Feature',
      properties: {
        district_id,
        province_id: province_id_local,
        name_np: district_name,
        name_en: null,
        constituency_ids,
      },
      geometry: {
        type: 'MultiPolygon',
        coordinates: geometry_coords,
      },
    } as District;
  });
}

/**
 * Fetch and bundle all constituencies for a given district as GeoJSON Features.
 */
export async function bundleConstituencies(
  district_id: number,
  district_name?: string
): Promise<Constituency[]> {
  const rawConstituencies = await fetchConstituencies(district_id);

  return rawConstituencies.map((feature: ConstituencyFeature) => {
    const district_id_local = feature.properties.DCODE;
    const province_id = feature.properties.STATE_C;
    const sub_id = feature.properties.F_CONST;
    const constituency_id = Number(String(district_id_local) + String(sub_id));
    const coordinates = feature.geometry.coordinates;
    const conservation_area = !!feature.properties.Conservati;
    const district_name_local = district_name || feature.properties.DISTRICT_N;

    return {
      type: 'Feature',
      id: constituency_id,
      properties: {
        constituency_id,
        district_id: district_id_local,
        district_name: district_name_local,
        sub_id,
        province_id,
        conservation_area,
      },
      geometry: {
        type: 'MultiPolygon',
        coordinates,
      },
    } as Constituency;
  });
}

/**
 * Fetch and bundle all candidates for the current election.
 */
export async function bundleCandidates(): Promise<Candidate[]> {
  const raw_candidates: CandidateIdentifier[] = await fetchCandidates();
  console.log(
    `[bundleCandidates] Fetched ${raw_candidates.length} raw candidates`
  );

  const districtIdentifiers = await getDistrictIdentifiers();
  const symbolMapping2079 = await getSymbolMapping2079();
  const missingPartySymbols = new Set<string>();

  // Create a map for name-based lookup (needed for 2074 data where DistrictCd is missing)
  const districtNameMap = new Map<string, number>();
  for (const d of districtIdentifiers) {
    // @ts-ignore - DistrictIdentifier usually has name from the lookup file
    if (d.name && d.id) {
      // @ts-ignore
      districtNameMap.set(d.name.trim(), d.id);
    }
  }

  let image_url = '';
  const bundled: Candidate[] = [];

  for (const candidate of raw_candidates) {
    const candidate_id = candidate.CandidateID;
    const constituency_number = candidate.SCConstID;
    const name_np = candidate.CandidateName;
    const party = candidate.PoliticalPartyName;
    const gender = candidate.Gender;
    const age = candidate.Age;
    const education = candidate.QUALIFICATION;
    const experience = candidate.EXPERIENCE;
    const image = image_url + candidate.CandidateID;
    const elected = !!candidate.Remarks;
    const votes = candidate.TotalVoteReceived;

    let district = candidate.DistrictCd;

    // Fallback: look up by name if DistrictCd is missing/zero (common in 2074 data)
    // @ts-ignore - DistrictName exists in 2074 data but might be missing from type
    if ((!district || district === 0) && candidate.DistrictName) {
      // @ts-ignore
      const mappedId = districtNameMap.get(candidate.DistrictName.trim());
      if (mappedId) {
        district = mappedId;
      } else {
        console.warn(
          `[bundleCandidates] Could not map district name "${candidate.DistrictName}" to an ID.`
        );
      }
    }

    if (!district) {
      // If we still don't have a district ID, we can't form a valid constituency ID.
      console.warn(
        `[bundleCandidates] Skipping candidate ${name_np} (${party}) due to missing District ID.`
      );
      continue;
    }

    const province = candidate.State;
    let symbolid = candidate.SymbolID;

    // Symbol Recovery: If symbol ID is 0, attempt to find it via 2079 mapping
    if (!symbolid || symbolid === 0) {
      // Try mapping by party name first, then by symbol name if available
      let recoveredId = symbolMapping2079.get(party.trim());

      // @ts-ignore - SymbolName might exist in raw 2074 data
      if (!recoveredId && candidate.SymbolName) {
        // @ts-ignore
        recoveredId = symbolMapping2079.get(candidate.SymbolName.trim());
      }

      if (recoveredId) {
        symbolid = recoveredId;
      } else if (party) {
        missingPartySymbols.add(party.trim());
      }
    }

    const a_candidate: Candidate = {
      candidate_id: candidate_id,
      name_en: null,
      name_np: name_np,
      age: age,
      gender: gender,
      image_url: image,
      constituency_id: Number(String(district) + String(constituency_number)),
      district: district,
      province: province,
      experience: experience,
      qualification: education,
      party: party,
      symbol_id: symbolid,
      votes: votes,
      elected: elected,
    };

    bundled.push(a_candidate);
  }

  bundled.sort((a, b) => {
    if (a.constituency_id === b.constituency_id) {
      return b.votes - a.votes;
    }
    return a.constituency_id - b.constituency_id;
  });

  if (missingPartySymbols.size > 0) {
    console.warn(
      '[bundleCandidates] Parties with no symbol mapping found in 2079 cache:',
      Array.from(missingPartySymbols).sort()
    );
  }

  console.log(`[bundleCandidates] Bundled ${bundled.length} valid candidates.`);
  return bundled;
}

/**
 * Extract the leading (highest vote) candidate from each constituency.
 *
 * @param candidates - Array of all candidates (should be sorted by votes)
 * @returns Array of one candidate per constituency (the one with most votes)
 */
export async function bundleLeadingCandidates(
  candidates: Candidate[]
): Promise<Candidate[]> {
  // do not loop candidates whose Constituency is already bundled
  const bundled: Candidate[] = [];
  const seen = new Set();

  console.log(
    `[bundleLeadingCandidates] Processing ${candidates.length} candidates to find winners...`
  );

  for (const this_candidate of candidates) {
    // Skip if the constituency is already bundled
    if (seen.has(this_candidate.constituency_id)) continue;

    // Find the leading candidate in the same constituency
    // This works because we have sorted the candidates by votes in descending order
    const leading_candidate = candidates.find(
      (candidate) =>
        candidate.constituency_id === this_candidate.constituency_id
    );
    if (leading_candidate) {
      bundled.push(leading_candidate);
      seen.add(leading_candidate.constituency_id);
    }
  }

  console.log(
    `[bundleLeadingCandidates] Found ${bundled.length} leading candidates (constituency winners).`
  );
  return bundled;
}
