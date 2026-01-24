import { Province, District, Constituency, Candidate } from '../src/types';

export async function fetch_provinces(): Promise<Province[]> {
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

export async function fetch_districts(provinces: Province[]): Promise<District[]> {
  
  const districts = [];
  for (let province of provinces) {
    const res = await fetch(
      `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${province.id}.json`
    );
    const data = await res.json();

    districts.push(
      ...data.features.map((d: any) => ({
        id: d['properties']['DCODE'],
        province: d['properties']['STATE_C'],
        name_en: d['properties']['DISTRICT_N'],
        name_np: d['properties']['DISTRICT_NP'],
        coordinates: d['geometry']['coordinates'],
      }))
    );
  }
  return districts;
}

export async function fetch_constituencies(
  districts: District[]
): Promise<Constituency[]> {
  
  const constituencies = [];
  for (let district of districts) {
    const res = await fetch(
      `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Const/dist-${district.id}.json`
    );

    const data = await res.json();

    constituencies.push(
      ...data.features.map((c: any) => ({
        id: c['properties']['F_CONST'],
        district: district.id,
        province: district.province,
        coordinates: c['geometry']['coordinates'],
      }))
    );
  }
  return constituencies;
}

export async function fetch_HOR_candidates(
  constituencies: Constituency[]
): Promise<Candidate[]> {
  
  const candidates = [];
  for (let constituency of constituencies) {
    const res = await fetch(
      `https://result.election.gov.np/JSONFiles/Election2079/HOR/FPTP/HOR-${constituency.district}-${constituency.id}.json`
    );
    const data = await res.json();

    candidates.push(
      ...data.map((c: any) => ({
        id: c['CandidateID'],
        name_en: null,
        name_np: c['CandidateName'],
        age: c['Age'],
        party: c['PoliticalPartyName'],
        gender: c['Gender'],
        qualification: c['QUALIFICATION'],
        remarks: c['REMARKS'],
        votes: c['TotalVotesReceived'],
        constituency: c['SCConstID'],
        district: constituency.district,
        province: constituency.province,
        symbol_id: c['SymbolID'],
        citizenship_district: c['CTZDIST'],
        experience: c['EXPERIENCE'] 
      }))
    );
  }
  return candidates;
}
