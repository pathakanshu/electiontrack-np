import React, { useState, useEffect, useMemo, useRef } from 'react';
import uFuzzy from '@leeoniya/ufuzzy';
import { ElectionStats } from '../../hooks/useElectionData';
import { Candidate } from '../../types/election';
import { getDistrictIdentifiers } from '../../data/dataBundler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SidebarProps {
  stats: ElectionStats | null;
  candidates: Candidate[];
}

/** A single entry in the flat search haystack. */
interface SearchEntry {
  /** The display string that gets searched against. */
  label: string;
  /** Secondary info line shown below the label. */
  meta: string;
  /** Type tag shown in the result preview. */
  type: 'candidate' | 'constituency';
  /** The constituency_id this entry maps to. */
  constituencyId: number;
}

/** Resolved data for a watchlist constituency card. */
interface WatchlistCardData {
  constituencyId: number;
  districtName: string;
  constituencyName: string;
  leader: Candidate;
  totalVotes: number;
}

// ---------------------------------------------------------------------------
// uFuzzy instance (Devanagari-aware)
// ---------------------------------------------------------------------------

/**
 * uFuzzy configured for Unicode / Devanagari support.
 *
 * - `unicode: true` switches internal regexps to Unicode-aware mode.
 * - The `\p{L}` character class covers all Unicode letters, including the
 *   full Devanagari block (consonants, vowels, matras, anusvara, etc.).
 * - `intraMode: 1` (SingleError) tolerates a single typo per search term
 *   which handles common Devanagari mistakes like missing chandrabindu,
 *   swapped anusvara, or dropped visarga.
 */
const uf = new uFuzzy({
  unicode: true,
  interSplit: '[^\\p{L}\\d]+',
  intraSplit: '\\p{Ll}\\p{Lu}',
  intraBound: '\\p{L}\\d|\\d\\p{L}|\\p{Ll}\\p{Lu}',
  intraChars: '[\\p{L}\\d]',
  intraContr: "'\\p{L}{1,2}\\b",
  intraMode: 1,
});

/** Maximum number of results shown in the dropdown. */
const MAX_RESULTS = 10;

/**
 * When uFuzzy's filter phase returns more matches than this, we skip its
 * expensive info+sort phase. Instead we do a cheap prefix-first pre-sort,
 * cap to this limit, then run info+sort on the capped set so that prefix
 * matches always rank at the top even for single-character queries like "क".
 */
const RANK_LIMIT = 1000;

// ---------------------------------------------------------------------------
// Search helper
// ---------------------------------------------------------------------------

/**
 * Run the full uFuzzy pipeline manually (filter → pre-sort → cap → info → sort)
 * so that ranking is always correct regardless of result count.
 */
