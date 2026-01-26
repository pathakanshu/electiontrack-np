// This file is responsible for integrating data from various sources
// such as provinces, districts, constituencies, and candidates.
// The goal is to combine these into various cohesive structures
// that can be used by the application.

import {
  fetchProvinces,
  fetchDistricts,
  fetchConstituencies,
  fetchAllCandidates,
} from '../../api/index';

import {
  ProvinceFeature,
  Province,
  DistrictFeature,
  District,
  DistrictIdentifier,
  ConstituencyIdentifier,
  Constituency,
  ConstituencyFeature,
} from '../types';

export async function bundleProvinces(): Promise<Province[]> {
  // Fetch raw data
  const raw_provinces = await fetchProvinces();
  const fetch_DI = await fetch(
    'https://result.election.gov.np/JSONFiles/Election2079/Local/Lookup/districts.json'
  );
  const district_identifiers: DistrictIdentifier[] = await fetch_DI.json();

  const bundled: Province[] = [];

  raw_provinces.features.map((feature: ProvinceFeature) => {
    const province_id = feature.properties.STATE_C;
    const province_name = feature.properties.STATE_N;
    const geometry_coords = feature.geometry.coordinates;
    const district_ids: Array<number> = district_identifiers
      .filter(
        (district_identifier: DistrictIdentifier) =>
          // Filters districts belonging to the current province
          district_identifier.parentId === province_id
      )
      .map(
        // Extracts district IDs
        (district_identifier: DistrictIdentifier) => district_identifier.id
      );
    const province: Province = {
      district_ids: district_ids,
      province_id: province_id,
      name_np: province_name,
      name_en: null,

      geometry_coords,
    };

    bundled.push(province);
  });

  return bundled;
}

export async function bundleDistricts(province: Province): Promise<District[]> {
  const raw_districts = await fetchDistricts(province.province_id);
  const fetch_Cinfo = await fetch(
    'https://result.election.gov.np/JSONFiles/Election2079/HOR/Lookup/constituencies.json'
  );

  const raw_constituencies = await fetch_Cinfo.json();

  const bundled: District[] = [];

  raw_districts.features.map((feature: DistrictFeature) => {
    const district_id = feature.properties.DCODE;
    const district_name = feature.properties.DISTRICT_N;
    const geometry_coords = feature.geometry.coordinates;
    const constituency_ids = raw_constituencies
      .filter(
        (constituency: ConstituencyIdentifier) =>
          constituency.distId === district_id
      )
      // Format: "districtID-constituencyID"
      .map(
        (constituency: ConstituencyIdentifier) =>
          district_id.toString() + '-' + constituency.consts.toString()
      );

    const district: District = {
      district_id: district_id,
      province_id: -1,
      name_np: district_name,
      name_en: null,
      geometry_coords: geometry_coords,
      constituency_ids: constituency_ids,
    };

    bundled.push(district);
  });

  return bundled;
}

export async function bundleConstituencies(
  district: District
): Promise<Constituency[]> {
  const raw_constituencies = await fetchConstituencies(district.district_id);
  const bundled: Constituency[] = [];

  raw_constituencies.map((feature: ConstituencyFeature) => {
    const district_id = feature.properties.DCODE;
    const sub_id = feature.properties.F_CONST;
    const constituency_id = district_id.toString() + '-' + sub_id.toString();
    const coordinates = feature.geometry.coordinates;
    const conservation_area = feature.properties.Conservati ? true : false;

    const constituency: Constituency = {
      constituency_id: constituency_id,
      district_id: district_id,
      sub_id: sub_id,
      geometry_coords: coordinates,
      province_id: -1,
      conservation_area: conservation_area,
    };

    bundled.push(constituency);
  });

  return bundled;
}


