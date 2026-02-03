import { Map } from 'maplibre-gl';
import type {
  Province,
  District,
  Constituency,
  Candidate,
  colorMapping,
} from '../types/election';

const background_color = '#2f2f2f';

const province_border_color = '#ffffff';
const province_fill_color = '#a0a0a0';
const province_fill_opacity = 0;
const province_border_width = 2;
const province_border_opacity = 1;

// district is not used in HOR elections
const district_border_color = '#ffffff';
const district_fill_color = '#a0a0a0';
const district_fill_opacity = 1;
const district_border_width = 1;
const district_border_opacity = 1;

const constituency_border_color = '#ffffff';
const constituency_fill_color = '#9a9a9a';
const constituency_fill_opacity = 1;
const constituency_border_width = 1;
const constituency_border_opacity = 1;

/**
 * Create a basic MapLibre map instance with a minimal style.
 */
export function createMap(containerID: string): Map {
  const map = new Map({
    container: containerID,
    center: [84.116, 28.41],
    zoom: 6.25,
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
    hash: false,
    attributionControl: false,
  });

  return map;
}

/**
 * Add provinces as a GeoJSON source + fill and border layers.
 */
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

/**
 * Add districts as a GeoJSON source + fill and border layers.
 */
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

/**
 * Add constituencies as a GeoJSON source and layers.
 *
 * Important:
 * - Ensure every feature has an `id` equal to `properties.constituency_id`
 *   so that `map.setFeatureState({ source: 'constituencies', id }, state)`
 *   targets the correct feature.
 * - The fill layer's `fill-color` expression prefers `feature-state.color`,
 *   then a data property `color` (if present), then a default color.
 */

export function addConstituencyLayer(map: Map, constituencies: Constituency[]) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: constituencies.map((f, i) => ({
      type: 'Feature' as const,
      id: f.properties.constituency_id,
      geometry: f.geometry,
      properties: { ...f.properties },
    })),
  };
  console.log(geojson.features);
  // sanity check
  geojson.features.forEach((f) => {
    if (!f.id) console.warn('Feature missing id!', f);
  });

  map.addSource('constituencies', {
    type: 'geojson',
    data: geojson,
  });

  map.addLayer({
    id: 'constituencies-fill',
    type: 'fill',
    source: 'constituencies',
    paint: {
      'fill-color': [
        'coalesce',
        ['feature-state', 'color'],
        ['get', 'color'],
        constituency_fill_color,
      ],
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

export function setConstituencyColor(
  map: Map,
  constituencyId: number,
  color: string
) {
  if (!map.getSource('constituencies') || !map.isStyleLoaded()) {
    // Retry after the map is idle (source + layers fully loaded)
    map.once('idle', () => setConstituencyColor(map, constituencyId, color));
    return;
  }

  // setFeatureState works on the source directly, no need to check rendered features
  map.setFeatureState(
    { source: 'constituencies', id: constituencyId },
    { color }
  );
}

/**
 * Clear runtime color for a constituency (remove the color key).
 */
export function clearConstituencyColor(map: Map, constituencyId: number) {
  try {
    map.setFeatureState(
      { source: 'constituencies', id: constituencyId },
      { color: undefined }
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('clearConstituencyColor failed for', constituencyId, e);
  }
}

/**
 * Load party color mapping once and set feature-state color for each leading candidate.
 *
 * Behavior:
 * - Attempts dynamic import of `./data/colorMapping.json` so Vite will resolve the JSON
 *   during dev/build. If that fails, falls back to fetching `/data/colorMapping.json`.
 * - For each candidate in `leadingCandidates`, resolves a color (mapping lookup, then
 *   `default`, then hard-coded fallback) and writes it to feature-state for the
 *   constituency feature id.
 *
 * Notes:
 * - This function is async; callers should `await` it if they want to detect failures.
 * - Feature-state is runtime-only; it is not persisted in the source.
 */
export async function colorConstituenciesByVotes(
  map: Map,
  leadingCandidates: Candidate[]
) {
  const colorMapping: colorMapping =
    await import('../config/colorMapping.json');

  if (colorMapping) {
    for (const candidate of leadingCandidates) {
      let color = colorMapping.parties[candidate.party];
      if (!color) {
        color = colorMapping.others;
      }
      setConstituencyColor(map, candidate.constituency_id, color);
    }
  }
}
