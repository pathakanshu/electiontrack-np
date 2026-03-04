import { Map } from 'maplibre-gl';
import type {
  Province,
  District,
  Constituency,
  Candidate,
  colorMapping,
} from '../types/election';

const background_color = '#ffffff';

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
const DEFAULT_CENTER: [number, number] = [84.116, 28.41];
const DEFAULT_ZOOM = 6.25;

/**
 * Custom MapLibre control that flies the map back to the default
 * center and zoom when clicked.
 */
class ResetViewControl {
  private _map: Map | null = null;
  private _container: HTMLElement | null = null;
  private _btn: HTMLButtonElement | null = null;
  private _onMove: (() => void) | null = null;

  onAdd(map: Map): HTMLElement {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    const btn = document.createElement('button') as HTMLButtonElement;
    btn.type = 'button';
    btn.title = 'Reset view';
    btn.setAttribute('aria-label', 'Reset view');
    btn.textContent = 'Reset';
    btn.style.display = 'none';
    this._btn = btn;

    btn.addEventListener('click', () => {
      this._map?.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    });

    // Show the button whenever the view differs from the default;
    // hide it again once a flyTo/reset lands back at the default.
    this._onMove = () => {
      if (!this._map || !this._btn) return;
      const zoom = this._map.getZoom();
      const center = this._map.getCenter();
      const moved =
        Math.abs(zoom - DEFAULT_ZOOM) > 0.05 ||
        Math.abs(center.lng - DEFAULT_CENTER[0]) > 0.05 ||
        Math.abs(center.lat - DEFAULT_CENTER[1]) > 0.05;
      this._btn.style.display = moved ? '' : 'none';
    };

    map.on('moveend', this._onMove);

    this._container.appendChild(btn);
    return this._container;
  }

  onRemove(): void {
    if (this._map && this._onMove) {
      this._map.off('moveend', this._onMove);
    }
    this._container?.parentNode?.removeChild(this._container);
    this._map = null;
    this._container = null;
    this._btn = null;
    this._onMove = null;
  }
}

export function createMap(containerID: string): Map {
  const map = new Map({
    container: containerID,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    style: {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': background_color,
            'background-opacity': 0,
          },
        },
      ],
    },
    hash: false,
    attributionControl: false,
  });

  map.addControl(new ResetViewControl(), 'top-right');

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
 * The fill layer uses feature-state `dimmed` to dim non-highlighted
 * constituencies during hover interactions.
 */
export function addConstituencyLayer(map: Map, constituencies: Constituency[]) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: constituencies.map((f) => ({
      type: 'Feature' as const,
      id: f.properties.constituency_id,
      geometry: f.geometry,
      properties: { ...f.properties },
    })),
  };

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
      // Dim non-highlighted constituencies to 0.15 opacity when a highlight
      // is active; otherwise render at full opacity.
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'dimmed'], false],
        0.15,
        constituency_fill_opacity,
      ],
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
    map.once('idle', () => setConstituencyColor(map, constituencyId, color));
    return;
  }

  map.setFeatureState(
    { source: 'constituencies', id: constituencyId },
    { color }
  );
}

/**
 * Highlight a specific set of constituency IDs and dim all others.
 *
 * @param map             - The MapLibre instance
 * @param highlightIds    - Set of constituency_ids to keep at full opacity
 * @param allCandidates   - All leading candidates (one per constituency),
 *                          used to know which feature IDs exist in the source
 */
export function highlightConstituencies(
  map: Map,
  highlightIds: Set<number>,
  allCandidates: Candidate[]
) {
  if (!map.getSource('constituencies')) return;

  for (const candidate of allCandidates) {
    const dimmed = !highlightIds.has(candidate.constituency_id);
    map.setFeatureState(
      { source: 'constituencies', id: candidate.constituency_id },
      { dimmed }
    );
  }
}

/**
 * Clear all highlight/dim state, restoring every constituency to full opacity.
 */
export function clearHighlights(map: Map, allCandidates: Candidate[]) {
  if (!map.getSource('constituencies')) return;

  for (const candidate of allCandidates) {
    map.setFeatureState(
      { source: 'constituencies', id: candidate.constituency_id },
      { dimmed: false }
    );
  }
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
    console.warn('clearConstituencyColor failed for', constituencyId, e);
  }
}

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
