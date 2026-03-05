import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useLanguage, useTranslation } from './i18n';
import { getAllElections } from './config/elections';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import ElectionMap from './components/map/ElectionMap';
import Sidebar, { SidebarRef } from './components/layout/Sidebar';
import useElectionData from './hooks/useElectionData';
import useTopology from './hooks/useTopology';
import useHashRouter from './hooks/useHashRouter';
import {
  setActiveElection,
  DEFAULT_ELECTION_ID,
  getCurrentElection,
} from './config/elections';

import { invalidateCache } from './data/dataBundler';
import { updateMapTheme } from './map/maprender';
import StatisticsPage from './components/statistics/StatisticsPage';

import '../styles/main.css';
import '../styles/statistics.css';

/**
 * Main Application component that sets up the high-level layout grid.
 * It orchestrates data fetching and distributes it to child components.
 *
 * `selectedElectionId` drives which election is shown. Changing it calls
 * `setActiveElection()` (which updates the module-level active ID read by
 * all data-fetching functions) and increments `dataKey` to remount the
 * data-dependent subtree, forcing a fresh fetch.
 *
 * Routing:
 *   #/            → Home (map + sidebar)
 *   #/statistics  → Statistics deep-dive page + sidebar
 */
const App = () => {
  const sidebarRef = useRef<SidebarRef>(null);
  const [mapInstance, setMapInstance] = React.useState<any>(null);
  const { path } = useHashRouter();
  const { locale } = useLanguage();

  // Sync the <html lang="..."> attribute with the active locale so that
  // CSS can swap font-families (e.g. Noto Serif Devanagari when lang="np").
  useEffect(() => {
    document.documentElement.lang = locale === 'np' ? 'ne' : 'en';
  }, [locale]);

  // Update map layer colors whenever the theme attribute changes.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (mapInstance && mapInstance.isStyleLoaded()) {
        updateMapTheme(mapInstance);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [mapInstance]);

  // ---- Election selection state ----
  const [selectedElectionId, setSelectedElectionId] =
    useState<string>(DEFAULT_ELECTION_ID);

  // Incrementing this key remounts the data subtree, forcing a full re-fetch
  // with the newly activated election config.
  const [dataKey, setDataKey] = useState(0);

  // ---- Poll cache file for changes (HEAD request, no body) ----
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const url = getCurrentElection().endpoints.candidates;
    let lastETag: string | null = null;
    let lastModified: string | null = null;

    const check = async () => {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (!res.ok) return;

        const etag = res.headers.get('etag');
        const mod = res.headers.get('last-modified');

        // First check — just record baseline
        if (lastETag === null && lastModified === null) {
          lastETag = etag;
          lastModified = mod;
          return;
        }

        if (etag !== lastETag || mod !== lastModified) {
          lastETag = etag;
          lastModified = mod;
          setRefreshKey((k) => k + 1);
        }
      } catch {
        // silently skip
      }
    };

    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [selectedElectionId]);

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

  const isStatsPage = path === '/statistics';

  return (
    <div id="main-grid" className={isStatsPage ? 'main-grid--stats-page' : ''}>
      <Navbar selectedElectionId={selectedElectionId} />

      <Header
        selectedElectionId={selectedElectionId}
        onElectionChange={handleElectionChange}
      />

      <AppContent
        key={dataKey}
        isStatsPage={isStatsPage}
        sidebarRef={sidebarRef}
        mapInstance={mapInstance}
        setMapInstance={setMapInstance}
        refreshKey={refreshKey}
      />

      <Footer />
    </div>
  );
};

/**
 * Full-width utility navbar — spans both columns at the very top of the grid.
 * Contains stats/map link, dark mode toggle, and language toggle.
 */
