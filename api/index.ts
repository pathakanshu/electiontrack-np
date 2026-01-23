import { Province, District, Constituency, Candidate } from '../src/types';

async function fetch_provinces(): Promise<Province[]> {
  const res = await fetch(
    'https://result.election.gov.np/JSONFiles/JSONMap/geojson/Province.json'
  );
  const data = await res.json();

  return data.features.map((p: any) => ({
    id: p['properties']['STATE_C'],
    name_en: null,
    name_np: p['properties']['STATE_N'],
    coordinates: p['geometry']['coordinates'],
  }));
}

async function fetch_districts(provinces: Province[]): Promise<District[]> {
  const res = await fetch(
    `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${provinces}.json`
  );
  const data = await res.json();

  return data.map((d: any) => ({
    id: d.id,
    name_en: d.name_en,
    name_np: d.name_np,
    geometry: d.geometry,
  }));
}

async function fetch_constituencies(
  districts: District[]
): Promise<Constituency[]> {
  const res = await fetch(
    `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Constituency/${districts[0].id}.json`
  );
  const data = await res.json();

  return data.map((c: any) => ({
    id: c.id,
    name_en: c.name_en,
    name_np: c.name_np,
    geometry: c.geometry,
  }));
}

async function fetch_candidates(
  constituencies: Constituency[]
): Promise<Candidate[]> {
  const res = await fetch('');
  const data = await res.json();

  return data.map((c: any) => ({
    id: c.id,
    name_en: c.name_en,
    name_np: c.name_np,
    geometry: c.geometry,
  }));
}

// Test code - add this at the bottom
fetch_provinces()
  .then((provinces) => {
    console.dir(provinces);

    console.log('Number of provinces:', provinces.length);
  })
  .catch((error) => console.error('Error:', error));