function rankedSearch(haystack: string[], needle: string): number[] {
  const trimmed = needle.trim();
  if (!trimmed || haystack.length === 0) return [];

  // Step 1: fast regex filter
  let idxs = uf.filter(haystack, trimmed);
  if (!idxs || idxs.length === 0) return [];

  // Step 2: cheap pre-sort — prefix matches bubble to top so they survive the cap
  const needleLower = trimmed.toLowerCase();
  idxs.sort((a, b) => {
    const aPrefix = haystack[a].toLowerCase().startsWith(needleLower) ? 0 : 1;
    const bPrefix = haystack[b].toLowerCase().startsWith(needleLower) ? 0 : 1;
    return aPrefix - bPrefix;
  });

  // Step 3: cap to avoid sorting thousands of entries
  if (idxs.length > RANK_LIMIT) {
    idxs = idxs.slice(0, RANK_LIMIT);
  }

  // Step 4: detailed info + proper ranking
  const info = uf.info(idxs, haystack, trimmed);
  const order = uf.sort(info, haystack, trimmed);

  // Map sort order back to haystack indices
  return order.map((i) => info.idx[i]);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Individual search result row in the dropdown.
 */
const SearchResultItem: React.FC<{
  entry: SearchEntry;
  onSelect: (entry: SearchEntry) => void;
}> = ({ entry, onSelect }) => (
  <li
    className="search-result-item"
    onClick={() => onSelect(entry)}
    role="option"
  >
    <span className="search-result-type">{entry.type}</span>
    <span className="search-result-name">{entry.label}</span>
    <span className="search-result-meta">{entry.meta}</span>
  </li>
);

/**
 * Renders an individual constituency card in the user's watchlist.
 * This is the original card design: district - constituency title,
 * party tag, leading candidate name, and total votes.
 */
const WatchlistItem: React.FC<{
  data: WatchlistCardData;
  onRemove: (constituencyId: number) => void;
}> = ({ data, onRemove }) => (
  <article className="watchlist-item" style={{ position: 'relative' }}>
    <div className="watchlist-item-header">
      <h3 className="watchlist-item-title">
        {data.districtName} - {data.constituencyName}
      </h3>
      <span className="party-tag">{data.leader.party}</span>
    </div>
    <div className="watchlist-item-details">
      <div className="watchlist-item-detail">
        <span className="detail-label">Leading:</span>
        <span className="detail-value">{data.leader.name_np}</span>
      </div>
      <div className="watchlist-item-detail">
        <span className="detail-label">Votes:</span>
        <span className="detail-value">{data.totalVotes.toLocaleString()}</span>
      </div>
    </div>
    <button
      className="watchlist-remove-btn"
      onClick={() => onRemove(data.constituencyId)}
      aria-label={`Remove ${data.districtName} - ${data.constituencyName} from watchlist`}
    >
      ✕
    </button>
  </article>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const Sidebar: React.FC<SidebarProps> = ({ stats, candidates }) => {
  // ---- Leaderboard ----
  const partyEntries = stats ? Object.entries(stats.partyStandings) : [];
  const sortedParties = [...partyEntries].sort(([, a], [, b]) => b - a);
  const topFive = sortedParties.slice(0, 5);

  // ---- District name map (fetched once) ----
  const [districtNames, setDistrictNames] = useState<Record<number, string>>(
    {}
  );

  useEffect(() => {
    getDistrictIdentifiers().then((ids) => {
      const map: Record<number, string> = {};
      for (const d of ids) {
        map[d.id] = d.name;
      }
      setDistrictNames(map);
    });
  }, []);

  // ---- Search state ----
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ---- Watchlist state ----
  const [watchedIds, setWatchedIds] = useState<number[]>([]);

  /**
   * Build the search haystack from candidates.
   *
   * Two kinds of entries:
   *  - Candidate entries (name_np as label)
   *  - Constituency entries (deduplicated, "District - #N" as label)
   *
   * Both map back to a constituency_id so clicking either adds the
   * constituency card to the watchlist.
   */
  const { entries, haystack } = useMemo(() => {
    const entries: SearchEntry[] = [];

    // Candidate entries
    for (const c of candidates) {
      entries.push({
        label: c.name_np,
        meta: `${c.party} · ${c.votes.toLocaleString()} votes`,
        type: 'candidate',
        constituencyId: c.constituency_id,
      });
    }

    // Constituency entries (one per unique constituency_id)
    const seenConstituencies = new Set<number>();
    for (const c of candidates) {
      if (seenConstituencies.has(c.constituency_id)) continue;
      seenConstituencies.add(c.constituency_id);

      const dName = districtNames[c.district] || `District ${c.district}`;
      // Extract the sub-constituency number from the composite ID
      const subId = String(c.constituency_id).slice(String(c.district).length);

      entries.push({
        label: `${dName} - ${subId}`,
        meta: `Constituency`,
        type: 'constituency',
        constituencyId: c.constituency_id,
      });
    }

    const haystack = entries.map((e) => e.label);
    return { entries, haystack };
  }, [candidates, districtNames]);

  /**
   * Run the ranked uFuzzy search whenever the query changes.
   */
  const results = useMemo<SearchEntry[]>(() => {
    const trimmed = query.trim();
    if (!trimmed || haystack.length === 0) return [];

    const orderedIdxs = rankedSearch(haystack, trimmed);
    return orderedIdxs.slice(0, MAX_RESULTS).map((i) => entries[i]);
  }, [query, haystack, entries]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * When a search result is selected, add its constituency to the watchlist.
   */
  const handleSelect = (entry: SearchEntry) => {
    if (!watchedIds.includes(entry.constituencyId)) {
      setWatchedIds((prev) => [...prev, entry.constituencyId]);
    }
    setQuery('');
    setShowResults(false);
  };

  const handleRemove = (constituencyId: number) => {
    setWatchedIds((prev) => prev.filter((id) => id !== constituencyId));
  };

  /**
   * Build resolved watchlist card data from watched constituency IDs.
   * For each constituency: find all its candidates, determine the leader
   * (first in the pre-sorted array), and compute total votes.
   */
  const watchlistCards = useMemo<WatchlistCardData[]>(() => {
    return watchedIds
      .map((cId) => {
        const constituencyCandidates = candidates.filter(
          (c) => c.constituency_id === cId
        );
        if (constituencyCandidates.length === 0) return null;

        const leader = constituencyCandidates[0]; // already sorted by votes desc
        const totalVotes = constituencyCandidates.reduce(
          (sum, c) => sum + c.votes,
          0
        );

        const dName =
          districtNames[leader.district] || `District ${leader.district}`;
        const subId = String(cId).slice(String(leader.district).length);

        return {
          constituencyId: cId,
          districtName: dName,
          constituencyName: subId,
          leader,
          totalVotes,
        };
      })
      .filter((card): card is WatchlistCardData => card !== null);
  }, [watchedIds, candidates, districtNames]);

  return (
    <aside className="sidebar-map-panel">
      {/* Watchlist Section */}
      <div className="sidebar-section watchlist-section">
        <h2 id="watchlist-text">Your Watchlist</h2>

        {/* Search Bar */}
        <div className="search-bar-container" ref={dropdownRef}>
          <input
            type="text"
            placeholder="Search candidates or constituencies..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            className="search-bar-input"
            aria-label="Search candidates or constituencies"
            role="combobox"
            aria-expanded={showResults && results.length > 0}
          />

          {/* Search Results Dropdown */}
          {showResults && query.trim() && (
            <div className="search-results-preview">
              {results.length > 0 ? (
                <ul className="search-results-list" role="listbox">
                  {results.map((entry, i) => (
                    <SearchResultItem
                      key={`${entry.type}-${entry.constituencyId}-${i}`}
                      entry={entry}
                      onSelect={handleSelect}
                    />
                  ))}
                </ul>
              ) : (
                <p className="search-no-results">No results found</p>
              )}
            </div>
          )}
        </div>

        {/* Watchlist Cards */}
        <div className="watchlist-scroll-container">
          <div className="watchlist-content">
            {watchlistCards.length === 0 ? (
              <p className="hint-text">
                Search for a candidate or constituency to add it here.
              </p>
            ) : (
              watchlistCards.map((card) => (
                <WatchlistItem
                  key={card.constituencyId}
                  data={card}
                  onRemove={handleRemove}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Leaderboard Section */}
      <div className="sidebar-section leaderboard-section">
        <div className="parties-index">
          <h3>Leaderboard (Top 5)</h3>
          {topFive.length > 0 ? (
            <ul className="index-list">
              {topFive.map(([party, seats], index) => (
                <li key={party} className="index-item">
                  <span className="rank">#{index + 1}</span>
                  <span className="party-name">{party}</span>
                  <span className="seat-count">{seats}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="status-message">Counting in progress...</p>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
