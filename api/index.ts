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
  // const res = await fetch(
  //   'https://result.election.gov.np/JSONFiles/ElectionResultCentral2079.txt'
  // );
  //
  // TODO: make sure this fetch is happening in intervals
  const res = await fetch('/cache/ElectionResultCentral2079.txt');

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

// This is only used as fallback if fetchAllCandidates turn out to not work
// to avoid sending more requests than necessary
// TODO: Loop and send a json that looks just like fetchCandidates's response
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
