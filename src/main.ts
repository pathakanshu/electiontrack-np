import {
  createMap,
  addProvincesLayer,
  addConstituencyLayer,
  colorConstituenciesByVotes,
  // addDistrictsLayer,
} from './map/maprender';

import {
  fetchTopology,
  toProvinceFeature,
  toConstituencyFeature,
} from './utils/geo';

import { bundleCandidates, bundleLeadingCandidates } from './data/dataBundler';
import { Province, Constituency, Candidate } from './types/election';
import { feature } from 'topojson-client';

function init() {
  /* Initialize Map */
  const map = createMap('map');

  map.on('load', async () => {
    const topo = await fetchTopology('/data/geometry.topo.json');

    /* Convert TopoJSON province data into GeoJSON FeatureCollection */
    const provincesFC = feature<GeoJSON.MultiPolygon, Province['properties']>(
      topo,
      'provinces'
    );

    /* Convert TopoJSON constituency data into GeoJSON FeatureCollection */
    const constituenciesFC = feature<
      GeoJSON.MultiPolygon,
      Constituency['properties']
    >(topo, 'constituencies');

    // Extract GeoJSON features and convert into Province/Constituency Types
    const provinces: Province[] = provincesFC.features.map(toProvinceFeature);
    const constituencies: Constituency[] = constituenciesFC.features.map(
      toConstituencyFeature
    );

    /* Initialize Candidates */
    const candidates: Candidate[] = await bundleCandidates();
    const leadingCandidates: Candidate[] =
      await bundleLeadingCandidates(candidates);

    // Add layers
    addProvincesLayer(map, provinces);
    addConstituencyLayer(map, constituencies);

    // Start coloring layers with candidate data after layers are loaded
    map.on('sourcedata', async (e) => {
      if (!e.isSourceLoaded || e.sourceId !== 'constituencies') return;
      await colorConstituenciesByVotes(map, leadingCandidates);
    });
  });
}

init();