const Navbar: React.FC<{ selectedElectionId: string }> = ({
  selectedElectionId,
}) => {
  const { locale, setLocale } = useLanguage();
  const { t } = useTranslation();
  const { path } = useHashRouter();
  const isStatsPage = path === '/statistics';
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      return stored === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Sync the data-theme attribute and localStorage whenever `dark` changes.
  useEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [dark]);

  // Listen for OS-level color scheme changes (only if user hasn't set a manual pref).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('theme')) {
        setDark(e.matches);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleDark = useCallback(() => {
    setDark((prev) => !prev);
  }, []);

  const allElections = getAllElections();
  const selected = allElections.find((e) => e.id === selectedElectionId);
  const electionLabel =
    locale === 'np'
      ? (selected?.nameNp ?? selected?.name ?? selectedElectionId)
      : (selected?.name ?? selectedElectionId);

  return (
    <nav className="top-navbar">
      <ul className="top-navbar__list">
        <li className="top-navbar__item top-navbar__item--stats">
          {isStatsPage ? (
            <a href="#/">{t('nav_map' as any)}</a>
          ) : (
            <a href="#/statistics">{t('nav_statistics' as any)}</a>
          )}
        </li>
        <li className="top-navbar__election">
          <span className="top-navbar__election-label">{electionLabel}</span>
        </li>
        <li style={{ marginLeft: 'auto' }}>
          <button
            className="dark-mode-btn"
            onClick={toggleDark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={
              locale === 'np'
                ? dark
                  ? 'लाइट मोड'
                  : 'डार्क मोड'
                : dark
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
            }
          >
            {dark ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </li>
        <li className="top-navbar__lang">
          <button
            className={`lang-btn${locale === 'en' ? ' lang-btn-active' : ''}`}
            onClick={() => setLocale('en')}
            aria-pressed={locale === 'en'}
          >
            EN
          </button>
          <span className="lang-sep">/</span>
          <button
            className={`lang-btn${locale === 'np' ? ' lang-btn-active' : ''}`}
            onClick={() => setLocale('np')}
            aria-pressed={locale === 'np'}
          >
            नेपाली
          </button>
        </li>
      </ul>
    </nav>
  );
};

/**
 * Inner component that owns the data hooks. Using `key={dataKey}` on this
 * component fully resets all hook state when the election changes.
 *
 * The sidebar is ALWAYS rendered (both on home and stats pages) so the
 * watchlist and leaderboard persist across navigation.
 */
const AppContent: React.FC<{
  isStatsPage: boolean;
  sidebarRef: React.RefObject<SidebarRef | null>;
  mapInstance: any;
  setMapInstance: (map: any) => void;
  refreshKey: number;
}> = ({ isStatsPage, sidebarRef, mapInstance, setMapInstance, refreshKey }) => {
  const { t } = useTranslation();

  const {
    candidates,
    leadingCandidates,
    stats,
    prParties,
    loading: dataLoading,
    error: dataError,
  } = useElectionData(refreshKey);

  const {
    data: topology,
    loading: topoLoading,
    error: topoError,
  } = useTopology();

  const isLoading = dataLoading || topoLoading;
  const hasError = dataError || topoError;

  // ── Error state ──
  if (hasError && !isStatsPage) {
    return (
      <>
        <div style={{ padding: '2rem', gridArea: 'map', color: '#ca0001' }}>
          <h2>{t('error_title')}</h2>
          <p>{dataError?.message || topoError?.message}</p>
        </div>
        <Sidebar
          ref={sidebarRef}
          stats={stats}
          candidates={candidates}
          leadingCandidates={leadingCandidates}
          prParties={prParties}
          map={null}
        />
      </>
    );
  }

  // ── Loading state (home page only — stats page has its own loader) ──
  if (isLoading && !isStatsPage) {
    return (
      <>
        <div style={{ padding: '2rem', gridArea: 'map' }}>
          <div
            style={{
              background: '#f9f9f7',
              border: '1px solid #e0e0dc',
              padding: '1.5rem 2rem',
            }}
          >
            <h2
              style={{
                fontFamily:
                  "var(--font-heading, 'Instrument Serif', Georgia, serif)",
                fontWeight: 400,
                margin: '0 0 0.25rem',
              }}
            >
              {t('loading_title')}
            </h2>
            <p style={{ color: '#999', fontSize: '0.85rem', margin: 0 }}>
              {t('loading_description')}
            </p>
          </div>
        </div>
        <Sidebar
          ref={sidebarRef}
          stats={stats}
          candidates={candidates}
          leadingCandidates={leadingCandidates}
          prParties={prParties}
          map={null}
        />
      </>
    );
  }

  // ── Stats page ──
  if (isStatsPage) {
    return (
      <>
        <div className="stats-page-wrapper">
          <StatisticsPage refreshKey={refreshKey} />
        </div>
        <Sidebar
          ref={sidebarRef}
          stats={stats}
          candidates={candidates}
          leadingCandidates={leadingCandidates}
          prParties={prParties}
          map={null}
        />
      </>
    );
  }

  // ── Home page (map + sidebar) ──
  return (
    <>
      <Sidebar
        ref={sidebarRef}
        stats={stats}
        candidates={candidates}
        leadingCandidates={leadingCandidates}
        prParties={prParties}
        map={mapInstance}
      />

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
