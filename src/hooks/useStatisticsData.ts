/**
 * src/hooks/useStatisticsData.ts
 *
 * Custom hook that fetches election data for the currently active election
 * (and optionally the previous election for swing/comparison analysis),
 * then runs every statistical computation from utils/statistics.ts.
 *
 * This hook is consumed by the Statistics page and provides a single
 * object with all pre-computed stats ready for rendering with D3.
 *
 * Data flow:
 *   1. bundleCandidates() for current election → Candidate[]
 *   2. buildConstituencyResults() → ConstituencyResult[]
 *   3. All stat functions run on the results
 *   4. If a previous election exists, fetch it too for swing analysis
 */

import { useState, useEffect } from 'react';
import { bundleCandidates } from '../data/dataBundler';
import {
  getActiveElectionId,
  getCurrentElection,
  setActiveElection,
  ELECTIONS,
} from '../config/elections';
import { invalidateCache } from '../data/dataBundler';
import type { Candidate } from '../types/election';
import type {
  ConstituencyResult,
  PartyAggregate,
  CompetitivenessScore,
  WastedVoteResult,
  TurnoutResult,
  FlipCostEntry,
  FlippedSeat,
  StrongholdSeat,
  DashboardSummary,
  SwingSimulationResult,
  GenderBreakdown,
  EducationBreakdown,
} from '../utils/statistics';
import {
  buildConstituencyResults,
  narrowestSeats,
  safestSeats,
  majorityVsPlurality,
  avgCandidatesPerConstituency,
  candidateCountDistribution,
  computeCompetitiveness,
  computeSwing,
  computeFlippedSeats,
  incumbentSurvival,
  classifyStrongholds,
  findBellwetherSeats,
  computeWastedVotes,
  computePartyAggregates,
  nationalSeatVoteGap,
  geographicConcentration,
  fragmentedSeats,
  turnoutRanking,
  turnoutChange,
  provincePerformance,
  uniformSwingSimulation,
  multiSwingAnalysis,
  flipCostCalculator,
  closeSeatSensitivity,
  computeDashboardSummary,
  computeGenderStats,
  computeEducationStats,
} from '../utils/statistics';

// ─── Exported result type ───────────────────────────────────────────────────

export interface StatisticsData {
  // Raw
  candidates: Candidate[];
  results: ConstituencyResult[];

  // Dashboard summary
  summary: DashboardSummary;

  // Core Results
  narrowest10: ConstituencyResult[];
  safest10: ConstituencyResult[];
  majorityVsPlurality: {
    majority: number;
    plurality: number;
    total: number;
    majorityPercent: number;
  };
  avgCandidatesPerSeat: number;
  candidateDistribution: { count: number; frequency: number }[];

  // Competitiveness
  competitiveness: CompetitivenessScore[];

  // Structural
  wastedVotes: WastedVoteResult[];
  partyAggregates: PartyAggregate[];
  seatVoteGap: {
    party: string;
    partyEn: string | null;
    voteShare: number;
    seatShare: number;
    gap: number;
  }[];
  geoConcentration: {
    party: string;
    partyEn: string | null;
    hhi: number;
    totalVotes: number;
    provinceBreakdown: { province: number; voteShare: number }[];
  }[];
  fragmented: ConstituencyResult[];

  // Demographics
  genderStats: GenderBreakdown;
  educationStats: EducationBreakdown;

  // Geographic
  turnoutRank: TurnoutResult[];
  provincePerf: Map<
    number,
    {
      province: number;
      totalSeats: number;
      totalVotes: number;
      partySeats: Map<string, number>;
      partyVotes: Map<string, number>;
    }
  >;

  // Simulation
  flipCosts: FlipCostEntry[];
  closeSeatsSensitivity: {
    constituencyId: number;
    districtId: number;
    province: number;
    winner: string;
    winnerEn: string | null;
    runnerUp: string;
    runnerUpEn: string | null;
    marginPercent: number;
    votesToFlip: number;
  }[];

