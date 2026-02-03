import {
  createMap,
  addProvincesLayer,
  // addDistrictsLayer,
  addConstituencyLayer,
  colorConstituenciesByVotes,
} from './map/maprender';
import { bundleCandidates, bundleLeadingCandidates } from './data/dataBundler';
import { feature } from 'topojson-client';
import {
  fetchTopology,
  toProvinceFeature,
  toConstituencyFeature,
} from './utils/geo';
import type { Province, Constituency, Candidate } from './types/election';

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

    // @ts-ignore - topojson-client types can be tricky with Feature vs FeatureCollection
    const provinces: Province[] = provincesFC.features.map(toProvinceFeature);
    // @ts-ignore
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

    map.setPaintProperty('background', 'background-color', 'transparent');
  });
}

init();
