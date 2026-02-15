import { useState, useEffect } from 'react';
import { bundleCandidates, bundleLeadingCandidates } from '../data/dataBundler';
import { Candidate } from '../types/election';

/**
 * Custom hook to fetch and process election data.
 * It provides candidate data, leading candidates per constituency,
 * and high-level statistics derived from the data.
 */
export interface ElectionStats {
  totalVotes: number;
  totalSeats: number;
  partyStandings: Record<string, number>;
  genderBreakdown: {
    male: number;
    female: number;
    other: number;
  };
}

export const useElectionData = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [leadingCandidates, setLeadingCandidates] = useState<Candidate[]>([]);
  const [stats, setStats] = useState<ElectionStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const allCandidates = await bundleCandidates();
        const winners = await bundleLeadingCandidates(allCandidates);

        // Derive statistics
        const standings: Record<string, number> = {};
        let totalVotes = 0;
        const gender = { male: 0, female: 0, other: 0 };

        winners.forEach((c) => {
          standings[c.party] = (standings[c.party] || 0) + 1;
        });

        allCandidates.forEach((c) => {
          totalVotes += c.votes;
          const g = c.gender.toLowerCase();
          if (g === 'male' || g === 'म') gender.male++;
          else if (g === 'female' || g === 'महि') gender.female++;
          else gender.other++;
        });

        setCandidates(allCandidates);
        setLeadingCandidates(winners);
        setStats({
          totalVotes,
          totalSeats: winners.length,
          partyStandings: standings,
          genderBreakdown: gender,
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch election data'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return {
    candidates,
    leadingCandidates,
    stats,
    loading,
    error,
  };
};

export default useElectionData;
