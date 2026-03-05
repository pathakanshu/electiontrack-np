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
  fetchPRNational,
} from './api';

import { normalizedLookup, normalizeMapKeys } from '../utils/normalize';

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
  PRPartyAggregateRaw,
  PRPartyAggregate,
} from '../types/election';

import en, { type UiStringKey } from '../i18n/en';

/**
 * Cache for lookup lists loaded lazily to avoid network activity at import time.
 * These are keyed to a specific election's endpoints, so they must be cleared
 * whenever the active election changes (see invalidateCache below).
 */
let _districtIdentifiers: DistrictIdentifier[] | null = null;
let _constituencyIdentifiers: ConstituencyIdentifier[] | null = null;
let _symbolMapping2079: Map<string, number> | null = null;
let _candidateNameTranslations: Record<string, string> | null = null;
let _partyNameTranslations: Record<string, string> | null = null;

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
 * Fetch and cache the Nepali→English party name translation map (lazy).
 * The JSON lives at /cache/party_names_np-en.json and is keyed by
 * Nepali party name with the English name as the value.
 *
 * This uses the same approach as candidate name translations — a single
 * JSON lookup file resolved at bundle time — so that party names and
 * candidate names are translated consistently.
 */
async function getPartyNameTranslations(): Promise<Record<string, string>> {
  if (_partyNameTranslations) return _partyNameTranslations;

  try {
    const res = await fetch('/cache/party_names_np-en.json');
    if (res.ok) {
      const rawMap = await res.json();
      _partyNameTranslations = normalizeMapKeys(rawMap);
    } else {
      console.warn(
        '[getPartyNameTranslations] Failed to load translation file:',
        res.status
      );
      _partyNameTranslations = {};
    }
  } catch (err) {
    console.warn('[getPartyNameTranslations] Error loading translations:', err);
    _partyNameTranslations = {};
  }

  return _partyNameTranslations!;
}

/**
 * Fetch and cache the Nepali→English candidate name translation map (lazy).
 * The JSON lives at /cache/candidate_names_np-en.json and is keyed by
 * Nepali name (name_np) with the English transliteration as the value.
 */
