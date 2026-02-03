import { type Topology } from 'topojson-client';
import type { Province, Constituency } from '../types/election';

/**
 * Lightweight runtime check to ensure the fetched object looks like a Topology
 * with the expected named objects. This protects the typed conversions below.
 */
export function isTopologyLike(obj: unknown): obj is Topology {
  if (typeof obj !== 'object' || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  if (rec.type !== 'Topology') return false;
  if (typeof rec.objects !== 'object' || rec.objects === null) return false;
  const objs = rec.objects as Record<string, unknown>;
  return 'provinces' in objs && 'districts' in objs && 'constituencies' in objs;
}


/**
 * Fetch and validate a TopoJSON topology from a given URL.
 */
export async function fetchTopology(url: string): Promise<Topology> {
  const res = await fetch(url);
  const data = (await res.json()) as unknown;
  if (!isTopologyLike(data)) {
    throw new Error(`Invalid TopoJSON topology at ${url}`);
  }
  return data;
}

/**
 * Convert a GeoJSON Feature (typically from topojson-client) into the app-specific Province type.
 * Performs runtime sanity checks on properties and geometry.
 */
export function toProvinceFeature(
  f: GeoJSON.Feature<GeoJSON.MultiPolygon, Province['properties']>
): Province {
  if (!f.properties) throw new Error('Province feature missing properties');
  if (!f.geometry || f.geometry.type !== 'MultiPolygon')
    throw new Error('Province feature has unexpected geometry type');
  return {
    type: 'Feature',
    properties: f.properties,
    geometry: f.geometry,
  };
}

/**
 * Convert a GeoJSON Feature into the app-specific Constituency type.
 * Ensures the 'id' field is correctly mapped from constituency_id.
 */
export function toConstituencyFeature(
  f: GeoJSON.Feature<GeoJSON.MultiPolygon, Constituency['properties']>
): Constituency {
  if (!f.properties) throw new Error('Constituency feature missing properties');
  if (!f.geometry || f.geometry.type !== 'MultiPolygon')
    throw new Error('Constituency feature has unexpected geometry type');
  return {
    type: 'Feature',
    id: f.properties.constituency_id,
    properties: f.properties,
    geometry: f.geometry,
  };
}
