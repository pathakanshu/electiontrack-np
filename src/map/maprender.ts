import { Map } from 'maplibre-gl';

/**
 * Module-level set of ALL constituency feature IDs added to the map,
 * including conservation areas. Used by highlight/clear functions so
 * conservation areas get dimmed too (they have no candidates, so the
 * candidate-based loop alone misses them).
 */
let _allConstituencyIds: Set<number> = new Set();
import type {
  Province,
  District,
  Constituency,
  Candidate,
  colorMapping,
} from '../types/election';

/** Light / dark color palettes for the map layers. */
const MAP_COLORS = {
  light: {
    background: '#ffffff',
    border: '#ffffff',
    provinceBorder: '#ffffff',
    provinceFill: '#a0a0a0',
    districtFill: '#a0a0a0',
    constituencyFill: '#9a9a9a',
  },
  dark: {
    background: '#141414',
    border: '#222222',
    provinceBorder: '#141414',
    provinceFill: '#3a3a3a',
    districtFill: '#3a3a3a',
    constituencyFill: '#333333',
  },
} as const;

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function mapColors() {
  return isDark() ? MAP_COLORS.dark : MAP_COLORS.light;
}

const province_fill_opacity = 0;
const province_border_width = 1.25;
const province_border_opacity = 1;

// district is not used in HOR elections
const district_fill_opacity = 1;
const district_border_width = 1;
const district_border_opacity = 1;

const constituency_fill_opacity = 1;
const constituency_border_width = 1;
const constituency_border_opacity = 1;

/**
 * Create a basic MapLibre map instance with a minimal style.
 */
const DEFAULT_CENTER: [number, number] = [84.116, 28.41];
const DEFAULT_ZOOM = 6.25;

/**
 * Nepal's geographic bounding box [west, south, east, north].
 * Used by fitBounds to automatically size the map to the container.
 * Slightly padded so the edges don't clip.
 */
const NEPAL_BOUNDS: [[number, number], [number, number]] = [
  [79.9, 26.3], // southwest
  [88.3, 30.5], // northeast
];

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
      this._map?.fitBounds(NEPAL_BOUNDS, { padding: 10, duration: 800 });
    });

    // Show the button whenever the view differs from the default;
    // hide it again once a flyTo/reset lands back at the default.
    this._onMove = () => {
      if (!this._map || !this._btn) return;
      const zoom = this._map.getZoom();
      const center = this._map.getCenter();
      const moved =
        Math.abs(zoom - DEFAULT_ZOOM) > 0.5 ||
        Math.abs(center.lng - DEFAULT_CENTER[0]) > 0.3 ||
        Math.abs(center.lat - DEFAULT_CENTER[1]) > 0.3;
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
  const colors = mapColors();
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
            'background-color': colors.background,
            'background-opacity': 0,
          },
        },
      ],
    },
    hash: false,
    attributionControl: false,
  });

  map.addControl(new ResetViewControl(), 'top-right');

  // Once the map is ready, fit to Nepal's bounds so it always fills
  // the container perfectly regardless of screen/panel size.
  map.once('load', () => {
    map.fitBounds(NEPAL_BOUNDS, { padding: 10, duration: 0 });
  });

  // Re-fit on resize so it stays correct if the window changes.
  map.on('resize', () => {
    map.fitBounds(NEPAL_BOUNDS, { padding: 10, duration: 0 });
  });

  return map;
}

/**
 * Update all map layer paint properties to match the current light/dark theme.
 * Call this whenever the user toggles dark mode.
 */
export function updateMapTheme(map: Map): void {
  const colors = mapColors();

  // Background
  if (map.getLayer('background')) {
    map.setPaintProperty('background', 'background-color', colors.background);
  }

  // Provinces
  if (map.getLayer('provinces-fill')) {
    map.setPaintProperty('provinces-fill', 'fill-color', colors.provinceFill);
  }
  if (map.getLayer('provinces-border')) {
    map.setPaintProperty(
      'provinces-border',
      'line-color',
      colors.provinceBorder
    );
  }

  // Districts
  if (map.getLayer('districts-fill')) {
    map.setPaintProperty('districts-fill', 'fill-color', colors.districtFill);
  }
  if (map.getLayer('districts-border')) {
    map.setPaintProperty('districts-border', 'line-color', colors.border);
  }

  // Constituencies — update the fallback color in the coalesce expression.
  // The expression is: ['coalesce', ['feature-state', 'color'], ['get', 'color'], fallback]
  // Constituencies with a party color keep it; only the default gray changes.
  if (map.getLayer('constituencies-fill')) {
    map.setPaintProperty('constituencies-fill', 'fill-color', [
      'coalesce',
      ['feature-state', 'color'],
      ['get', 'color'],
      colors.constituencyFill,
    ]);
  }
  if (map.getLayer('constituencies-border')) {
    map.setPaintProperty('constituencies-border', 'line-color', colors.border);
  }
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

  const colors = mapColors();
  map.addLayer({
    id: 'provinces-fill',
    type: 'fill',
    source: 'provinces',
    paint: {
      'fill-color': colors.provinceFill,
      'fill-opacity': province_fill_opacity,
    },
  });
}

