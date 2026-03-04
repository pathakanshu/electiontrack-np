import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import uFuzzy from '@leeoniya/ufuzzy';
import { ElectionStats } from '../../hooks/useElectionData';
import { Candidate } from '../../types/election';
import { getDistrictIdentifiers } from '../../data/dataBundler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { getCurrentElection } from '../../config/elections';
import { highlightConstituencies, clearHighlights } from '../../map/maprender';
import colorMapping from '../../config/colorMapping.json';

interface SidebarProps {
  stats: ElectionStats | null;
  candidates: Candidate[];
  /** The single leading candidate per constituency — used for party highlighting. */
  leadingCandidates: Candidate[];
  map: any;
}

export interface SidebarRef {
  addOrMoveToTop: (id: number) => void;
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

/** URL pattern for cached party symbol images. */
const SYMBOL_IMG_URL = '/cache/symbols';

/** Resolved data for a watchlist constituency card. */
interface WatchlistCardData {
  constituencyId: number;
  districtName: string;
  constituencyName: string;
  /** Top 3 candidates sorted by votes descending. */
  topCandidates: Candidate[];
  totalVotes: number;
  /** The leading (winning) party name for this constituency. */
  leadingParty: string;
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
const MAX_RESULTS = 20;

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
/**
 * Score how well a haystack string matches the needle as a prefix.
 *
 * Returns a number where **lower is better**:
 *   0 — the label starts with the full needle (best)
 *   1 — the first *word* of the label starts with the needle
 *   2 — the needle appears somewhere inside the label
 *   3 — no straightforward prefix relationship (pure fuzzy match)
 *
 * Within tiers 0 and 1 shorter labels are preferred so that
 * "काठमाडौं - 1" (close match) beats "काठमाडौंको …" (longer noise).
 */
function prefixScore(label: string, needle: string): number {
  const ll = label.toLowerCase();
  const nl = needle.toLowerCase();
  if (ll.startsWith(nl)) return 0;
  // Check first word (everything before the first space / separator)
  const firstWord = ll.split(/[\s\-–—]+/)[0];
  if (firstWord.startsWith(nl)) return 1;
  if (ll.includes(nl)) return 2;
  return 3;
}

function rankedSearch(haystack: string[], needle: string): number[] {
  const trimmed = needle.trim();
  if (!trimmed || haystack.length === 0) return [];

  // Step 1: fast regex filter
  let idxs = uf.filter(haystack, trimmed);
  if (!idxs || idxs.length === 0) return [];

  // Step 2: cheap pre-sort — prefix matches bubble to top so they survive the cap
  idxs.sort((a, b) => {
    const pa = prefixScore(haystack[a], trimmed);
    const pb = prefixScore(haystack[b], trimmed);
    if (pa !== pb) return pa - pb;
    // Within the same prefix tier, prefer shorter labels (closer match)
    return haystack[a].length - haystack[b].length;
  });

  // Step 3: cap to avoid sorting thousands of entries
  if (idxs.length > RANK_LIMIT) {
    idxs = idxs.slice(0, RANK_LIMIT);
  }

  // Step 4: detailed info + uFuzzy ranking
  const info = uf.info(idxs, haystack, trimmed);
  const order = uf.sort(info, haystack, trimmed);

  // Step 5: re-sort by prefix closeness so that type-agnostic prefix
  // matches always beat pure fuzzy matches, regardless of uFuzzy's
  // internal scoring which can't distinguish "का" → "काठमाडौं" from
  // "का" → "कपिल" when both start at position 0 with 0 insertions.
  const ranked = order.map((i) => info.idx[i]);
  ranked.sort((a, b) => {
    const pa = prefixScore(haystack[a], trimmed);
    const pb = prefixScore(haystack[b], trimmed);
    if (pa !== pb) return pa - pb;
    return haystack[a].length - haystack[b].length;
  });

  return ranked;
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
 *
 * Layout:
 *  ┌─ header: "District - N"  ✕ ──────────────┐
 *  │  left: candidate names │ right: 3 symbols │
 *  │   1. Name              │  🔶  🔷  🔶     │
 *  │   2. Name              │ votes votes votes │
 *  │   3. Name              │                   │
 *  ├─ bottom bar ──────────────────────────────┤
 *  │  Total votes: X                            │
 *  └────────────────────────────────────────────┘
 */
const WatchlistItem: React.FC<{
  data: WatchlistCardData;
  onRemove: (constituencyId: number) => void;
  map: any;
  leadingCandidates: Candidate[];
}> = ({ data, onRemove, map, leadingCandidates }) => {
  // Track whether the mouse is still inside this card. When a party-highlight
  // child clears all highlights on mouse-leave, we use this to immediately
  // restore the card-level constituency highlight.
  const enterCard = () => {
    if (map)
      highlightConstituencies(
        map,
        new Set([data.constituencyId]),
        leadingCandidates
      );
  };

  const leaveCard = () => {
    if (map) clearHighlights(map, leadingCandidates);
  };

  const enterParty = (party: string) => {
    if (!map) return;
    const ids = new Set(
      leadingCandidates
        .filter((c) => c.party === party)
        .map((c) => c.constituency_id)
    );
    highlightConstituencies(map, ids, leadingCandidates);
  };

  const leaveParty = () => {
    if (!map) return;
    highlightConstituencies(
      map,
      new Set([data.constituencyId]),
      leadingCandidates
    );
  };

  return (
    <article
      className="watchlist-item"
      onMouseEnter={enterCard}
      onMouseLeave={leaveCard}
    >
      {/* Top bar: title + total votes + remove button */}
      <div className="watchlist-item-topbar">
        {/*
        The title acts as a tooltip target: hovering it shows the leading
        party name via the native `title` attribute. For a richer experience
        we also store it in a data attribute so CSS can surface it.
      */}
        <h3
          className="watchlist-item-title"
          title={`Leading: ${data.leadingParty}`}
        >
          <span className="watchlist-title-district">{data.districtName}</span>
          <span className="watchlist-title-sep">-</span>
          <span className="watchlist-title-id">{data.constituencyName}</span>
          <span className="watchlist-title-leading-party">
            {data.leadingParty}
          </span>
        </h3>
        <span className="topbar-stat">
          <span className="topbar-value">
            {data.totalVotes.toLocaleString()}
          </span>
          <span className="topbar-label"> votes</span>
        </span>
        <button
          className="watchlist-remove-btn"
          onClick={() => onRemove(data.constituencyId)}
          aria-label={`Remove ${data.districtName} - ${data.constituencyName} from watchlist`}
        >
          ✕
        </button>
      </div>

      {/* Body: names on left, symbols + votes on right */}
      <div className="watchlist-item-body">
        {/* Left — top 3 candidate names */}
        <ol className="watchlist-candidates-list">
          {data.topCandidates.map((c) => {
            const partyColor =
              (colorMapping.parties as any)[c.party] || colorMapping.others;
            return (
              <li key={c.candidate_id} className="watchlist-candidate-name">
                {/*
                Dot: hovering highlights ALL constituencies belonging to
                this party across the whole map (party-wide dimming effect).
              */}
                <span
                  className="party-color-dot"
                  style={{ backgroundColor: partyColor }}
                  title={c.party}
                  aria-label={c.party}
                  onMouseEnter={() => enterParty(c.party)}
                  onMouseLeave={() => leaveParty()}
                />
                {/*
                Name text: hovering highlights only THIS candidate's
                constituency on the map (single-constituency highlight).
              */}
                <span className="watchlist-candidate-name-text">
                  {c.name_np}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Right — 3 columns: symbol image + vote count */}
        <div className="watchlist-symbols-row">
          {data.topCandidates.map((c) => (
            <div
              key={c.candidate_id}
              className="watchlist-symbol-col"
              onMouseEnter={() => enterParty(c.party)}
              onMouseLeave={() => leaveParty()}
            >
              {c.symbol_id && c.symbol_id !== 0 ? (
                <img
                  className="watchlist-symbol-img"
                  src={`${SYMBOL_IMG_URL}/${c.symbol_id}.jpg`}
                  alt={c.party}
                  title={c.party}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLElement).parentElement;
                    if (
                      parent &&
                      !parent.querySelector('.watchlist-symbol-fallback')
                    ) {
                      const fallback = document.createElement('div');
                      fallback.className = 'watchlist-symbol-fallback';
                      fallback.title = c.party || '';
                      fallback.innerText = c.party?.slice(0, 2) || '??';
                      parent.appendChild(fallback);
                    }
                  }}
                />
              ) : (
                <div className="watchlist-symbol-fallback" title={c.party}>
                  {c.party?.slice(0, 2) || '??'}
                </div>
              )}
              <span className="watchlist-symbol-votes">
                {c.votes.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const Sidebar = React.forwardRef<SidebarRef, SidebarProps>(
  ({ stats, candidates, leadingCandidates, map }, ref) => {
    const currentElection = getCurrentElection();

    // ---- Incomplete Data Warning ----
    const DataWarning = currentElection.missingData ? (
      <div
        className="data-warning-banner"
        style={{
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          border: '1px solid #ffc107',
          color: '#ffc107',
          padding: '12px',
          marginBottom: '16px',
          borderRadius: '4px',
          fontSize: '0.85rem',
          lineHeight: '1.4',
        }}
      >
        Symbol images for this year are unavailable from the source.
      </div>
    ) : null;

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

    // ---- Watchlist state (persisted in localStorage) ----
    const WATCHLIST_KEY = 'electiontrack-watchlist';
    const [watchedIds, setWatchedIds] = useState<number[]>(() => {
      try {
        const stored = localStorage.getItem(WATCHLIST_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    });

    useEffect(() => {
      try {
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchedIds));
      } catch {
        // localStorage full or unavailable — silently ignore
      }
    }, [watchedIds]);

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
        const subId = String(c.constituency_id).slice(
          String(c.district).length
        );

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
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    /**
     * When a search result is selected, add its constituency to the watchlist.
     */
    const handleSelect = (entry: SearchEntry) => {
      setWatchedIds((prev) => {
        const filtered = prev.filter((id) => id !== entry.constituencyId);
        return [entry.constituencyId, ...filtered];
      });
      setQuery('');
      setShowResults(false);
    };

    useImperativeHandle(ref, () => ({
      addOrMoveToTop: (id: number) => {
        setWatchedIds((prev) => {
          const filtered = prev.filter((item) => item !== id);
          return [id, ...filtered];
        });
      },
    }));

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

          // candidates are already sorted by votes desc — take top 3
          const topCandidates = constituencyCandidates.slice(0, 3);
          const totalVotes = constituencyCandidates.reduce(
            (sum, c) => sum + c.votes,
            0
          );

          const dName =
            districtNames[topCandidates[0].district] ||
            `District ${topCandidates[0].district}`;
          const subId = String(cId).slice(
            String(topCandidates[0].district).length
          );

          // Find the leading candidate for this constituency from the
          // pre-computed leadingCandidates array (one per constituency).
          const leader = leadingCandidates.find(
            (c) => c.constituency_id === cId
          );

          return {
            constituencyId: cId,
            districtName: dName,
            constituencyName: subId,
            topCandidates,
            totalVotes,
            leadingParty: leader?.party ?? topCandidates[0]?.party ?? '—',
          };
        })
        .filter((card): card is WatchlistCardData => card !== null);
    }, [watchedIds, candidates, leadingCandidates, districtNames]);

    return (
      <aside className="sidebar-map-panel">
        {DataWarning}
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
                    map={map}
                    leadingCandidates={leadingCandidates}
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
  }
);

export default Sidebar;
