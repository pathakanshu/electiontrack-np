import {
  createMap,
  addProvincesLayer,
  addDistrictsLayer,
  addConstituencyLayer,
} from './maprender';
import { feature, type Topology } from 'topojson-client';
import type { Province, District, Constituency } from './types';

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

function toDistrictFeature(
  f: GeoJSON.Feature<GeoJSON.MultiPolygon, District['properties']>
): District {
  if (!f.properties) throw new Error('District feature missing properties');
  if (!f.geometry || f.geometry.type !== 'MultiPolygon')
    throw new Error('District feature has unexpected geometry type');
  return {
    type: 'Feature',
    properties: f.properties,
    geometry: f.geometry,
  };
}

function toConstituencyFeature(
  f: GeoJSON.Feature<GeoJSON.MultiPolygon, Constituency['properties']>
): Constituency {
  if (!f.properties) throw new Error('Constituency feature missing properties');
  if (!f.geometry || f.geometry.type !== 'MultiPolygon')
    throw new Error('Constituency feature has unexpected geometry type');
  return {
    type: 'Feature',
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

  // Attach the load handler immediately. Fetch and process TopoJSON inside this handler.
  map.on('load', async () => {
    try {
      console.log('[main] map loaded — fetching prebuilt topology...');
      const topo = await fetchTopology('/data/geometry.topo.json');

      // Use topojson-client's `feature` with explicit generics:
      // geometry = MultiPolygon, properties = the shape defined in your types
      const provincesFC = feature<GeoJSON.MultiPolygon, Province['properties']>(
        topo,
        'provinces'
      );
      const districtsFC = feature<GeoJSON.MultiPolygon, District['properties']>(
        topo,
        'districts'
      );
      const constituenciesFC = feature<
        GeoJSON.MultiPolygon,
        Constituency['properties']
      >(topo, 'constituencies');

      // Map and validate the returned FeatureCollections into the app-specific types.
      const provinces: Province[] = provincesFC.features.map(toProvinceFeature);
      const districts: District[] = districtsFC.features.map(toDistrictFeature);
      const constituencies: Constituency[] = constituenciesFC.features.map(
        toConstituencyFeature
      );

      // Add layers using existing helpers
      try {
        addConstituencyLayer(map, constituencies);
        addProvincesLayer(map, provinces);
        addDistrictsLayer(map, districts);
        console.log('[main] map layers added successfully');
      } catch (layerErr) {
        console.error('[main] failed to add map layers:', layerErr);
      }
    } catch (err) {
      // Provide a clear console error so it's easy to debug in the browser
      console.error('[main] Failed to initialize map layers:', err);
    }
  });
}

init();
