/**
 * src/data/dataBundlerBuild.ts
 *
 * Build-time version of dataBundler.ts that reads cache files from disk.
 * Used only during build process (generate-geometry.ts).
 *
 * This is identical to dataBundler.ts except it uses apiBuild.ts
 * functions instead of api.ts functions for reading identifiers.
 */

import {
  fetchDistrictIdentifiersBuild,
  fetchConstituencyIdentifiersBuild,
  fetchProvincesBuild,
  fetchDistrictsBuild,
  fetchConstituenciesBuild,
} from './apiBuild';

import type {
  ProvinceFeature,
  Province,
  DistrictFeature,
  District,
  DistrictIdentifier,
  ConstituencyIdentifier,
  Constituency,
  ConstituencyFeature,
} from '../types/election';

/**
 * Cache for lookup lists loaded lazily to avoid filesystem access multiple times.
 */
let _districtIdentifiers: DistrictIdentifier[] | null = null;
let _constituencyIdentifiers: ConstituencyIdentifier[] | null = null;

/**
 * Build-time: Fetch and cache district identifiers from disk.
 */
async function getDistrictIdentifiersBuild(): Promise<DistrictIdentifier[]> {
  if (_districtIdentifiers) return _districtIdentifiers;

  try {
    const data = await fetchDistrictIdentifiersBuild();
    _districtIdentifiers = data as DistrictIdentifier[];
    return _districtIdentifiers;
  } catch (err) {
    throw new Error(
      `Failed to fetch district identifiers: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Build-time: Fetch and cache constituency identifiers from disk.
 */
async function getConstituencyIdentifiersBuild(): Promise<
  ConstituencyIdentifier[]
> {
  if (_constituencyIdentifiers) return _constituencyIdentifiers;

  try {
    const data = await fetchConstituencyIdentifiersBuild();
    _constituencyIdentifiers = data as ConstituencyIdentifier[];
    return _constituencyIdentifiers;
  } catch (err) {
    throw new Error(
      `Failed to fetch constituency identifiers: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Build-time: Fetch and bundle all provinces as GeoJSON Features.
 */
export async function bundleProvincesBuild(): Promise<Province[]> {
  // Ensure identifiers are available (load from disk)
  const districtIdentifiers = await getDistrictIdentifiersBuild();

  // Fetch raw data (ECN secure handler with direct URL fallback)
  const rawProvinces = await fetchProvincesBuild();

  return rawProvinces.features.map((feature: ProvinceFeature) => {
    const province_id = feature.properties.STATE_C;
    const province_name = feature.properties.STATE_N;
    const geometry_coords = feature.geometry.coordinates;
    const district_ids: Array<number> = districtIdentifiers
      .filter((d: any) => d.id && d.parentId === province_id)
      .map((d: any) => d.id);

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
 * Build-time: Fetch and bundle all districts for a given province as GeoJSON Features.
 */
export async function bundleDistrictsBuild(
  province_id: number
): Promise<District[]> {
  // Ensure identifiers are available (load from disk)
  const constituencyIdentifiers = await getConstituencyIdentifiersBuild();

  const rawDistricts = await fetchDistrictsBuild(province_id);
  return rawDistricts.features.map((feature: DistrictFeature) => {
    const district_id = feature.properties.DCODE;
    const district_name = feature.properties.DISTRICT_N;
    const geometry_coords = feature.geometry.coordinates;
    const province_id_local = feature.properties.STATE_C;
    const constituency_ids = constituencyIdentifiers
      .filter((c: any) => c.distId === district_id)
      .map((c: any) => Number(String(district_id) + String(c.consts)));

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
 * Build-time: Fetch and bundle all constituencies for a given district as GeoJSON Features.
 */
export async function bundleConstituenciesBuild(
  district_id: number,
  district_name?: string
): Promise<Constituency[]> {
  const rawConstituencies = await fetchConstituenciesBuild(district_id);

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
