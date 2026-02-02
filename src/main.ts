import {
  createMap,
  addProvincesLayer,
  // addDistrictsLayer,
  addConstituencyLayer,
  colorConstituenciesByVotes,
} from './maprender';
import { bundleCandidates, bundleLeadingCandidates } from './data/dataBundler';
import { feature, type Topology } from 'topojson-client';
import type { Province, District, Constituency, Candidate } from './types';

/**
 * Lightweight runtime check to ensure the fetched object looks like a Topology
 * with the expected named objects. This protects the typed conversions below.
 */
function isTopologyLike(obj: unknown): obj is Topology {
  if (typeof obj !== 'object' || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  if (rec.type !== 'Topology') return false;
  if (typeof rec.objects !== 'object' || rec.objects === null) return false;
  const objs = rec.objects as Record<string, unknown>;
  return 'provinces' in objs && 'districts' in objs && 'constituencies' in objs;
}

async function fetchTopology(url: string): Promise<Topology> {
  const res = await fetch(url);
  const data = (await res.json()) as unknown;
  if (!isTopologyLike(data)) {
    throw new Error(`Invalid TopoJSON topology at ${url}`);
  }
  return data;
}

/**
 * Convert a GeoJSON Feature (from topojson-client) into the app-specific Feature type.
 * These functions also perform runtime sanity checks (non-null properties, MultiPolygon geometry).
 */
function toProvinceFeature(
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

// function toDistrictFeature(
//   f: GeoJSON.Feature<GeoJSON.MultiPolygon, District['properties']>
// ): District {
//   if (!f.properties) throw new Error('District feature missing properties');
//   if (!f.geometry || f.geometry.type !== 'MultiPolygon')
//     throw new Error('District feature has unexpected geometry type');
//   return {
//     type: 'Feature',
//     properties: f.properties,
//     geometry: f.geometry,
//   };
// }

function toConstituencyFeature(
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

/**
 * Initialize map immediately and attach the 'load' handler right away.
 * The topology fetch and feature conversion happen inside the load handler to
 * avoid any race between map creation and remote fetches / data processing.
 */

function init() {
  const map = createMap('map');

  map.on('load', async () => {

      console.log('[main] map loaded — fetching prebuilt topology...');
      const topo = await fetchTopology('/data/geometry.topo.json');

      const provincesFC = feature<GeoJSON.MultiPolygon, Province['properties']>(
        topo,
        'provinces'
      );
      const constituenciesFC = feature<
        GeoJSON.MultiPolygon,
        Constituency['properties']
      >(topo, 'constituencies');

      const provinces: Province[] = provincesFC.features.map(toProvinceFeature);
      const constituencies: Constituency[] = constituenciesFC.features.map(
        toConstituencyFeature
      );

      const candidates: Candidate[] = await bundleCandidates();
      const leadingCandidates: Candidate[] =
        await bundleLeadingCandidates(candidates);

      // Add layers
      addProvincesLayer(map, provinces);
      addConstituencyLayer(map, constituencies);

      // Wait for the constituencies source to finish loading before coloring
      map.on('sourcedata', async (e) => {
        if (!e.isSourceLoaded || e.sourceId !== 'constituencies') return;

        console.log('[main] constituencies source loaded, coloring now...');
        await colorConstituenciesByVotes(map, leadingCandidates);

        const ids = map.querySourceFeatures('constituencies').map((f) => f.id);
        console.log('[main] colored constituency IDs:', ids);
      });
    
  });
}

init();
