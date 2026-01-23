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
  name_en: string;
  name_np: string;
  coordinates: number[][][];
};

export type Candidate = {
  id: number;
  name_en: string;
  name_np: string;
  party: string;
  constituency: number;
};

export type ElectionData = {
  provinces: Province[];
  districts: District[];
  constituencies: Constituency[];
  candidates: Candidate[];
};
