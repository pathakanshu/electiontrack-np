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
import { Candidate, PRPartyAggregate } from '../../types/election';
import { getDistrictIdentifiers } from '../../data/dataBundler';
import { useLanguage, useTranslation } from '../../i18n';
import { getName, getNameFromFields } from '../../i18n/getName';

import type { DistrictIdentifier } from '../../types/election';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { ElectionConfig } from '../../config/elections';
import { highlightConstituencies, clearHighlights } from '../../map/maprender';
import colorMapping from '../../config/colorMapping.json';

interface SidebarProps {
  stats: ElectionStats | null;
  candidates: Candidate[];
  /** The single leading candidate per constituency — used for party highlighting. */
  leadingCandidates: Candidate[];
  /** National PR party vote totals — empty array when PR data is unavailable. */
  prParties: PRPartyAggregate[];
  map: any;
  /**
   * Snapshot of the active election config, captured in the parent at a
   * stable point (mount-time of AppContent). Passed as a prop so the
   * Sidebar never reads the mutable global `getCurrentElection()` which
   * can temporarily point at a *different* election while
   * useStatisticsData fetches previous-election data.
   */
  election: ElectionConfig;
}

export interface SidebarRef {
  addOrMoveToTop: (id: number) => void;
}

/** A single entry in the flat search haystack. */
interface SearchEntry {
  /** The display string shown in search results (locale-aware). */
  label: string;
  /**
   * The string that uFuzzy actually searches against.
   * Concatenates both English and Nepali names so the user can type
   * in either language regardless of the active locale.
   */
  searchText: string;
  /** Secondary info line shown below the label. */
  meta: string;
  /** Type tag shown in the result preview. */
  type: 'candidate' | 'constituency';
  /** The constituency_id this entry maps to. */
  constituencyId: number;
}

/** URL pattern for cached party symbol images (local). */
const SYMBOL_IMG_URL = '/cache/symbols';

/** Remote fallback URL for symbol images from Election Commission. */
const SYMBOL_IMG_REMOTE = 'https://result.election.gov.np/Images/symbol-hor-pa';

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
/**
 * uFuzzy configured for both English and Devanagari support.
 *
 * For English: We allow dots and spaces to be ignored between characters
 * so that "KP" or "kp" matches "K.P." or "K. P.".
 *
 * For Devanagari: `unicode: true` enables Unicode-aware character classes.
 */
const uf = new uFuzzy({
  unicode: true,
  interSplit: '[^\\p{L}\\d]+',
  intraSplit: '\\p{Ll}\\p{Lu}',
  intraBound: '\\p{L}\\d|\\d\\p{L}|\\p{Ll}\\p{Lu}',
  intraChars: '[\\p{L}\\d.]', // Allow dots within "words" so they don't break initials
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
function normalize(s: string | undefined | null): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[.]/g, '');
}

function prefixScore(label: string, needle: string): number {
  if (!label || !needle) return 3;
  const ll = label.toLowerCase();
  const nl = needle.toLowerCase();
  const nLabel = normalize(ll);
  const nNeedle = normalize(nl);

  if (ll.startsWith(nl) || (nNeedle && nLabel.startsWith(nNeedle))) return 0;
  // Check first word (everything before the first space / separator)
  const firstWord = ll.split(/[\s\-–—]+/)[0];
  if (firstWord.startsWith(nl)) return 1;
  if (ll.includes(nl)) return 2;
  return 3;
}