async function getCandidateNameTranslations(): Promise<Record<string, string>> {
  if (_candidateNameTranslations) return _candidateNameTranslations;

  try {
    const res = await fetch('/cache/candidate_names_np-en.json');
    if (res.ok) {
      const rawMap = await res.json();
      // Normalize all keys to handle inconsistent whitespace in candidate names
      _candidateNameTranslations = normalizeMapKeys(rawMap);
    } else {
      console.warn(
        '[getCandidateNameTranslations] Failed to load translation file:',
        res.status
      );
      _candidateNameTranslations = {};
    }
  } catch (err) {
    console.warn(
      '[getCandidateNameTranslations] Error loading translations:',
      err
    );
    _candidateNameTranslations = {};
  }

  return _candidateNameTranslations!;
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
/**
 * Strip Devanagari vowel signs (matras) from a string so that spelling
 * variants like सूर्य (with ू U+0942) and सुर्य (with ु U+0941) compare
 * equal.  Also collapses whitespace and trims.
 */
function normalizeDevanagari(s: string): string {
  return (
    s
      .normalize('NFD')
      // Remove Devanagari dependent vowel signs (U+093E-U+094D) and a few
      // extended marks so that vowel-length differences are ignored.
      .replace(/[\u093E-\u094D\u0951-\u0957]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

async function getSymbolMapping2079(): Promise<Map<string, number>> {
  if (_symbolMapping2079) return _symbolMapping2079;

  try {
    const mapping = new Map<string, number>();
    // Also build a normalized-name → 2079 id map for fuzzy cross-referencing
    const normalizedMapping = new Map<string, number>();

    // We fetch from the 2079 cache explicitly
    const res = await fetch('/cache/2079/symbols.json');
    if (res.ok) {
      const symbols = await res.json();
      for (const s of symbols) {
        if (s.symbolName && s.symbolId) {
          const name = s.symbolName.trim();
          mapping.set(name, s.symbolId);
          normalizedMapping.set(normalizeDevanagari(name), s.symbolId);
        }
      }
    }

    // Also load the *current* election's symbols.json and cross-reference
    // names back to 2079 IDs (since cached images use 2079 IDs).
    try {
      const currentSymbols = await fetchSymbols();
      if (Array.isArray(currentSymbols)) {
        for (const s of currentSymbols) {
          if (!s.symbolName) continue;
          const name = s.symbolName.trim();
          // If this name is already in the mapping, skip it
          if (mapping.has(name)) continue;
          // Try normalized match against 2079 names
          const normName = normalizeDevanagari(name);
          const matched2079Id = normalizedMapping.get(normName);
          if (matched2079Id) {
            mapping.set(name, matched2079Id);
          }
        }
      }
    } catch (err) {
      console.warn(
        '[getSymbolMapping2079] Could not cross-reference current election symbols:',
        err
      );
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

    const name_en = en[`province_${province_id}` as UiStringKey] || null;

    return {
      type: 'Feature',
      properties: {
        province_id,
        name_np: province_name,
        name_en: name_en,
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

    const name_en = en[`district_${district_id}` as UiStringKey] || null;

    return {
      type: 'Feature',
      properties: {
        district_id,
        province_id: province_id_local,
        name_np: district_name,
        name_en: name_en,
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
  const nameTranslations = await getCandidateNameTranslations();
  const partyTranslations = await getPartyNameTranslations();
  const missingPartySymbols = new Set<string>();

  // Create a map for name-based lookup (needed for 2074 data where DistrictCd is missing)
  const districtNameMap = new Map<string, number>();
  for (const d of districtIdentifiers) {
    // @ts-ignore - DistrictIdentifier usually has name from the lookup file
    if (d.name && d.id) {
      // @ts-ignore
      const name = d.name.trim().normalize('NFC');
      districtNameMap.set(name, d.id);

      // Add variation without parentheses to handle "District (Meta)" vs "District Meta" mismatch
      // e.g. "Nawalparasi (West)" -> "Nawalparasi West"
      const nameNoParens = name
        .replace(/[()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (nameNoParens !== name) {
        districtNameMap.set(nameNoParens, d.id);
      }
    }
  }

  let image_url = '';
  const bundled: Candidate[] = [];

  for (const candidate of raw_candidates) {
    const candidate_id = candidate.CandidateID;
    const constituency_number = candidate.SCConstID;
    const name_np = candidate.CandidateName;
    const party = candidate.PoliticalPartyName;
    // @ts-ignore
    const gender = candidate.Gender ?? candidate.GENDER ?? 'Other';
    // 2082 uses AGE_YR instead of Age
    const age = candidate.Age ?? candidate.AGE_YR ?? 0;
    // @ts-ignore
    const education = candidate.QUALIFICATION ?? candidate.Qualification ?? '';
    // @ts-ignore
    const experience = candidate.EXPERIENCE ?? candidate.Experience ?? '';
    const image = image_url + candidate.CandidateID;
    // 2082 uses E_STATUS instead of Remarks
    const elected = !!(candidate.Remarks ?? candidate.E_STATUS);
    const votes = candidate.TotalVoteReceived;

    // 2079 stores numeric district ID in DistrictCd.
    // 2082 duplicates the CTZDIST key — first as a number, then as a
    // district name string. JSON.parse keeps the last (string) value,
    // so the numeric ID is lost. We fall back to DistrictName lookup.
    let district: number | string | undefined = candidate.DistrictCd;

    // Fallback: look up by name if DistrictCd is missing/zero
    // (common in 2074 data and always needed for 2082 data)
    if (!district || district === 0) {
      let nameToLookup = candidate.DistrictName;
      // If DistrictName is missing, try CTZDIST if it's a string (common in 2082 data)
      if (!nameToLookup && typeof candidate.CTZDIST === 'string') {
        nameToLookup = candidate.CTZDIST;
      }

      if (nameToLookup) {
        const rawName = nameToLookup.trim().normalize('NFC');
        let mappedId = districtNameMap.get(rawName);

        // Try variation: remove parentheses from candidate name too
        if (!mappedId) {
          const nameNoParens = rawName
            .replace(/[()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          mappedId = districtNameMap.get(nameNoParens);
        }

        if (mappedId) {
          district = mappedId;
        } else {
          console.warn(
            `[bundleCandidates] Could not map district name "${nameToLookup}" to an ID.`
          );
        }
      }
    }

    if (!district) {
      // If we still don't have a district ID, we can't form a valid constituency ID.
      console.warn(
        `[bundleCandidates] Skipping candidate ${name_np} (${party}) due to missing District ID.`
      );
      continue;
    }

    // 2082 uses STATE_ID instead of State
    const province = candidate.State ?? candidate.STATE_ID ?? 0;
    // 2082 uses SYMBOLCODE instead of SymbolID
    let symbolid = candidate.SymbolID ?? candidate.SYMBOLCODE ?? 0;

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

    const name_en = normalizedLookup(nameTranslations, name_np) ?? null;
    const party_en = normalizedLookup(partyTranslations, party) ?? null;

    const a_candidate: Candidate = {
      candidate_id: candidate_id,
      name_en: name_en,
      name_np: name_np,
      age: age,
      gender: gender,
      image_url: image,
      constituency_id: Number(String(district) + String(constituency_number)),
      district: Number(district),
      province: province,
      experience: experience,
      qualification: education,
      party: party,
      party_en: party_en,
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
      // Only consider a candidate as "leading" if they actually have votes.
      // When no votes have been counted yet (e.g. pre-election data), we
      // should not declare any winner — doing so would misleadingly color
      // the map and populate the leaderboard with arbitrary results.
      if (leading_candidate.votes > 0) {
        bundled.push(leading_candidate);
      }
      seen.add(leading_candidate.constituency_id);
    }
  }

  console.log(
    `[bundleLeadingCandidates] Found ${bundled.length} leading candidates (constituency winners).`
  );
  return bundled;
}

/**
 * Fetch and normalize national-level PR (Proportional Representation)
 * aggregate data — one entry per party with total votes.
 *
 * Returns an empty array when the active election has no PR data or the
 * endpoint returns an error / empty payload. This allows the rest of the
 * app to treat PR as purely additive — nothing breaks when it's absent.
 */
export async function bundlePRNational(): Promise<PRPartyAggregate[]> {
  const raw: PRPartyAggregateRaw[] =
    (await fetchPRNational()) as PRPartyAggregateRaw[];

  if (!raw || raw.length === 0) {
    console.log('[bundlePRNational] No PR data available for this election.');
    return [];
  }

  const partyTranslations = await getPartyNameTranslations();

  const bundled: PRPartyAggregate[] = raw
    .filter((entry) => entry.TotalVoteReceived > 0)
    .map((entry) => {
      const partyNp = entry.PoliticalPartyName ?? '';
      const partyEn = normalizedLookup(partyTranslations, partyNp) ?? null;

      return {
        party: partyNp,
        party_en: partyEn,
        party_id: entry.PartyID ?? 0,
        symbol_id: entry.SymbolID ?? 0,
        symbol_name: entry.SymbolName ?? null,
        votes: entry.TotalVoteReceived,
      };
    })
    .sort((a, b) => b.votes - a.votes);

  console.log(
    `[bundlePRNational] Bundled ${bundled.length} parties with PR votes.`
  );
  return bundled;
}
