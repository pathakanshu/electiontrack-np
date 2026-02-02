/**
 * src/data/dataBundler.ts
 *
 * Refactored to avoid top-level await. Identifier lookups (districts / constituencies)
 * are loaded lazily and cached on first use so this module can be imported without
 * performing network requests immediately.
 *
 * Exports:
 *  - bundleProvinces(): Promise<Province[]>
 *  - bundleDistricts(province_id): Promise<District[]>
 *  - bundleConstituencies(district_id): Promise<Constituency[]>
 *  - bundleCandidates(): Promise<Candidate[]>
 *
 * The bundling logic is unchanged from the previous implementation; only the
 * identifier fetching is deferred.
 */

import {
  fetchProvinces,
  fetchDistricts,
  fetchConstituencies,
  fetchCandidates,
} from '../../api/index';

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
} from '../types';

/**
 * Cache for lookup lists loaded lazily to avoid network activity at import time.
 */
let _districtIdentifiers: DistrictIdentifier[] | null = null;
let _constituencyIdentifiers: ConstituencyIdentifier[] | null = null;

/**
 * Fetch and cache district identifiers (lazy).
 */
async function getDistrictIdentifiers(): Promise<DistrictIdentifier[]> {
  if (_districtIdentifiers) return _districtIdentifiers;

  const url =
    'https://result.election.gov.np/JSONFiles/Election2079/Local/Lookup/districts.json';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch district identifiers: ${res.status} ${res.statusText}`
    );
  }
  const data = (await res.json()) as DistrictIdentifier[];
  _districtIdentifiers = data;
  return data;
}

/**
 * Fetch and cache constituency identifiers (lazy).
 */
async function getConstituencyIdentifiers(): Promise<ConstituencyIdentifier[]> {
  if (_constituencyIdentifiers) return _constituencyIdentifiers;

  const url =
    'https://result.election.gov.np/JSONFiles/Election2079/HOR/Lookup/constituencies.json';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch constituency identifiers: ${res.status} ${res.statusText}`
    );
  }
  const data = (await res.json()) as ConstituencyIdentifier[];
  _constituencyIdentifiers = data;
  return data;
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
  district_id: number
): Promise<Constituency[]> {
  const rawConstituencies = await fetchConstituencies(district_id);

  return rawConstituencies.map((feature: ConstituencyFeature) => {
    const district_id_local = feature.properties.DCODE;
    const province_id = feature.properties.STATE_C;
    const sub_id = feature.properties.F_CONST;
    const constituency_id = Number(String(district_id_local) + String(sub_id));
    const coordinates = feature.geometry.coordinates;
    const conservation_area = !!feature.properties.Conservati;

    return {
      type: 'Feature',
      id: constituency_id,
      properties: {
        constituency_id,
        district_id: district_id_local,
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
 * Fetch and bundle all candidates (unchanged).
 */
export async function bundleCandidates(): Promise<Candidate[]> {
  const raw_candidates: CandidateIdentifier[] = await fetchCandidates();
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
    const district = candidate.DistrictCd;
    const province = candidate.State;
    const symbolid = candidate.SymbolID;

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

  return bundled;
}

export async function bundleLeadingCandidates(
  candidates: Candidate[]
): Promise<Candidate[]> {
  // do not loop candidates whose Constituency is already bundled
  const bundled: Candidate[] = [];
  const seen = new Set();

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

  return bundled;
}