function rankedSearch(haystack: string[], needle: string): number[] {
  try {
    const trimmed = needle.trim();
    if (!trimmed || haystack.length === 0) return [];

    const nNeedle = normalize(trimmed);

    // 1. uFuzzy filter
    let idxs = uf.filter(haystack, trimmed) || [];

    // 2. Fallback: normalized substring search (always run)
    const fallbackIdxs = [];
    for (let i = 0; i < haystack.length; i++) {
      const item = haystack[i];
      if (item && normalize(item).includes(nNeedle)) {
        fallbackIdxs.push(i);
      }
    }

    // 3. Merge and de-duplicate (uFuzzy matches first)
    const seen = new Set(idxs);
    for (const i of fallbackIdxs) {
      if (!seen.has(i)) idxs.push(i);
    }

    if (idxs.length === 0) return [];

    // 4. Pre-sort by prefix so they survive the cap
    idxs.sort((a, b) => {
      const sA = haystack[a];
      const sB = haystack[b];
      if (sA === undefined || sB === undefined) return 0;
      const pa = prefixScore(sA, trimmed);
      const pb = prefixScore(sB, trimmed);
      if (pa !== pb) return pa - pb;
      return sA.length - sB.length;
    });

    if (idxs.length > RANK_LIMIT) {
      idxs = idxs.slice(0, RANK_LIMIT);
    }

    // 5. uFuzzy scoring (optional, with safety)
    let finalIdxs = idxs;
    let info = null;
    try {
      info = uf.info(idxs, haystack, trimmed);
    } catch (e) {
      info = null;
    }
    if (info && info.idx) {
      let order = null;
      try {
        order = uf.sort(info, haystack, trimmed);
      } catch (e) {
        order = null;
      }
      if (order && Array.isArray(order) && order.length > 0) {
        finalIdxs = order.map((i) => info.idx[i]);
      }
    }

    // 6. Final re-sort
    finalIdxs.sort((a, b) => {
      const sA = haystack[a];
      const sB = haystack[b];
      if (sA === undefined || sB === undefined) return 0;
      const pa = prefixScore(sA, trimmed);
      const pb = prefixScore(sB, trimmed);
      if (pa !== pb) return pa - pb;
      return sA.length - sB.length;
    });

    return finalIdxs;
  } catch (err) {
    console.error('[rankedSearch] Critical error during search:', err, {
      needle,
      haystackSize: haystack.length,
    });
    return [];
  }
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
  const { locale } = useLanguage();
  const { t } = useTranslation();
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
          title={t('watchlist_leading', { party: data.leadingParty })}
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
          <span className="topbar-label"> {t('votes_label')}</span>
        </span>
        <button
          className="watchlist-remove-btn"
          onClick={() => onRemove(data.constituencyId)}
          aria-label={t('watchlist_remove_aria', {
            district: data.districtName,
            constituency: data.constituencyName,
          })}
        >
          ✕
        </button>
      </div>

      {/* Body: names on left, symbols + votes on right — hidden entirely when no votes */}
      {(() => {
        const withVotes = data.topCandidates.filter((c) => c.votes > 0);
        if (withVotes.length === 0) return null;

        return (
          <div className="watchlist-item-body">
            {/* Left — candidate names */}
            <ol className="watchlist-candidates-list">
              {withVotes.map((c) => {
                const partyColor =
                  (colorMapping.parties as any)[c.party] || colorMapping.others;
                return (
                  <li key={c.candidate_id} className="watchlist-candidate-name">
                    <span
                      className="party-color-dot"
                      style={{ backgroundColor: partyColor }}
                      title={getNameFromFields(c.party_en, c.party, locale)}
                      aria-label={getNameFromFields(
                        c.party_en,
                        c.party,
                        locale
                      )}
                      onMouseEnter={() => enterParty(c.party)}
                      onMouseLeave={() => leaveParty()}
                    />
                    <span className="watchlist-candidate-name-text">
                      {getName(c, locale)}
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* Right — symbol image + vote count */}
            <div className="watchlist-symbols-row">
              {withVotes.map((c) => (
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
                      alt={getNameFromFields(c.party_en, c.party, locale)}
                      title={getNameFromFields(c.party_en, c.party, locale)}
                      loading="lazy"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.src.startsWith(window.location.origin)) {
                          img.src = `${SYMBOL_IMG_REMOTE}/${c.symbol_id}.jpg`;
                          return;
                        }
                        img.style.display = 'none';
                        const parent = img.parentElement;
                        if (
                          parent &&
                          !parent.querySelector('.watchlist-symbol-fallback')
                        ) {
                          const fallback = document.createElement('div');
                          fallback.className = 'watchlist-symbol-fallback';
                          fallback.title =
                            getNameFromFields(c.party_en, c.party, locale) ||
                            '';
                          fallback.innerText = c.party?.slice(0, 2) || '??';
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="watchlist-symbol-fallback"
                      title={getNameFromFields(c.party_en, c.party, locale)}
                    >
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
        );
      })()}
    </article>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Resolve a district display name for the given locale.
 *
 * Strategy:
 *  - English: use the translation dictionary key `district_{id}` which
 *    has proper English names ("Kathmandu", "Taplejung", etc.).
 *  - Nepali: use the raw Nepali name from the API cache.
 *
 * Falls back to the Nepali name (or "District {id}") when no English
 * translation exists.
 */
function resolveDistrictName(
  districtId: number,
  nepaliName: string | undefined,
  locale: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (locale === 'en') {
    const translated = t(`district_${districtId}` as any);
    // t() returns the raw key when no match is found — detect that
    if (translated && translated !== `district_${districtId}`) {
      return translated;
    }
  }
  return nepaliName || t('district_fallback', { id: String(districtId) });
}

// ---------------------------------------------------------------------------
// Leaderboard — self-contained section with optional FPTP ↔ PR toggle
// ---------------------------------------------------------------------------

const LeaderboardSection: React.FC<{
  topFive: [string, { won: number; leading: number }][];
  prParties: PRPartyAggregate[];
  leadingCandidates: Candidate[];
  map: any;
  /** Whether this election supports a PR view — passed from the parent's
   *  stable election snapshot so we never read the mutable global. */
  hasPR: boolean;
}> = ({ topFive, prParties, leadingCandidates, map, hasPR }) => {
  const { locale } = useLanguage();
  const { t } = useTranslation();
  const [showPR, setShowPR] = useState(false);

  // If the election doesn't have PR, always show FPTP
  const isPR = hasPR && showPR;

  // Set a data attribute on <html> so CSS can grey out the map when PR is active.
  // Uses the derived `isPR` value (not raw `showPR`) so it stays in sync with
  // what's actually rendered — e.g. if hasPR flips to false, the map ungreys.
  useEffect(() => {
    if (isPR) {
      document.documentElement.setAttribute('data-pr-mode', '');
    } else {
      document.documentElement.removeAttribute('data-pr-mode');
    }
    return () => {
      document.documentElement.removeAttribute('data-pr-mode');
    };
  }, [isPR]);

  // Total PR votes for percentage calculation
  const totalPRVotes = useMemo(
    () => prParties.reduce((sum, p) => sum + p.votes, 0),
    [prParties]
  );

  return (
    <div className="sidebar-section leaderboard-section">
      <div className="parties-index">
        {/* Title row with optional toggle */}
        <div className="leaderboard-title-row">
          <h3>
            {isPR ? t('leaderboard_pr_title' as any) : t('leaderboard_title')}
          </h3>
          {hasPR && (
            <div
              className="voting-mode-toggle voting-mode-toggle--leaderboard"
              role="radiogroup"
              aria-label={t('mode_toggle_aria' as any)}
            >
              <button
                className={`voting-mode-btn${!showPR ? ' voting-mode-btn--active' : ''}`}
                onClick={() => setShowPR(false)}
                aria-pressed={!showPR}
                title={t('mode_fptp_long' as any)}
              >
                {t('mode_fptp' as any)}
              </button>
              <button
                className={`voting-mode-btn${showPR ? ' voting-mode-btn--active' : ''}`}
                onClick={() => setShowPR(true)}
                aria-pressed={showPR}
                title={t('mode_pr_long' as any)}
              >
                {t('mode_pr' as any)}
              </button>
            </div>
          )}
        </div>

        {isPR ? (
          /* ── PR view: party vote totals with percentage ── */
          prParties.length > 0 ? (
            <div key="pr">
              <div
                className="leaderboard-header"
                style={{
                  display: 'flex',
                  fontSize: '0.75rem',
                  color: '#666',
                  marginBottom: '0.25rem',
                  paddingRight: '0.5rem',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                <span style={{ flex: 1 }}></span>
                <span style={{ width: '5.5rem', textAlign: 'right' }}>
                  {t('leaderboard_pr_votes' as any)}
                </span>
              </div>
              <ul className="index-list">
                {prParties.slice(0, 5).map((entry) => {
                  const dotColor =
                    (colorMapping.parties as any)[entry.party] ||
                    colorMapping.others;
                  const displayName = getNameFromFields(
                    entry.party_en,
                    entry.party,
                    locale
                  );
                  const pct =
                    totalPRVotes > 0
                      ? ((entry.votes / totalPRVotes) * 100).toFixed(1)
                      : '0.0';

                  return (
                    <li key={entry.party_id} className="index-item">
                      <span className="rank">
                        <span
                          className="rank-dot"
                          style={{ backgroundColor: dotColor }}
                          title={displayName}
                        />
                      </span>
                      <span
                        className="party-name"
                        title={`${displayName} — ${entry.votes.toLocaleString()} (${pct}%)`}
                      >
                        {displayName}
                      </span>
                      <span
                        className="seat-count pr-votes"
                        title={entry.votes.toLocaleString()}
                      >
                        {entry.votes.toLocaleString()}
                        <span className="pr-pct"> ({pct}%)</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="status-message">
              {t('leaderboard_pr_no_data' as any)}
            </p>
          )
        ) : /* ── FPTP view: seat counts (won / leading) ── */
        topFive.length > 0 ? (
          <div key="fptp">
            <div
              className="leaderboard-header"
              style={{
                display: 'flex',
                fontSize: '0.75rem',
                color: '#666',
                marginBottom: '0.25rem',
                paddingRight: '0.5rem',
                fontFamily: 'var(--font-heading)',
              }}
            >
              <span style={{ flex: 1 }}></span>
              <span style={{ width: '2.5rem', textAlign: 'center' }}>
                {t('leaderboard_won' as any)}
              </span>
              <span style={{ width: '2.5rem', textAlign: 'center' }}>
                {t('leaderboard_lead' as any)}
              </span>
            </div>
            <ul className="index-list">
              {topFive.map(([party, counts]) => {
                const pc =
                  (colorMapping.parties as any)[party] || colorMapping.others;
                const sample = leadingCandidates.find((c) => c.party === party);
                const displayName = sample
                  ? getNameFromFields(sample.party_en, sample.party, locale)
                  : party;

                const enterParty = () => {
                  if (!map) return;
                  const ids = new Set(
                    leadingCandidates
                      .filter((c) => c.party === party)
                      .map((c) => c.constituency_id)
                  );
                  highlightConstituencies(map, ids, leadingCandidates);
                };
                const leaveParty = () => {
                  if (map) clearHighlights(map, leadingCandidates);
                };

                return (
                  <li key={party} className="index-item">
                    <span className="rank">
                      <span
                        className="rank-dot"
                        style={{ backgroundColor: pc }}
                        title={displayName}
                        onMouseEnter={enterParty}
                        onMouseLeave={leaveParty}
                      />
                    </span>
                    <span
                      className="party-name"
                      onMouseEnter={enterParty}
                      onMouseLeave={leaveParty}
                      title={displayName}
                    >
                      {displayName}
                    </span>
                    <div style={{ display: 'flex' }}>
                      <span
                        className="seat-count"
                        style={{ width: '2.5rem', textAlign: 'center' }}
                        title={t('leaderboard_won' as any)}
                      >
                        {counts.won}
                      </span>
                      <span
                        className="seat-count"
                        style={{
                          width: '2.5rem',
                          textAlign: 'center',
                          color: '#888',
                        }}
                        title={t('leaderboard_lead' as any)}
                      >
                        {counts.leading}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="status-message">{t('leaderboard_counting')}</p>
        )}
      </div>
    </div>
  );
};

const Sidebar = React.forwardRef<SidebarRef, SidebarProps>(
  ({ stats, candidates, leadingCandidates, prParties, map, election }, ref) => {
    const { locale } = useLanguage();
    const { t } = useTranslation();

    // ---- Incomplete Data Warning ----
    const DataWarning = election.missingData ? (
      <div
        className="data-warning-banner"
        style={{
          backgroundColor: 'rgba(184, 134, 11, 0.06)',
          border: '1px solid rgba(184, 134, 11, 0.3)',
          color: '#8b6914',
          padding: '10px 12px',
          marginBottom: '12px',
          fontSize: '0.8rem',
          lineHeight: '1.45',
        }}
      >
        {t('data_warning_symbols')}
      </div>
    ) : null;

    // ---- Leaderboard ----
    const partyEntries = stats ? Object.entries(stats.partyStandings) : [];
    const sortedParties = [...partyEntries].sort(([, a], [, b]) => {
      const totalA = a.won + a.leading;
      const totalB = b.won + b.leading;
      return totalB - totalA;
    });
    const topFive = sortedParties.slice(0, 5);

    // ---- District name map (Nepali names from API, keyed by id) ----
    const [districtNamesNp, setDistrictNamesNp] = useState<
      Record<number, string>
    >({});

    useEffect(() => {
      getDistrictIdentifiers().then((ids: DistrictIdentifier[]) => {
        const m: Record<number, string> = {};
        for (const d of ids) {
          m[d.id] = d.name;
        }
        setDistrictNamesNp(m);
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

      try {
        // Candidate entries
        for (const c of candidates) {
          if (!c) continue;

          // Build a bilingual search string: "English Name नेपाली नाम PartyEn पार्टी"
          const displayLabel = getName(c, locale) || 'Unknown Candidate';
          const nameEn = c.name_en || '';
          const nameNp = c.name_np || '';
          const partyEn = c.party_en || '';
          const partyNp = c.party || '';
          // Deduplicate: if locale already picked one, include the other
          const searchParts = [nameNp, nameEn, partyNp, partyEn].filter(
            Boolean
          );
          const searchText = [...new Set(searchParts)].join(' ');

          entries.push({
            label: displayLabel,
            searchText,
            meta: `${getNameFromFields(c.party_en, c.party, locale) || 'Independent'} · ${(c.votes || 0).toLocaleString()} ${t('votes_label')}`,
            type: 'candidate',
            constituencyId: c.constituency_id,
          } as SearchEntry);
        }

        // Constituency entries (one per unique constituency_id)
        const seenConstituencies = new Set<number>();
        for (const c of candidates) {
          if (seenConstituencies.has(c.constituency_id)) continue;
          seenConstituencies.add(c.constituency_id);

          // Resolve both English and Nepali district names
          const dNameDisplay = resolveDistrictName(
            c.district,
            districtNamesNp[c.district],
            locale,
            t
          );
          const dNameEn = resolveDistrictName(
            c.district,
            districtNamesNp[c.district],
            'en',
            t
          );
          const dNameNp = resolveDistrictName(
            c.district,
            districtNamesNp[c.district],
            'np',
            t
          );
          // Extract the sub-constituency number from the composite ID
          const subId = String(c.constituency_id).slice(
            String(c.district).length
          );

          // Bilingual search text: "Kathmandu - 1 काठमाडौँ - 1"
          const displayLabel = `${dNameDisplay} - ${subId}`;
          const searchParts = [
            `${dNameEn} - ${subId}`,
            `${dNameNp} - ${subId}`,
          ];
          const searchText = [...new Set(searchParts)].join(' ');

          entries.push({
            label: displayLabel,
            searchText,
            meta: t('search_type_constituency'),
            type: 'constituency',
            constituencyId: c.constituency_id,
          });
        }
      } catch (err) {
        console.error('[Sidebar] Error building search entries:', err);
      }

      const haystack = entries.map((e) => e.searchText || e.label || '');
      return { entries, haystack };
    }, [candidates, districtNamesNp, locale, t]);

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
      // Clear any lingering highlights for this constituency before removing
      if (map) clearHighlights(map, leadingCandidates);
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

          const dName = resolveDistrictName(
            topCandidates[0].district,
            districtNamesNp[topCandidates[0].district],
            locale,
            t
          );
          const subId = String(cId).slice(
            String(topCandidates[0].district).length
          );

          // Find the leading candidate for this constituency from the
          // pre-computed leadingCandidates array (one per constituency).
          const leader = leadingCandidates.find(
            (c) => c.constituency_id === cId
          );

          const leaderPartyDisplay = leader
            ? getNameFromFields(leader.party_en, leader.party, locale)
            : topCandidates[0]
              ? getNameFromFields(
                  topCandidates[0].party_en,
                  topCandidates[0].party,
                  locale
                )
              : '—';

          return {
            constituencyId: cId,
            districtName: dName,
            constituencyName: subId,
            topCandidates,
            totalVotes,
            leadingParty: leaderPartyDisplay,
          };
        })
        .filter((card): card is WatchlistCardData => card !== null);
    }, [watchedIds, candidates, leadingCandidates, districtNamesNp, locale, t]);

    return (
      <aside className="sidebar-map-panel">
        {DataWarning}
        {/* Watchlist Section */}
        <div className="sidebar-section watchlist-section">
          <h2 id="watchlist-text">{t('watchlist_title')}</h2>

          {/* Search Bar */}
          <div className="search-bar-container" ref={dropdownRef}>
            <input
              type="text"
              placeholder={t('search_placeholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              className="search-bar-input"
              aria-label={t('search_aria')}
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
                  <p className="search-no-results">{t('search_no_results')}</p>
                )}
              </div>
            )}
          </div>

          {/* Watchlist Cards */}
          <div className="watchlist-scroll-container">
            <div className="watchlist-content">
              {watchlistCards.length === 0 ? (
                <p className="hint-text">{t('watchlist_hint')}</p>
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

        {/* Leaderboard Section — with inline FPTP ↔ PR toggle.
            key={election.id} forces a full remount when the election
            changes, resetting the local showPR state back to false. */}
        <LeaderboardSection
          key={election.id}
          topFive={topFive}
          prParties={prParties}
          leadingCandidates={leadingCandidates}
          map={map}
          hasPR={!!election.hasPR}
        />
      </aside>
    );
  }
);

export default Sidebar;
