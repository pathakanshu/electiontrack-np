import React, { useRef, useState, useCallback } from 'react';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import ElectionMap from './components/map/ElectionMap';
import Sidebar, { SidebarRef } from './components/layout/Sidebar';
import useElectionData from './hooks/useElectionData';
import useTopology from './hooks/useTopology';
import { setActiveElection, DEFAULT_ELECTION_ID } from './config/elections';
import { invalidateCache } from './data/dataBundler';

import '../styles/main.css';

/**
 * Main Application component that sets up the high-level layout grid.
 * It orchestrates data fetching and distributes it to child components.
 *
 * `selectedElectionId` drives which election is shown. Changing it calls
 * `setActiveElection()` (which updates the module-level active ID read by
 * all data-fetching functions) and increments `dataKey` to remount the
 * data-dependent subtree, forcing a fresh fetch.
 */
const App = () => {
  const sidebarRef = useRef<SidebarRef>(null);
  const [mapInstance, setMapInstance] = React.useState<any>(null);

  // ---- Election selection state ----
  const [selectedElectionId, setSelectedElectionId] =
    useState<string>(DEFAULT_ELECTION_ID);

  // Incrementing this key remounts the data subtree, forcing a full re-fetch
  // with the newly activated election config.
  const [dataKey, setDataKey] = useState(0);

  const handleElectionChange = useCallback((id: string) => {
    // Invalidate module-level caches BEFORE switching so the next fetch
    // uses the new election's endpoints, not stale data from the old one.
    invalidateCache();
    setActiveElection(id);
    setSelectedElectionId(id);
    // Reset the map instance so Sidebar doesn't call highlight functions on
    // the old (already-removed) MapLibre instance during the remount gap.
    setMapInstance(null);
    setDataKey((k) => k + 1);
  }, []);

  return (
    <div id="main-grid">
      <Header
        selectedElectionId={selectedElectionId}
        onElectionChange={handleElectionChange}
      />

      {/*
        Wrapping the data-dependent section in a keyed fragment forces React
        to fully unmount and remount the hooks + map when the election changes,
        ensuring stale data and map state don't linger.
      */}
      <ElectionContent
        key={dataKey}
        sidebarRef={sidebarRef}
        mapInstance={mapInstance}
        setMapInstance={setMapInstance}
      />

      <Footer />
    </div>
  );
};

/**
 * Separate component so the `key` prop on it fully resets hook state
 * (useState, useEffect) when the election changes.
 */
const ElectionContent: React.FC<{
  sidebarRef: React.RefObject<SidebarRef | null>;
  mapInstance: any;
  setMapInstance: (map: any) => void;
}> = ({ sidebarRef, mapInstance, setMapInstance }) => {
  const {
    candidates,
    leadingCandidates,
    stats,
    loading: dataLoading,
    error: dataError,
  } = useElectionData();

  const {
    data: topology,
    loading: topoLoading,
    error: topoError,
  } = useTopology();

  const isLoading = dataLoading || topoLoading;
  const hasError = dataError || topoError;

  if (hasError) {
    return (
      <div style={{ padding: '2rem', gridArea: 'map', color: '#ff4d4d' }}>
        <h2>Failed to load election tracker</h2>
        <p>{dataError?.message || topoError?.message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', gridArea: 'map' }}>
        <div style={{ background: '#444' }}>
          <h2>Initialising Tracker...</h2>
          <p>
            Fetching topology and live election results from the Election
            Commission.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/*
        Sidebar handles the leaderboard and the live watchlist.
      */}
      <Sidebar
        ref={sidebarRef}
        stats={stats}
        candidates={candidates}
        leadingCandidates={leadingCandidates}
        map={mapInstance}
      />

      {/*
        The ElectionMap handles the MapLibre instance and
        the geographic rendering of results.
      */}
      <ElectionMap
        provinces={topology?.provinces || []}
        constituencies={topology?.constituencies || []}
        leadingCandidates={leadingCandidates}
        onMapLoaded={setMapInstance}
        onConstituencyClick={(id) => sidebarRef.current?.addOrMoveToTop(id)}
      />
    </>
  );
};

export default App;
