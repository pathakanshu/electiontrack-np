export type Province = {
  id: number;
  name_en: string | null;
  name_np: string;
  coordinates: number[][][];
};

export type District = {
  id: number;
  province: number;
  name_en: string | null;
  name_np: string;
  coordinates: number[][][];
};

export type Constituency = {
  id: number;
  district: number;
  province: number;
  coordinates: number[][][];
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
  citizenship_district: string;
};

export type ElectionData = {
  provinces: Province[];
  districts: District[];
  constituencies: Constituency[];
  candidates: Candidate[];
};