/**
 * Add province border lines. Call this AFTER constituency layers so the
 * borders render on top and aren't hidden beneath constituency fills.
 */
export function addProvinceBordersLayer(map: Map) {
  if (!map.getSource('provinces')) return;
  const colors = mapColors();
  map.addLayer({
    id: 'provinces-border',
    type: 'line',
    source: 'provinces',
    paint: {
      'line-color': colors.provinceBorder,
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

  const colors = mapColors();
  map.addLayer({
    id: 'districts-fill',
    type: 'fill',
    source: 'districts',
    paint: {
      'fill-color': colors.districtFill,
      'fill-opacity': district_fill_opacity,
    },
  });

  map.addLayer({
    id: 'districts-border',
    type: 'line',
    source: 'districts',
    paint: {
      'line-color': colors.border,
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
  // Track every feature ID so highlight/clear can dim conservation areas too
  _allConstituencyIds = new Set(
    constituencies.map((f) => f.properties.constituency_id)
  );

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

  const colors = mapColors();
  map.addLayer({
    id: 'constituencies-fill',
    type: 'fill',
    source: 'constituencies',
    paint: {
      'fill-color': [
        'coalesce',
        ['feature-state', 'color'],
        ['get', 'color'],
        colors.constituencyFill,
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
      'line-color': colors.border,
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

  // Collect IDs touched by the candidate loop so we know which ones
  // are left over (conservation areas, etc.)
  const touched = new Set<number>();

  for (const candidate of allCandidates) {
    touched.add(candidate.constituency_id);
    const dimmed = !highlightIds.has(candidate.constituency_id);
    map.setFeatureState(
      { source: 'constituencies', id: candidate.constituency_id },
      { dimmed }
    );
  }

  // Dim any constituency features NOT covered by candidates
  // (conservation areas have no candidates but are in the source)
  for (const id of _allConstituencyIds) {
    if (!touched.has(id)) {
      map.setFeatureState(
        { source: 'constituencies', id },
        { dimmed: !highlightIds.has(id) }
      );
    }
  }
}

/**
 * Clear all highlight/dim state, restoring every constituency to full opacity.
 */
export function clearHighlights(map: Map, allCandidates: Candidate[]) {
  if (!map.getSource('constituencies')) return;

  // Clear candidate constituencies
  for (const candidate of allCandidates) {
    map.setFeatureState(
      { source: 'constituencies', id: candidate.constituency_id },
      { dimmed: false }
    );
  }

  // Also clear conservation areas and any other non-candidate features
  for (const id of _allConstituencyIds) {
    map.setFeatureState({ source: 'constituencies', id }, { dimmed: false });
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
  // Load color mapping BEFORE touching the map so there's no gap between
  // clearing stale colors and painting new ones (the dynamic import
  // resolves on the next microtask — even when cached — which gave
  // MapLibre a frame to render a fully grey map).
  const colorMapping: colorMapping =
    await import('../config/colorMapping.json');

  if (!colorMapping) return;

  // Paint new colors first, tracking which IDs we touched.
  const painted = new Set<number>();

  for (const candidate of leadingCandidates) {
    let color = colorMapping.parties[candidate.party];
    if (!color) {
      color = colorMapping.others;
    }
    setConstituencyColor(map, candidate.constituency_id, color);
    painted.add(candidate.constituency_id);
  }

  // Only THEN clear constituencies that are no longer in the data.
  // This avoids the flash-of-grey: stale colors are removed after new
  // ones are already in place.
  for (const id of _allConstituencyIds) {
    if (!painted.has(id)) {
      clearConstituencyColor(map, id);
    }
  }
}
