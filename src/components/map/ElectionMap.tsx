import React, { useEffect, useRef } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
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
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // 1. Initialize the Map instance on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Use the ID of the container div as defined in the DOM
    const map = createMap(mapContainerRef.current.id);
    mapRef.current = map;

    // Cleanup on unmount
    return () => {
      map.remove();
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
    <div className="map-container">
      <div
        id="map"
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default ElectionMap;
