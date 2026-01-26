import { Map } from 'maplibre-gl';
import { Position } from 'geojson';

export function createMap(containerID: string): Map {
  const map = new Map({
    container: 'map',
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
            'background-color': '#f5f5f5',
          },
        },
      ],
    },
    hash: true,
  });

  return map;
}

export function addProvincesLayer(
  map: Map,
  provinces: {
    id: number;
    name_np: string;
    name_en: string | null;
    coordinates: Position[][][];
  }[]
) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: provinces.map((province) => ({
      type: 'Feature' as const,
      properties: {
        id: province.id,
        name_np: province.name_np,
        name_en: province.name_en,
      },
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: province.coordinates,
      },
    })),
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
      'fill-color': '#ffffff',
      'fill-opacity': 0.1,
    },
  });

  map.addLayer({
    id: 'provinces-border',
    type: 'line',
    source: 'provinces',
    paint: {
      'line-color': '#000000',
      'line-width': 1,
    },
  });
}

export function addDistrictsLayer(
  map: Map,
  districts: {
    id: number;
    name_np: string;
    name_en: string | null;
    province: number;
    coordinates: Position[][][];
  }[]
) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: districts.map((district) => ({
      type: 'Feature' as const,
      properties: {
        id: district.id,
        name_np: district.name_np,
        name_en: district.name_en,
        province: district.province,
      },
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: district.coordinates,
      },
    })),
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
      'fill-color': '#ffffff',
      'fill-opacity': 0.05,
    },
  });

  map.addLayer({
    id: 'districts-border',
    type: 'line',
    source: 'districts',
    paint: {
      'line-color': '#ff0000',
      'line-width': 0.5,
    },
  });
}
