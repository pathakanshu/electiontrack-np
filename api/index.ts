export async function fetchProvinces() {
  const res = await fetch(
    'https://result.election.gov.np/JSONFiles/JSONMap/geojson/Province.json'
  );
  const data = await res.json();
  return data;
}

export async function fetchDistricts(provinceId: number) {
  const res = await fetch(
    `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${provinceId}.json`
  );
  const data = await res.json();
  return data;
}

export async function fetchConstituencies(districtId: number) {
  const res = await fetch(
    `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Const/dist-${districtId}.json`
  );
  const data = await res.json();
  return data;
}

// This should be used as the primary function to fetch all candidate data
export async function fetchCandidates() {
  const res = await fetch(
    'https://result.election.gov.np/JSONFiles/ElectionResultCentral2082.txt'
  );
  const data = await res.json();
  return data;
}

// This is only used as fallback if fetchAllCandidates turn out to not work
// to avoid sending more requests than necessary
export async function fetchConstituencyCandidates(
  districtId: number,
  constituencyId: number
) {
  const res = await fetch(
    `https://result.election.gov.np/JSONFiles/Election2079/HOR/FPTP/HOR-${districtId}-${constituencyId}.json`
  );
  const data = await res.json();
  return data;
}
