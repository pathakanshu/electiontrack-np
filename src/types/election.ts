import { Position } from 'geojson';

//
// Province Types
//

export type Province = {
  type: 'Feature';
  properties: {
    province_id: number;
    name_en: string | null;
    name_np: string;
    district_ids: number[];
  };
  geometry: {
    type: 'MultiPolygon';
    coordinates: Position[][][];
  };
};

// raw json from fetch
export type ProvinceFeature = {
  type: string;
  properties: {
    STATE_C: number;
    STATE_N: string;
    Country: string;
    Country_N: string;
  };
  geometry: {
    type: string;
    coordinates: Position[][][];
  };
};

//
// District Types
//

export type District = {
  type: 'Feature';
  properties: {
    district_id: number;
    province_id: number;
    name_en: string | null;
    name_np: string;
    constituency_ids: number[];
  };
  geometry: {
    type: 'MultiPolygon';
    coordinates: Position[][][];
  };
};

// raw json from fetch
export type DistrictFeature = {
  type: string;
  properties: {
    STATE_C: number;
    STATE_N: string;
    DCODE: number;
    DISTRICT: string;
    DISTRICT_N: string;
  };
  geometry: {
    type: string;
    coordinates: Position[][][];
  };
};

// raw json from fetch
export type DistrictIdentifier = {
  id: number;
  name: string;
  parentId: number;
};

//
// Constituency Types
//

export type Constituency = {
  type: 'Feature';
  id: number;
  properties: {
    constituency_id: number;
    district_id: number;
    district_name?: string;
    sub_id: number;
    province_id: number;
    conservation_area: boolean;
  };
  geometry: {
    type: 'MultiPolygon';
    coordinates: Position[][][];
  };
};

// raw json from fetch
export type ConstituencyFeature = {
  type: string;
  properties: {
    OBJECTID: number;
    STATE_C: number;
    STATE_N: string;
    DCODE: number;
    DISTRICT: string;
    DISTRICT_N: string;
    F_CONST: number;
    Conservati: string | null;
  };
  geometry: {
    type: string;
    coordinates: Position[][][];
  };
};

// raw json from fetch
export type ConstituencyIdentifier = {
  distId: number;
  consts: number;
};

//
// Candidate Types
//

export type Candidate = {
  candidate_id: number;
  name_en: string | null;
  name_np: string;
  age: number;
  gender: string;
  image_url: string;
  constituency_id: number;
  district: number;
  province: number;
  experience: string;
  qualification: string;
  party: string;
  party_en: string | null;
  symbol_id: number;
  votes: number;
  elected: boolean | null;
};

// raw json from fetch
export type CandidateIdentifier = {
  CandidateName: string;
  Gender: string;
  Age: number;
  PartyID: number;
  SymbolID: number;
  SymbolName: string;
  CandidateID: number;
  StateName: string;
  PoliticalPartyName: string;
  ElectionPost: string | null;
  DistrictCd: number | string;
  DistrictName: string;
  State: number;
  SCConstID: string | number;
  CenterConstID: number | null;
  SerialNo: number;
  TotalVoteReceived: number;
  CastedVote: number;
  TotalVoters: number;
  Rank: string;
  Remarks: string | null;
  Samudaya: string | null;
  DOB: string;
  CTZDIST: string | number;
  FATHER_NAME: string;
  SPOUCE_NAME: string;
  QUALIFICATION: string;
  EXPERIENCE: string;
  OTHERDETAILS: string;
  NAMEOFINST: string;
  ADDRESS: string;

  // ── 2082-specific key variants ──────────────────────────────────────
  // The 2082 Election Commission data uses different field names for
  // several columns. These are optional because they only appear in
  // that year's payload. bundleCandidates() falls back to 2079 keys
  // when these are absent.

  /** Age — 2082 uses AGE_YR instead of Age */
  AGE_YR?: number;
  /** District ID — 2082 duplicates CTZDIST (first as number, then as
   *  string). JSON.parse keeps the last (string) value, so the numeric
   *  district ID is lost. We resolve it via DistrictName lookup. */
  /** Province — 2082 uses STATE_ID instead of State */
  STATE_ID?: number;
  /** Symbol ID — 2082 uses SYMBOLCODE instead of SymbolID */
  SYMBOLCODE?: number;
  /** Elected status — 2082 uses E_STATUS instead of Remarks */
  E_STATUS?: string | null;
  /** Rank — 2082 uses R instead of Rank */
  R?: number;
  /** Constituency name — 2082 includes ConstName */
  ConstName?: number | string;
};

export type leadingEntities = {
  constituency: {
    constituency_id: number;
    sorted_candidates: Candidate[];
  }[];
};

export type colorMapping = {
  parties: Record<string, string>;
  others: string;
};