  // Cross-election data (may be null if no previous election)
  hasPreviousElection: boolean;
  swingData: ReturnType<typeof computeSwing> | null;
  flippedSeats: FlippedSeat[] | null;
  incumbentSurvival: {
    survived: number;
    lost: number;
    total: number;
    survivalRate: number;
    details: {
      constituencyId: number;
      incumbentName: string;
      incumbentNameEn: string | null;
      incumbentParty: string;
      incumbentPartyEn: string | null;
      survived: boolean;
      previousVoteShare: number;
      currentVoteShare: number;
      voteShareChange: number;
    }[];
  } | null;
  strongholds: StrongholdSeat[] | null;
  bellwethers:
    | {
        constituencyId: number;
        districtId: number;
        province: number;
        matchCount: number;
      }[]
    | null;
  turnoutChangeData: ReturnType<typeof turnoutChange> | null;

  // Top parties for simulation UI
  topParties: { party: string; partyEn: string | null; seats: number }[];
}

export interface UseStatisticsDataReturn {
  data: StatisticsData | null;
  loading: boolean;
  error: Error | null;
  /** Run uniform swing simulation for a given party at given % */
  runSwingSim: (
    party: string,
    swingPercent: number
  ) => SwingSimulationResult | null;
  /** Run multi-swing (+1, +3, +5) for a given party */
  runMultiSwing: (party: string) => SwingSimulationResult[] | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Find the previous election ID based on the current one.
 * Elections are keyed by BS year, so we look for the next-lowest year.
 */
function findPreviousElectionId(currentId: string): string | null {
  const currentYear = ELECTIONS[currentId]?.year;
  if (!currentYear) return null;

  let bestId: string | null = null;
  let bestYear = -Infinity;

  for (const [id, config] of Object.entries(ELECTIONS)) {
    if (id === currentId) continue;
    if (config.year < currentYear && config.year > bestYear) {
      bestYear = config.year;
      bestId = id;
    }
  }

  return bestId;
}

/**
 * Temporarily switch to a different election, fetch its candidates,
 * then switch back. Returns null on failure (non-fatal).
 */
async function fetchPreviousElectionCandidates(
  previousId: string,
  currentId: string
): Promise<Candidate[] | null> {
  try {
    // Temporarily switch election context
    invalidateCache();
    setActiveElection(previousId);

    const candidates = await bundleCandidates();

    // Switch back to the current election
    invalidateCache();
    setActiveElection(currentId);

    return candidates;
  } catch (err) {
    console.warn(
      `[useStatisticsData] Failed to fetch previous election (${previousId}):`,
      err
    );
    // Make sure we restore the current election even on failure
    try {
      invalidateCache();
      setActiveElection(currentId);
    } catch {
      // ignore
    }
    return null;
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useStatisticsData(
  refreshKey: number = 0
): UseStatisticsDataReturn {
  const [data, setData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep a ref to constituency results for on-demand simulation
  const [resultsRef, setResultsRef] = useState<ConstituencyResult[]>([]);

  useEffect(() => {
    let cancelled = false;

    const compute = async () => {
      try {
        setLoading(true);
        setError(null);

        const currentId = getActiveElectionId();

        // ── 1. Fetch current election candidates ──
        const candidates = await bundleCandidates();
        if (cancelled) return;

        const results = buildConstituencyResults(candidates);
        setResultsRef(results);

        // ── 2. Compute all single-election stats ──
        const compScores = computeCompetitiveness(results);
        const wasted = computeWastedVotes(results);
        const partyAggs = computePartyAggregates(results);
        const summaryData = computeDashboardSummary(
          results,
          compScores,
          wasted
        );

        const narrow10 = narrowestSeats(results);
        const safe10 = safestSeats(results);
        const majPlur = majorityVsPlurality(results);
        const avgCands = avgCandidatesPerConstituency(results);
        const candDist = candidateCountDistribution(results);
        const svGap = nationalSeatVoteGap(partyAggs);
        const geoCon = geographicConcentration(results);
        const frag = fragmentedSeats(results);
        const turnout = turnoutRanking(results);
        const provPerf = provincePerformance(results);
        const flipCosts = flipCostCalculator(results);
        const closeSensitivity = closeSeatSensitivity(results);
        const genderStats = computeGenderStats(candidates, results);
        const educationStats = computeEducationStats(candidates, results);

        // Top parties for simulation UI (parties with >0 seats, sorted by seats)
        const topParties = partyAggs
          .filter((p) => p.seatsWon > 0)
          .slice(0, 10)
          .map((p) => ({
            party: p.party,
            partyEn: p.partyEn,
            seats: p.seatsWon,
          }));

        // ── 3. Fetch previous election for cross-election analysis ──
        const previousId = findPreviousElectionId(currentId);
        let swingData: ReturnType<typeof computeSwing> | null = null;
        let flipped: FlippedSeat[] | null = null;
        let incumbentData: StatisticsData['incumbentSurvival'] = null;
        let strongholdData: StrongholdSeat[] | null = null;
        let bellwetherData: StatisticsData['bellwethers'] = null;
        let turnoutChangeData: ReturnType<typeof turnoutChange> | null = null;
        let hasPrev = false;

        if (previousId) {
          const prevCandidates = await fetchPreviousElectionCandidates(
            previousId,
            currentId
          );
          if (cancelled) return;

          if (prevCandidates && prevCandidates.length > 0) {
            hasPrev = true;
            const prevResults = buildConstituencyResults(prevCandidates);

            swingData = computeSwing(results, prevResults);
            flipped = computeFlippedSeats(results, prevResults);
            incumbentData = incumbentSurvival(results, prevResults);
            strongholdData = classifyStrongholds(results, prevResults);
            bellwetherData = findBellwetherSeats(results, prevResults);
            turnoutChangeData = turnoutChange(results, prevResults);
          }
        }

        if (cancelled) return;

        // ── 4. Package everything ──
        setData({
          candidates,
          results,
          summary: summaryData,

          // Core
          narrowest10: narrow10,
          safest10: safe10,
          majorityVsPlurality: majPlur,
          avgCandidatesPerSeat: avgCands,
          candidateDistribution: candDist,

          // Competitiveness
          competitiveness: compScores,

          // Structural
          wastedVotes: wasted,
          partyAggregates: partyAggs,
          seatVoteGap: svGap,
          geoConcentration: geoCon,
          fragmented: frag,

          // Demographics
          genderStats,
          educationStats,

          // Geographic
          turnoutRank: turnout,
          provincePerf: provPerf,

          // Simulation
          flipCosts,
          closeSeatsSensitivity: closeSensitivity,

          // Cross-election
          hasPreviousElection: hasPrev,
          swingData,
          flippedSeats: flipped,
          incumbentSurvival: incumbentData,
          strongholds: strongholdData,
          bellwethers: bellwetherData,
          turnoutChangeData,

          topParties,
        });
      } catch (err) {
        if (!cancelled) {
          console.error('[useStatisticsData] Error computing statistics:', err);
          setError(
            err instanceof Error
              ? err
              : new Error('Failed to compute statistics')
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    compute();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // ── On-demand simulation functions ──

  const runSwingSim = (
    party: string,
    swingPercent: number
  ): SwingSimulationResult | null => {
    if (resultsRef.length === 0) return null;
    return uniformSwingSimulation(resultsRef, party, swingPercent);
  };

  const runMultiSwing = (party: string): SwingSimulationResult[] | null => {
    if (resultsRef.length === 0) return null;
    return multiSwingAnalysis(resultsRef, party);
  };

  return {
    data,
    loading,
    error,
    runSwingSim,
    runMultiSwing,
  };
}

export default useStatisticsData;
