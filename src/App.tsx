import React, { useRef } from 'react';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import ElectionMap from './components/map/ElectionMap';
import Sidebar, { SidebarRef } from './components/layout/Sidebar';
import useElectionData from './hooks/useElectionData';
import useTopology from './hooks/useTopology';
import '../styles/main.css';

/**
 * Main Application component that sets up the high-level layout grid.
 * It orchestrates data fetching and distributes it to child components.
 *
 * It uses the useElectionData and useTopology hooks to handle the heavy lifting
 * of fetching live results and TopoJSON geometry respectively.
 */
const App = () => {
  const sidebarRef = useRef<SidebarRef>(null);

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

  // Combine loading and error states from both asynchronous data sources
  const isLoading = dataLoading || topoLoading;
  const hasError = dataError || topoError;

  return (
    <div id="main-grid">
      <Header />

      <main id="main-container">
        {hasError ? (
          <div style={{ padding: '2rem', gridArea: 'map', color: '#ff4d4d' }}>
            <h2>Failed to load election tracker</h2>
            <p>{dataError?.message || topoError?.message}</p>
          </div>
        ) : isLoading ? (
          <div style={{ padding: '2rem', gridArea: 'map' }}>
            <div style={{ background: '#444' }}>
              <h2>Initialising Tracker...</h2>
              <p>
                Fetching topology and live election results from the Election
                Commission.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/*
              Sidebar handles the leaderboard and the live watchlist.
            */}
            <Sidebar ref={sidebarRef} stats={stats} candidates={candidates} />

            {/*
              The ElectionMap handles the MapLibre instance and
              the geographic rendering of results.
            */}
            <ElectionMap
              provinces={topology?.provinces || []}
              constituencies={topology?.constituencies || []}
              leadingCandidates={leadingCandidates}
              onConstituencyClick={(id) =>
                sidebarRef.current?.addOrMoveToTop(id)
              }
            />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default App;
