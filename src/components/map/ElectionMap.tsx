import React, { useEffect, useRef, useMemo } from 'react';
import ColorIndex from './ColorIndex';
import { Map as MapLibreMap, Popup } from 'maplibre-gl';
import {
  createMap,
  addProvincesLayer,
  addConstituencyLayer,
  colorConstituenciesByVotes,
} from '../../map/maprender';
import { Province, Constituency, Candidate } from '../../types/election';

interface ElectionMapProps {
  provinces: Province[];
  constituencies: Constituency[];
  leadingCandidates: Candidate[];
  onConstituencyClick?: (constituencyId: number) => void;
  onMapLoaded?: (map: MapLibreMap) => void;
}

/**
 * ElectionMap Component
 * A React wrapper for MapLibre GL that handles the election geography.
 * It manages the map lifecycle and updates layers/colors when data changes.
 */
const ElectionMap: React.FC<ElectionMapProps> = ({
  provinces,
  constituencies,
  leadingCandidates,
  onConstituencyClick,
  onMapLoaded,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // Keep a stable ref to leadingCandidates so the popup effect can read
  // the latest value without needing to re-register map event listeners.
  const leadingCandidatesRef = useRef<Candidate[]>(leadingCandidates);
  useEffect(() => {
    leadingCandidatesRef.current = leadingCandidates;
  }, [leadingCandidates]);

  // Build a lookup map: constituency_id → leading Candidate for O(1) access
  const leadingByConstituency = useMemo(() => {
    const m = new Map<number, Candidate>();
    for (const c of leadingCandidates) {
      m.set(c.constituency_id, c);
    }
    return m;
  }, [leadingCandidates]);

  const leadingByConstituencyRef = useRef(leadingByConstituency);
  useEffect(() => {
    leadingByConstituencyRef.current = leadingByConstituency;
  }, [leadingByConstituency]);

  // 1. Initialize the Map instance on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Use the ID of the container div as defined in the DOM
    const map = createMap(mapContainerRef.current.id);
    mapRef.current = map;

    if (onMapLoaded) {
      onMapLoaded(map);
    }

    // Cleanup on unmount
    return () => {
      map.remove();
    };
  }, []);

  // 1.5. Add hover popup logic
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'constituency-popup',
    });

    const onMouseMove = (e: any) => {
      if (e.features && e.features.length > 0) {
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features[0];
        const { district_name, sub_id, constituency_id } = feature.properties;

        let html: string;
        if (constituency_id === 5999) {
          html = `<div style="padding:4px 8px;color:#000;font-weight:600;font-family:sans-serif;">संरक्षण क्षेत्र</div>`;
        } else {
          const header = `${district_name || 'District ' + feature.properties.district_id} - ${sub_id}`;
          const leader = leadingByConstituencyRef.current.get(
            Number(constituency_id)
          );
          const leaderLine = leader
            ? `<div style="font-size:0.78rem;color:#333;margin-top:2px;">${leader.name_np} · ${leader.party}</div>`
            : '';
          html = `<div style="padding:4px 8px;font-family:sans-serif;">
            <div style="font-weight:600;color:#000;">${header}</div>
            ${leaderLine}
          </div>`;
        }

        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      }
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };

    const onClick = (e: any) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        if (onConstituencyClick) {
          onConstituencyClick(feature.id as number);
        }
      }
    };

    map.on('mousemove', 'constituencies-fill', onMouseMove);
    map.on('mouseleave', 'constituencies-fill', onMouseLeave);
    map.on('click', 'constituencies-fill', onClick);

    return () => {
      map.off('mousemove', 'constituencies-fill', onMouseMove);
      map.off('mouseleave', 'constituencies-fill', onMouseLeave);
      map.off('click', 'constituencies-fill', onClick);
      popup.remove();
    };
  }, []);

  // 2. Add Sources and Layers when GeoJSON data is ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setupLayers = () => {
      // Add Province boundaries
      if (provinces.length > 0 && !map.getSource('provinces')) {
        addProvincesLayer(map, provinces);
      }
      // Add Constituency boundaries
      if (constituencies.length > 0 && !map.getSource('constituencies')) {
        addConstituencyLayer(map, constituencies);
      }
    };

    if (map.loaded()) {
      setupLayers();
    } else {
      map.once('load', setupLayers);
    }
  }, [provinces, constituencies]);

  // 3. Color constituencies when leading candidate data is available
  useEffect(() => {
    const map = mapRef.current;
    if (!map || leadingCandidates.length === 0) return;

    const colorMap = async () => {
      // Ensure the source exists before attempting to color it via feature-state
      if (map.getSource('constituencies')) {
        await colorConstituenciesByVotes(map, leadingCandidates);
      }
    };

    // Listen for source data events to catch the moment the 'constituencies' source is ready
    const onSourceData = (e: any) => {
      if (e.sourceId === 'constituencies' && e.isSourceLoaded) {
        colorMap();
      }
    };

    map.on('sourcedata', onSourceData);

    // Attempt immediate coloring if the map and source are already present
    colorMap();

    return () => {
      map.off('sourcedata', onSourceData);
    };
  }, [leadingCandidates]);

  return (
    <div className="map-container" style={{ position: 'relative' }}>
      <div
        id="map"
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%' }}
      />
      <ColorIndex leadingCandidates={leadingCandidates} />
    </div>
  );
};

export default ElectionMap;
