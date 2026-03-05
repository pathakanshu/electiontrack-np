import { useState, useEffect, useCallback, useRef } from 'react';
import { bundleCandidates, bundleLeadingCandidates } from '../data/dataBundler';
import { Candidate } from '../types/election';

/**
 * Custom hook to fetch and process election data.
 * It provides candidate data, leading candidates per constituency,
 * and high-level statistics derived from the data.
 *
 * Accepts an optional `refreshKey` parameter. Every time the value changes,
 * the hook re-fetches and reprocesses all candidate data. This is used by
 * the file watcher in App.tsx to trigger updates across the entire app
 * when the local cache file changes on disk — without remounting any
 * components or destroying the map.
 *
 * The first fetch (on mount) shows the loading spinner. Subsequent fetches
 * triggered by refreshKey changes happen silently in the background.
 */
export interface ElectionStats {
  totalVotes: number;
  totalSeats: number;
  partyStandings: Record<string, { won: number; leading: number }>;
  genderBreakdown: {
    male: number;
    female: number;
    other: number;
  };
}

/**
 * Given an array of candidates, derive winner standings, vote totals,
 * and gender breakdown. Pure function — no side effects.
 */
function deriveStats(
  allCandidates: Candidate[],
  winners: Candidate[]
): ElectionStats {
  const standings: Record<string, { won: number; leading: number }> = {};
  let totalVotes = 0;
  const gender = { male: 0, female: 0, other: 0 };

  winners.forEach((c) => {
    if (!standings[c.party]) {
      standings[c.party] = { won: 0, leading: 0 };
    }

    if (c.elected) {
      standings[c.party].won++;
    } else {
      standings[c.party].leading++;
    }
  });

  allCandidates.forEach((c) => {
    totalVotes += c.votes;
    const g = c.gender.toLowerCase();
    if (g === 'male' || g === 'म') gender.male++;
    else if (g === 'female' || g === 'महि') gender.female++;
    else gender.other++;
  });

  return {
    totalVotes,
    totalSeats: winners.length,
    partyStandings: standings,
    genderBreakdown: gender,
  };
}

export const useElectionData = (refreshKey: number = 0) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [leadingCandidates, setLeadingCandidates] = useState<Candidate[]>([]);
  const [stats, setStats] = useState<ElectionStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Whether we've completed at least one successful fetch.
  // Used to avoid showing the loading spinner on background refreshes.
  // A ref (not state) because flipping this flag should not trigger a re-render.
  const initialLoadDone = useRef(false);

  /**
   * Process a set of candidates into derived state (leading candidates,
   * stats) and update all the hook's state atoms.
   */
  const processAndSetData = useCallback(async (allCandidates: Candidate[]) => {
    const winners = await bundleLeadingCandidates(allCandidates);
    const newStats = deriveStats(allCandidates, winners);

    setCandidates(allCandidates);
    setLeadingCandidates(winners);
    setStats(newStats);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        // Only show spinner on the very first load, not on background refreshes.
        if (!initialLoadDone.current) {
          setLoading(true);
        }

        const allCandidates = await bundleCandidates();
        if (cancelled) return;

        await processAndSetData(allCandidates);

        // Clear any previous error on success
        setError(null);
      } catch (err) {
        if (!cancelled) {
          if (initialLoadDone.current) {
            // Background refresh failed — log but don't blow up the UI.
            console.warn('[useElectionData] Background refresh failed:', err);
          } else {
            setError(
              err instanceof Error
                ? err
                : new Error('Failed to fetch election data')
            );
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          initialLoadDone.current = true;
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, processAndSetData]);

  return {
    candidates,
    leadingCandidates,
    stats,
    loading,
    error,
  };
};

export default useElectionData;
