import { Map } from 'maplibre-gl';
import { Province, District, Constituency } from './types';

const background_color = '#ffffff';

const province_border_color = '#ffffff';
const province_fill_color = '#000000';
const province_fill_opacity = 0;
const province_border_width = 2;
const province_border_opacity = 1;

// district is not used in HOR elections
const district_border_color = '#ffffff';
const district_fill_color = '#000000';
const district_fill_opacity = 1;
const district_border_width = 1;
const district_border_opacity = 1;

const constituency_border_color = '#ffffff';
const constituency_fill_color = '#F00000';
const constituency_fill_opacity = 1;
const constituency_border_width = 1;
const constituency_border_opacity = 1;

export function createMap(containerID: string): Map {
  const map = new Map({
    container: containerID,
    center: [84.124, 28.394],
    zoom: 6.5,
    style: {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': background_color,
          },
        },
      ],
    },
    hash: true,
  });

  return map;
}

export function addProvincesLayer(map: Map, provinces: Province[]) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: provinces,
  };

  map.addSource('provinces', {
    type: 'geojson',
    data: geojson,
  });

  map.addLayer({
    id: 'provinces-fill',
    type: 'fill',
    source: 'provinces',
    paint: {
      'fill-color': province_fill_color,
      'fill-opacity': province_fill_opacity,
    },
  });

  map.addLayer({
    id: 'provinces-border',
    type: 'line',
    source: 'provinces',
    paint: {
      'line-color': province_border_color,
      'line-width': province_border_width,
      'line-opacity': province_border_opacity,
    },
  });
}

export function addDistrictsLayer(map: Map, districts: District[]) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: districts,
  };

  map.addSource('districts', {
    type: 'geojson',
    data: geojson,
  });

  map.addLayer({
    id: 'districts-fill',
    type: 'fill',
    source: 'districts',
    paint: {
      'fill-color': district_fill_color,
      'fill-opacity': district_fill_opacity,
    },
  });

  map.addLayer({
    id: 'districts-border',
    type: 'line',
    source: 'districts',
    paint: {
      'line-color': district_border_color,
      'line-width': district_border_width,
      'line-opacity': district_border_opacity,
    },
  });
}

export function addConstituencyLayer(map: Map, constituencies: Constituency[]) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: constituencies,
  };

  map.addSource('constituencies', {
    type: 'geojson',
    data: geojson,
  });

  map.addLayer({
    id: 'constituencies-fill',
    type: 'fill',
    source: 'constituencies',
    paint: {
      'fill-color': constituency_fill_color,
      'fill-opacity': constituency_fill_opacity,
    },
  });

  map.addLayer({
    id: 'constituencies-border',
    type: 'line',
    source: 'constituencies',
    paint: {
      'line-color': constituency_border_color,
      'line-width': constituency_border_width,
      'line-opacity': constituency_border_opacity,
    },
  });
}
