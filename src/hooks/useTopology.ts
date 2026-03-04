import { useState, useEffect } from 'react';
import { feature } from 'topojson-client';
import {
  fetchTopology,
  toProvinceFeature,
  toConstituencyFeature,
} from '../utils/geo';
import { Province, Constituency } from '../types/election';

/**
 * Custom hook to fetch and parse the TopoJSON geometry.
 * It handles the conversion from TopoJSON objects to typed GeoJSON FeatureCollections
 * used by MapLibre and the application.
 */
export const useTopology = () => {
  const [data, setData] = useState<{
    provinces: Province[];
    districts: any[];
    constituencies: Constituency[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadTopology = async () => {
      try {
        setLoading(true);
        // fetchTopology includes validation to ensure it's a valid Topology with expected objects
        const topo = await fetchTopology('/data/geometry.topo.json');

        /* Convert TopoJSON province data into GeoJSON FeatureCollection */
        const provincesFC = feature<
          GeoJSON.MultiPolygon,
          Province['properties']
        >(topo, 'provinces');

        /* Convert TopoJSON district data into GeoJSON FeatureCollection */
        const districtsFC = feature<GeoJSON.MultiPolygon, any>(
          topo,
          'districts'
        );

        /* Convert TopoJSON constituency data into GeoJSON FeatureCollection */
        const constituenciesFC = feature<
          GeoJSON.MultiPolygon,
          Constituency['properties']
        >(topo, 'constituencies');

        // Map GeoJSON features into application-specific Province/Constituency types
        const provinces = provincesFC.features.map(toProvinceFeature);
        const districts = districtsFC.features;
        const constituencies = constituenciesFC.features.map((f) => {
          const c = toConstituencyFeature(f);
          const district = districts.find(
            (d) => d.properties.district_id === c.properties.district_id
          );
          if (district) {
            c.properties.district_name = district.properties.name_np;
          }
          return c;
        });

        setData({ provinces, districts, constituencies });
      } catch (err) {
        console.error('[useTopology] Error loading geometry:', err);
        setError(
          err instanceof Error ? err : new Error('Failed to load topology')
        );
      } finally {
        setLoading(false);
      }
    };

    loadTopology();
  }, []);

  return {
    data,
    loading,
    error,
  };
};

export default useTopology;
