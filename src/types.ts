import { Position } from 'geojson';

export type Province = {
  province_id: number;
  name_en: string | null;
  name_np: string;
  district_ids: number[];
  geometry_coords: Position[][][];
};

export type District = {
  district_id: number;
  province_id: number;
  name_en: string | null;
  name_np: string;
  geometry_coords: Position[][][];
  constituency_ids: string[];
};

export type Constituency = {
  constituency_id: string;
  district_id: number;
  sub_id: number;
  province_id: number;
  conservation_area: boolean;
  geometry_coords: Position[][][];
};

export type Candidate = {
  id: number;
  name_en: string | null;
  name_np: string;
  age: number;
  party: string;
  gender: string;
  qualification: string;
  remarks: string;
  votes: number;
  constituency: number;
  district: number;
  province: number;
  symbol_id: number;
  experience: string;
};

export type ElectionData = {
  provinces: Province[];
  districts: District[];
  constituencies: Constituency[];
  candidates: Candidate[];
};

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

export type DistrictIdentifier = {
  id: number;
  name: string;
  parentId: number;
};

export type ConstituencyIdentifier = {
  distId: number;
  consts: number;
};
