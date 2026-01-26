import { createMap, addProvincesLayer, addDistrictsLayer } from './maprender';
import { fetchProvinces, fetchDistricts } from '../api/index';

async function init() {
  const map = createMap('map');

  map.on('load', async () => {
    const provinces = await fetchProvinces();
    addProvincesLayer(map, provinces);

    const districts = await fetchDistricts(provinces);
    addDistrictsLayer(map, districts);
  });
}

init();
