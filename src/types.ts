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
    constituency_ids: string[];
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
  properties: {
    constituency_id: string;
    district_id: number;
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
  constituency_id: string;
  district: number;
  province: number;
  experience: string;
  qualification: string;
  party: string;
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
  DistrictCd: number;
  DistrictName: string;
  State: number;
  SCConstID: string;
  CenterConstID: number | null;
  SerialNo: number;
  TotalVoteReceived: number;
  CastedVote: number;
  TotalVoters: number;
  Rank: string;
  Remarks: string | null;
  Samudaya: string | null;
  DOB: string;
  CTZDIST: string;
  FATHER_NAME: string;
  SPOUCE_NAME: string;
  QUALIFICATION: string;
  EXPERIENCE: string;
  OTHERDETAILS: string;
  NAMEOFINST: string;
  ADDRESS: string;
};
