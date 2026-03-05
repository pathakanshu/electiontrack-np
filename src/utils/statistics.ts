/**
 * src/utils/statistics.ts
 *
 * Pure computation engine for election statistics.
 * All functions are stateless and take bundled Candidate[] data as input.
 * No D3, no React — just math.
 *
 * This powers the /statistics page with every metric from:
 * - Core Results
 * - Competitiveness & Swing
 * - Structural Stats
 * - Geographic & Behavioral
 * - Simulation Layer
 */

import type { Candidate } from '../types/election';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConstituencyResult {
  constituencyId: number;
  districtId: number;
  province: number;
  candidates: Candidate[];
  winner: Candidate;
  runnerUp: Candidate | null;
  totalVotes: number;
  totalCandidates: number;
  margin: number; // raw vote margin
  marginPercent: number; // margin as % of total votes in constituency
  winnerVoteShare: number; // winner votes / total votes
  isMajority: boolean; // winner crossed 50%?
  top3Concentration: number; // top 3 candidates' votes / total
}

export interface PartyAggregate {
  party: string;
  partyEn: string | null;
  seatsWon: number;
  totalVotes: number;
  voteShare: number; // % of national total
  seatShare: number; // % of total seats
  seatVoteGap: number; // seatShare - voteShare
  wastedVotes: number;
  voteEfficiency: number; // votes per seat (Infinity if 0 seats)
}

export interface CompetitivenessScore {
  constituencyId: number;
  districtId: number;
  province: number;
  winnerParty: string;
  winnerPartyEn: string | null;
  index: number; // 0-100
  marginPercent: number;
  top3Concentration: number;
}

export interface SwingResult {
  constituencyId: number;
  districtId: number;
  province: number;
  party: string;
  partyEn: string | null;
  previousVoteShare: number;
  currentVoteShare: number;
  swing: number; // percentage points
}

export interface FlippedSeat {
  constituencyId: number;
  districtId: number;
  province: number;
  previousWinner: string;
  previousWinnerEn: string | null;
  currentWinner: string;
  currentWinnerEn: string | null;
  marginPercent: number;
}

export interface StrongholdSeat {
  constituencyId: number;
  districtId: number;
  province: number;
  party: string;
  partyEn: string | null;
  consecutiveWins: number;
}

export interface WastedVoteResult {
  constituencyId: number;
  districtId: number;
  province: number;
  wastedVotes: number;
  wastedPercent: number;
  totalVotes: number;
}

export interface TurnoutResult {
  constituencyId: number;
  districtId: number;
  province: number;
  totalVotes: number;
  rank: number;
}

export interface SwingSimulationResult {
  party: string;
  partyEn: string | null;
  swingPercent: number;
  currentSeats: number;
  projectedSeats: number;
  seatChange: number;
  flippedConstituencies: number[];
}

export interface FlipCostEntry {
  constituencyId: number;
  districtId: number;
  province: number;
  currentWinner: string;
  currentWinnerEn: string | null;
  runnerUp: string;
  runnerUpEn: string | null;
  votesToFlip: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Group candidates by constituency and compute per-constituency results.
 */
export function buildConstituencyResults(
  candidates: Candidate[]
): ConstituencyResult[] {
  const map = new Map<number, Candidate[]>();

  for (const c of candidates) {
    const existing = map.get(c.constituency_id);
    if (existing) {
      existing.push(c);
    } else {
      map.set(c.constituency_id, [c]);
    }
  }

  const results: ConstituencyResult[] = [];

  for (const [constituencyId, cands] of map) {
    // Sort descending by votes
    const sorted = [...cands].sort((a, b) => b.votes - a.votes);
    const winner = sorted[0];
    const runnerUp = sorted.length > 1 ? sorted[1] : null;
    const totalVotes = sorted.reduce((sum, c) => sum + c.votes, 0);

    // Skip constituencies where no votes have been cast yet —
    // a "winner" with 0 votes is meaningless and distorts every
    // downstream statistic (seat counts, competitiveness, etc.).
    if (totalVotes === 0) continue;

    const margin = runnerUp ? winner.votes - runnerUp.votes : winner.votes;
    const marginPercent = totalVotes > 0 ? (margin / totalVotes) * 100 : 0;
    const winnerVoteShare =
      totalVotes > 0 ? (winner.votes / totalVotes) * 100 : 0;
    const top3Votes = sorted.slice(0, 3).reduce((sum, c) => sum + c.votes, 0);
    const top3Concentration =
      totalVotes > 0 ? (top3Votes / totalVotes) * 100 : 0;

    results.push({
      constituencyId,
      districtId: winner.district,
      province: winner.province,
      candidates: sorted,
      winner,
      runnerUp,
      totalVotes,
      totalCandidates: sorted.length,
      margin,
      marginPercent,
      winnerVoteShare,
      isMajority: winnerVoteShare > 50,
      top3Concentration,
    });
  }

  return results.sort((a, b) => a.constituencyId - b.constituencyId);
}

// ─── Core Results ───────────────────────────────────────────────────────────

/**
 * Narrowest 10 seats — the closest races by margin %.
 */
export function narrowestSeats(
  results: ConstituencyResult[],
  count = 10
): ConstituencyResult[] {
  return [...results]
    .filter((r) => r.runnerUp !== null && r.totalVotes > 0)
    .sort((a, b) => a.marginPercent - b.marginPercent)
    .slice(0, count);
}

/**
 * Safest 10 seats — the most dominant wins by margin %.
 */
export function safestSeats(
  results: ConstituencyResult[],
  count = 10
): ConstituencyResult[] {
  return [...results]
    .filter((r) => r.totalVotes > 0)
    .sort((a, b) => b.marginPercent - a.marginPercent)
    .slice(0, count);
}

/**
 * Majority vs Plurality breakdown.
 */
export function majorityVsPlurality(results: ConstituencyResult[]): {
  majority: number;
  plurality: number;
  total: number;
  majorityPercent: number;
} {
  const majority = results.filter((r) => r.isMajority).length;
  const total = results.length;
  return {
    majority,
    plurality: total - majority,
    total,
    majorityPercent: total > 0 ? (majority / total) * 100 : 0,
  };
}

/**
 * Average candidates per constituency.
 */
export function avgCandidatesPerConstituency(
  results: ConstituencyResult[]
): number {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, r) => sum + r.totalCandidates, 0);
  return total / results.length;
}

/**
 * Distribution of candidates per constituency.
 */
export function candidateCountDistribution(
  results: ConstituencyResult[]
): { count: number; frequency: number }[] {
  const freq = new Map<number, number>();
  for (const r of results) {
    freq.set(r.totalCandidates, (freq.get(r.totalCandidates) || 0) + 1);
  }
  return Array.from(freq.entries())
    .map(([count, frequency]) => ({ count, frequency }))
    .sort((a, b) => a.count - b.count);
}

// ─── Competitiveness & Swing ────────────────────────────────────────────────

/**
 * Competitiveness Index (0–100 scale).
 * 100 = extremely competitive, 0 = total blowout.
 *
 * Formula: CI = 100 - (marginPercent * 0.6 + (100 - top3Concentration) * 0.4)
 * - Low margin → high competitiveness
 * - High top-3 concentration → vote compression → somewhat competitive
 *
 * Clamped to [0, 100].
 */
export function computeCompetitiveness(
  results: ConstituencyResult[]
): CompetitivenessScore[] {
  return results
    .map((r) => {
      // No votes cast → competitiveness is undefined; score it as 0.
      if (r.totalVotes === 0) {
        return {
          constituencyId: r.constituencyId,
          districtId: r.districtId,
          province: r.province,
          winnerParty: r.winner.party,
          winnerPartyEn: r.winner.party_en,
          index: 0,
          marginPercent: 0,
          top3Concentration: 0,
        };
      }

      // Invert margin: lower margin → higher score
      const marginScore = Math.max(0, 100 - r.marginPercent * 2);

      // Top-3 spread: how evenly are votes distributed among the top 3?
      // If one candidate has everything → spread = 0 (not competitive).
      // If top 3 share equally → spread = 100 (very competitive).
      const top3 = r.candidates.slice(0, 3);
      let spreadScore = 0;
      if (top3.length >= 2 && r.totalVotes > 0) {
        const shares = top3.map((c) => c.votes / r.totalVotes);
        // Perfect equality among N candidates: each has 1/N.
        // Measure how close we are to that using 1 - max deviation.
        const maxShare = shares[0]; // already sorted desc
        // A single candidate with 100% → maxShare=1 → spreadScore=0
        // Two candidates at 50/50 → maxShare=0.5 → spreadScore=50*2=100 (capped)
        spreadScore = Math.min(
          100,
          (1 - maxShare) * 100 * (top3.length / (top3.length - 1))
        );
      }

      // Weighted combination
      const index = Math.min(
        100,
        Math.max(0, marginScore * 0.6 + spreadScore * 0.4)
      );

      return {
        constituencyId: r.constituencyId,
        districtId: r.districtId,
        province: r.province,
        winnerParty: r.winner.party,
        winnerPartyEn: r.winner.party_en,
        index: Math.round(index * 10) / 10,
        marginPercent: r.marginPercent,
        top3Concentration: r.top3Concentration,
      };
    })
    .sort((a, b) => b.index - a.index);
}

/**
 * Compute swing (vote share change) between two elections, per party per constituency.
 *
 * Returns only constituencies that exist in BOTH elections.
 */
export function computeSwing(
  currentResults: ConstituencyResult[],
  previousResults: ConstituencyResult[]
): SwingResult[] {
  const prevMap = new Map<number, ConstituencyResult>();
  for (const r of previousResults) {
    prevMap.set(r.constituencyId, r);
  }

  const swings: SwingResult[] = [];

  for (const curr of currentResults) {
    const prev = prevMap.get(curr.constituencyId);
    if (!prev) continue;

    // Build vote share maps for both elections
    const currShares = new Map<string, number>();
    for (const c of curr.candidates) {
      const share = curr.totalVotes > 0 ? (c.votes / curr.totalVotes) * 100 : 0;
      // Aggregate by party
      currShares.set(c.party, (currShares.get(c.party) || 0) + share);
    }

    const prevShares = new Map<string, number>();
    for (const c of prev.candidates) {
      const share = prev.totalVotes > 0 ? (c.votes / prev.totalVotes) * 100 : 0;
      prevShares.set(c.party, (prevShares.get(c.party) || 0) + share);
    }

    // All parties that appeared in either election for this constituency
    const allParties = new Set([...currShares.keys(), ...prevShares.keys()]);

    for (const party of allParties) {
      const currentShare = currShares.get(party) || 0;
      const previousShare = prevShares.get(party) || 0;
      const swing = currentShare - previousShare;

      // Only include meaningful swings (> 0.1%)
      if (Math.abs(swing) > 0.1) {
        // Find the English party name from either election
        const partyEn =
          curr.candidates.find((c) => c.party === party)?.party_en ??
          prev.candidates.find((c) => c.party === party)?.party_en ??
          null;

        swings.push({
          constituencyId: curr.constituencyId,
          districtId: curr.districtId,
          province: curr.province,
          party,
          partyEn,
          previousVoteShare: previousShare,
          currentVoteShare: currentShare,
          swing,
        });
      }
    }
  }

  return swings;
}

/**
 * Seats that changed party control between elections.
 */
export function computeFlippedSeats(
  currentResults: ConstituencyResult[],
  previousResults: ConstituencyResult[]
): FlippedSeat[] {
  const prevMap = new Map<number, ConstituencyResult>();
  for (const r of previousResults) {
    prevMap.set(r.constituencyId, r);
  }

  const flipped: FlippedSeat[] = [];

  for (const curr of currentResults) {
    const prev = prevMap.get(curr.constituencyId);
    if (!prev) continue;

    if (curr.winner.party !== prev.winner.party) {
      flipped.push({
        constituencyId: curr.constituencyId,
        districtId: curr.districtId,
        province: curr.province,
        previousWinner: prev.winner.party,
        previousWinnerEn: prev.winner.party_en,
        currentWinner: curr.winner.party,
        currentWinnerEn: curr.winner.party_en,
        marginPercent: curr.marginPercent,
      });
    }
  }

  return flipped.sort((a, b) => a.marginPercent - b.marginPercent);
}

/**
 * Incumbent survival rate.
 * Checks how many winners from the previous election won again.
 *
 * Returns: { survived, lost, total, survivalRate }
 */
export function incumbentSurvival(
  currentResults: ConstituencyResult[],
  previousResults: ConstituencyResult[]
): {
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
} {
  const prevMap = new Map<number, ConstituencyResult>();
  for (const r of previousResults) {
    prevMap.set(r.constituencyId, r);
  }

  let survived = 0;
  let total = 0;
  const details: {
    constituencyId: number;
    incumbentName: string;
    incumbentNameEn: string | null;
    incumbentParty: string;
    incumbentPartyEn: string | null;
    survived: boolean;
    previousVoteShare: number;
    currentVoteShare: number;
    voteShareChange: number;
  }[] = [];

  for (const curr of currentResults) {
    const prev = prevMap.get(curr.constituencyId);
    if (!prev) continue;

    const incumbentName = prev.winner.name_np;
    const incumbentNameEn = prev.winner.name_en;
    // Check if this person ran again in the same constituency
    const incumbentInCurrent = curr.candidates.find(
      (c) => c.name_np === incumbentName
    );

    if (incumbentInCurrent) {
      total++;
      const incumbentWon = curr.winner.name_np === incumbentName;
      if (incumbentWon) survived++;

      const prevVoteShare = (prev.winner.votes / (prev.totalVotes || 1)) * 100;
      const currVoteShare =
        (incumbentInCurrent.votes / (curr.totalVotes || 1)) * 100;

      details.push({
        constituencyId: curr.constituencyId,
        incumbentName,
        incumbentNameEn,
        incumbentParty: prev.winner.party,
        incumbentPartyEn: prev.winner.party_en,
        survived: incumbentWon,
        previousVoteShare: prevVoteShare,
        currentVoteShare: currVoteShare,
        voteShareChange: currVoteShare - prevVoteShare,
      });
    }
  }

  return {
    survived,
    lost: total - survived,
    total,
    survivalRate: total > 0 ? (survived / total) * 100 : 0,
    details,
  };
}

/**
 * Stronghold classification: constituencies where the SAME party
 * has won in multiple consecutive elections.
 *
 * @param electionResults - Array of constituency results per election, newest first
 */
export function classifyStrongholds(
  ...electionResults: ConstituencyResult[][]
): StrongholdSeat[] {
  if (electionResults.length < 2) return [];

  // Build a map: constituencyId → list of winning party (newest first)
  const winnersByConstituency = new Map<number, string[]>();
  const metaByConstituency = new Map<
    number,
    { districtId: number; province: number; partyEn: string | null }
  >();

  for (const results of electionResults) {
    for (const r of results) {
      const existing = winnersByConstituency.get(r.constituencyId);
      if (existing) {
        existing.push(r.winner.party);
      } else {
        winnersByConstituency.set(r.constituencyId, [r.winner.party]);
      }
      if (!metaByConstituency.has(r.constituencyId)) {
        metaByConstituency.set(r.constituencyId, {
          districtId: r.districtId,
          province: r.province,
          partyEn: r.winner.party_en,
        });
      }
    }
  }

  const strongholds: StrongholdSeat[] = [];

  for (const [cId, winners] of winnersByConstituency) {
    if (winners.length < 2) continue;

    // Count consecutive wins from the most recent
    let consecutiveWins = 1;
    for (let i = 1; i < winners.length; i++) {
      if (winners[i] === winners[0]) {
        consecutiveWins++;
      } else {
        break;
      }
    }

    if (consecutiveWins >= 2) {
      const meta = metaByConstituency.get(cId)!;
      strongholds.push({
        constituencyId: cId,
        districtId: meta.districtId,
        province: meta.province,
        party: winners[0],
        partyEn: meta.partyEn,
        consecutiveWins,
      });
    }
  }

  return strongholds.sort((a, b) => b.consecutiveWins - a.consecutiveWins);
}

/**
 * Bellwether seats: constituencies whose winner has matched
 * the nationally most-seats party in every given election.
 */
export function findBellwetherSeats(
  ...electionResults: ConstituencyResult[][]
): {
  constituencyId: number;
  districtId: number;
  province: number;
  matchCount: number;
}[] {
  if (electionResults.length === 0) return [];

  // For each election, find the national winner (party with most seats)
  const nationalWinners: string[] = [];
  for (const results of electionResults) {
    const seatCount = new Map<string, number>();
    for (const r of results) {
      seatCount.set(r.winner.party, (seatCount.get(r.winner.party) || 0) + 1);
    }
    let maxParty = '';
    let maxSeats = 0;
    for (const [party, seats] of seatCount) {
      if (seats > maxSeats) {
        maxSeats = seats;
        maxParty = party;
      }
    }
    nationalWinners.push(maxParty);
  }

  // For each constituency, check if it matched the national winner every time
  const matchCounts = new Map<number, number>();
  const totalAppearances = new Map<number, number>();
  const metaMap = new Map<number, { districtId: number; province: number }>();

  for (let i = 0; i < electionResults.length; i++) {
    for (const r of electionResults[i]) {
      totalAppearances.set(
        r.constituencyId,
        (totalAppearances.get(r.constituencyId) || 0) + 1
      );
      if (r.winner.party === nationalWinners[i]) {
        matchCounts.set(
          r.constituencyId,
          (matchCounts.get(r.constituencyId) || 0) + 1
        );
      }
      if (!metaMap.has(r.constituencyId)) {
        metaMap.set(r.constituencyId, {
          districtId: r.districtId,
          province: r.province,
        });
      }
    }
  }

  const bellwethers: {
    constituencyId: number;
    districtId: number;
    province: number;
    matchCount: number;
  }[] = [];

  for (const [cId, matches] of matchCounts) {
    const total = totalAppearances.get(cId) || 0;
    if (matches === total && total === electionResults.length) {
      const meta = metaMap.get(cId)!;
      bellwethers.push({
        constituencyId: cId,
        districtId: meta.districtId,
        province: meta.province,
        matchCount: matches,
      });
    }
  }

  return bellwethers;
}

// ─── Structural & "Damn" Stats ──────────────────────────────────────────────

/**
 * Wasted votes per constituency.
 * Under FPTP, all votes NOT cast for the winner are "wasted",
 * plus the winner's votes beyond what they needed (margin over runner-up + 1).
 */
export function computeWastedVotes(
  results: ConstituencyResult[]
): WastedVoteResult[] {
  return results
    .map((r) => {
      const loserVotes = r.totalVotes - r.winner.votes;
      // Surplus votes for the winner: anything beyond margin + 1
      const surplusWinner = r.runnerUp
        ? Math.max(0, r.winner.votes - r.runnerUp.votes - 1)
        : 0;
      const wasted = loserVotes + surplusWinner;
      return {
        constituencyId: r.constituencyId,
        districtId: r.districtId,
        province: r.province,
        wastedVotes: wasted,
        wastedPercent: r.totalVotes > 0 ? (wasted / r.totalVotes) * 100 : 0,
        totalVotes: r.totalVotes,
      };
    })
    .sort((a, b) => b.wastedPercent - a.wastedPercent);
}

/**
 * Vote efficiency by party: total votes cast ÷ seats won.
 * Also includes wasted votes per party and the seat-vote gap.
 */
export function computePartyAggregates(
  results: ConstituencyResult[]
): PartyAggregate[] {
  const nationalTotalVotes = results.reduce((s, r) => s + r.totalVotes, 0);
  const totalSeats = results.length;

  const partyMap = new Map<
    string,
    {
      party: string;
      partyEn: string | null;
      seats: number;
      totalVotes: number;
      wastedVotes: number;
    }
  >();

  for (const r of results) {
    // Tally each party's votes in this constituency
    const partyVotesInConstituency = new Map<string, number>();
    for (const c of r.candidates) {
      partyVotesInConstituency.set(
        c.party,
        (partyVotesInConstituency.get(c.party) || 0) + c.votes
      );
    }

    for (const [party, votes] of partyVotesInConstituency) {
      if (!partyMap.has(party)) {
        const sample = r.candidates.find((c) => c.party === party);
        partyMap.set(party, {
          party,
          partyEn: sample?.party_en ?? null,
          seats: 0,
          totalVotes: 0,
          wastedVotes: 0,
        });
      }
      const agg = partyMap.get(party)!;
      agg.totalVotes += votes;

      if (r.winner.party === party) {
        agg.seats += 1;
        // Surplus votes for the winner
        const surplus = r.runnerUp
          ? Math.max(0, r.winner.votes - r.runnerUp.votes - 1)
          : 0;
        agg.wastedVotes += surplus;
      } else {
        // All losing votes are wasted
        agg.wastedVotes += votes;
      }
    }
  }

  const aggregates: PartyAggregate[] = [];

  for (const agg of partyMap.values()) {
    const voteShare =
      nationalTotalVotes > 0 ? (agg.totalVotes / nationalTotalVotes) * 100 : 0;
    const seatShare = totalSeats > 0 ? (agg.seats / totalSeats) * 100 : 0;

    aggregates.push({
      party: agg.party,
      partyEn: agg.partyEn,
      seatsWon: agg.seats,
      totalVotes: agg.totalVotes,
      voteShare,
      seatShare,
      seatVoteGap: seatShare - voteShare,
      wastedVotes: agg.wastedVotes,
      voteEfficiency: agg.seats > 0 ? agg.totalVotes / agg.seats : Infinity,
    });
  }

  return aggregates.sort((a, b) => b.seatsWon - a.seatsWon);
}

/**
 * National seat-vote gap summary.
 */
export function nationalSeatVoteGap(aggregates: PartyAggregate[]): {
  party: string;
  partyEn: string | null;
  voteShare: number;
  seatShare: number;
  gap: number;
}[] {
  return aggregates
    .filter((a) => a.seatsWon > 0 || a.voteShare > 1)
    .map((a) => ({
      party: a.party,
      partyEn: a.partyEn,
      voteShare: Math.round(a.voteShare * 100) / 100,
      seatShare: Math.round(a.seatShare * 100) / 100,
      gap: Math.round(a.seatVoteGap * 100) / 100,
    }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

/**
 * Geographic concentration score per party.
 * Herfindahl-Hirschman Index of a party's votes across provinces.
 * Higher = more geographically concentrated (less dispersed).
 * Range: ~0 (perfectly spread) to 10000 (all in one province).
 */
export function geographicConcentration(results: ConstituencyResult[]): {
  party: string;
  partyEn: string | null;
  hhi: number;
  totalVotes: number;
  provinceBreakdown: { province: number; voteShare: number }[];
}[] {
  // Aggregate votes by party by province
  const partyProvinceVotes = new Map<string, Map<number, number>>();
  const partyTotalVotes = new Map<string, number>();
  const partyEnMap = new Map<string, string | null>();

  for (const r of results) {
    for (const c of r.candidates) {
      if (!partyProvinceVotes.has(c.party)) {
        partyProvinceVotes.set(c.party, new Map());
        partyTotalVotes.set(c.party, 0);
        partyEnMap.set(c.party, c.party_en);
      }
      const pMap = partyProvinceVotes.get(c.party)!;
      pMap.set(c.province, (pMap.get(c.province) || 0) + c.votes);
      partyTotalVotes.set(c.party, partyTotalVotes.get(c.party)! + c.votes);
    }
  }

  const concentrations: {
    party: string;
    partyEn: string | null;
    hhi: number;
    totalVotes: number;
    provinceBreakdown: { province: number; voteShare: number }[];
  }[] = [];

  for (const [party, provinceMap] of partyProvinceVotes) {
    const total = partyTotalVotes.get(party) || 0;
    if (total === 0) continue;

    let hhi = 0;
    const breakdown: { province: number; voteShare: number }[] = [];

    for (const [province, votes] of provinceMap) {
      const share = (votes / total) * 100;
      hhi += share * share;
      breakdown.push({ province, voteShare: share });
    }

    breakdown.sort((a, b) => b.voteShare - a.voteShare);

    concentrations.push({
      party,
      partyEn: partyEnMap.get(party) ?? null,
      hhi: Math.round(hhi),
      totalVotes: total,
      provinceBreakdown: breakdown,
    });
  }

  // Only return parties with meaningful vote totals
  return concentrations
    .filter((c) => (partyTotalVotes.get(c.party) || 0) > 100)
    .sort((a, b) => b.hhi - a.hhi);
}

/**
 * Fragmented seats: where the winner got less than a threshold (default 35%).
 */
export function fragmentedSeats(
  results: ConstituencyResult[],
  threshold = 35
): ConstituencyResult[] {
  return results
    .filter((r) => r.winnerVoteShare < threshold && r.totalVotes > 0)
    .sort((a, b) => a.winnerVoteShare - b.winnerVoteShare);
}

// ─── Geographic & Behavioral ────────────────────────────────────────────────

/**
 * Turnout rank by total votes (proxy for turnout when voter rolls are unavailable).
 */
export function turnoutRanking(results: ConstituencyResult[]): TurnoutResult[] {
  const sorted = [...results].sort((a, b) => b.totalVotes - a.totalVotes);
  return sorted.map((r, i) => ({
    constituencyId: r.constituencyId,
    districtId: r.districtId,
    province: r.province,
    totalVotes: r.totalVotes,
    rank: i + 1,
  }));
}

/**
 * Turnout change between two elections (absolute vote count difference).
 */
export function turnoutChange(
  currentResults: ConstituencyResult[],
  previousResults: ConstituencyResult[]
): {
  constituencyId: number;
  districtId: number;
  province: number;
  currentVotes: number;
  previousVotes: number;
  change: number;
  changePercent: number;
}[] {
  const prevMap = new Map<number, ConstituencyResult>();
  for (const r of previousResults) {
    prevMap.set(r.constituencyId, r);
  }

  const changes: {
    constituencyId: number;
    districtId: number;
    province: number;
    currentVotes: number;
    previousVotes: number;
    change: number;
    changePercent: number;
  }[] = [];

  for (const curr of currentResults) {
    const prev = prevMap.get(curr.constituencyId);
    if (!prev || prev.totalVotes === 0) continue;

    changes.push({
      constituencyId: curr.constituencyId,
      districtId: curr.districtId,
      province: curr.province,
      currentVotes: curr.totalVotes,
      previousVotes: prev.totalVotes,
      change: curr.totalVotes - prev.totalVotes,
      changePercent:
        ((curr.totalVotes - prev.totalVotes) / prev.totalVotes) * 100,
    });
  }

  return changes.sort((a, b) => b.changePercent - a.changePercent);
}

/**
 * Province-level performance aggregation.
 * Groups results by province and computes per-party seat/vote tallies.
 */
export function provincePerformance(results: ConstituencyResult[]): Map<
  number,
  {
    province: number;
    totalSeats: number;
    totalVotes: number;
    partySeats: Map<string, number>;
    partyVotes: Map<string, number>;
  }
> {
  const provinceMap = new Map<
    number,
    {
      province: number;
      totalSeats: number;
      totalVotes: number;
      partySeats: Map<string, number>;
      partyVotes: Map<string, number>;
    }
  >();

  for (const r of results) {
    if (!provinceMap.has(r.province)) {
      provinceMap.set(r.province, {
        province: r.province,
        totalSeats: 0,
        totalVotes: 0,
        partySeats: new Map(),
        partyVotes: new Map(),
      });
    }
    const prov = provinceMap.get(r.province)!;
    prov.totalSeats++;
    prov.totalVotes += r.totalVotes;

    // Winner gets the seat
    prov.partySeats.set(
      r.winner.party,
      (prov.partySeats.get(r.winner.party) || 0) + 1
    );

    // All candidate votes
    for (const c of r.candidates) {
      prov.partyVotes.set(
        c.party,
        (prov.partyVotes.get(c.party) || 0) + c.votes
      );
    }
  }

  return provinceMap;
}

// ─── Simulation Layer ───────────────────────────────────────────────────────

/**
 * Uniform National Swing simulator.
 *
 * Shifts a party's vote share by `swingPercent` percentage points
 * in every constituency, redistributing from/to all other parties proportionally.
 *
 * Returns the projected seat count for the swung party and which seats flip.
 */
export function uniformSwingSimulation(
  results: ConstituencyResult[],
  targetParty: string,
  swingPercent: number
): SwingSimulationResult {
  let currentSeats = 0;
  let projectedSeats = 0;
  const flippedConstituencies: number[] = [];

  // Find partyEn
  let partyEn: string | null = null;
  for (const r of results) {
    const found = r.candidates.find((c) => c.party === targetParty);
    if (found?.party_en) {
      partyEn = found.party_en;
      break;
    }
  }

  for (const r of results) {
    const totalVotes = r.totalVotes;
    if (totalVotes === 0) continue;

    // Current winner
    if (r.winner.party === targetParty) currentSeats++;

    // Compute new vote totals after swing
    const targetCandidates = r.candidates.filter(
      (c) => c.party === targetParty
    );
    const otherCandidates = r.candidates.filter((c) => c.party !== targetParty);

    const targetCurrentVotes = targetCandidates.reduce(
      (s, c) => s + c.votes,
      0
    );
    const otherTotalVotes = otherCandidates.reduce((s, c) => s + c.votes, 0);

    // Apply swing as percentage points of total votes
    const swingVotes = (swingPercent / 100) * totalVotes;
    const newTargetVotes = Math.max(0, targetCurrentVotes + swingVotes);

    // Redistribute among others proportionally
    const otherScaleFactor =
      otherTotalVotes > 0
        ? Math.max(0, otherTotalVotes - swingVotes) / otherTotalVotes
        : 0;

    // Find who would win
    let maxVotes = newTargetVotes;
    let maxParty = targetParty;

    for (const c of otherCandidates) {
      const newVotes = c.votes * otherScaleFactor;
      if (newVotes > maxVotes) {
        maxVotes = newVotes;
        maxParty = c.party;
      }
    }

    if (maxParty === targetParty) {
      projectedSeats++;
      // Check if this is a flip
      if (r.winner.party !== targetParty) {
        flippedConstituencies.push(r.constituencyId);
      }
    } else {
      // Check if the target party LOST a seat
      if (r.winner.party === targetParty) {
        flippedConstituencies.push(r.constituencyId);
      }
    }
  }

  return {
    party: targetParty,
    partyEn,
    swingPercent,
    currentSeats,
    projectedSeats,
    seatChange: projectedSeats - currentSeats,
    flippedConstituencies,
  };
}

/**
 * Multi-swing analysis: run the simulator at +1%, +3%, +5%.
 */
export function multiSwingAnalysis(
  results: ConstituencyResult[],
  targetParty: string
): SwingSimulationResult[] {
  return [1, 3, 5].map((swing) =>
    uniformSwingSimulation(results, targetParty, swing)
  );
}

/**
 * Flip cost calculator.
 * For each constituency, calculates how many votes would have flipped
 * the result to the runner-up.
 */
export function flipCostCalculator(
  results: ConstituencyResult[]
): FlipCostEntry[] {
  return results
    .filter((r) => r.runnerUp !== null && r.margin > 0)
    .map((r) => ({
      constituencyId: r.constituencyId,
      districtId: r.districtId,
      province: r.province,
      currentWinner: r.winner.party,
      currentWinnerEn: r.winner.party_en,
      runnerUp: r.runnerUp!.party,
      runnerUpEn: r.runnerUp!.party_en,
      // To flip: need margin/2 + 1 votes to switch (each switched vote is worth 2)
      votesToFlip: Math.ceil(r.margin / 2) + 1,
    }))
    .sort((a, b) => a.votesToFlip - b.votesToFlip);
}

/**
 * Close seat sensitivity: constituencies that would flip under a small swing (< X%).
 */
export function closeSeatSensitivity(
  results: ConstituencyResult[],
  thresholdPercent = 3
): {
  constituencyId: number;
  districtId: number;
  province: number;
  winner: string;
  winnerEn: string | null;
  runnerUp: string;
  runnerUpEn: string | null;
  marginPercent: number;
  votesToFlip: number;
}[] {
  return results
    .filter(
      (r) =>
        r.runnerUp !== null &&
        r.marginPercent < thresholdPercent &&
        r.totalVotes > 0
    )
    .map((r) => ({
      constituencyId: r.constituencyId,
      districtId: r.districtId,
      province: r.province,
      winner: r.winner.party,
      winnerEn: r.winner.party_en,
      runnerUp: r.runnerUp!.party,
      runnerUpEn: r.runnerUp!.party_en,
      marginPercent: r.marginPercent,
      votesToFlip: Math.ceil(r.margin / 2) + 1,
    }))
    .sort((a, b) => a.marginPercent - b.marginPercent);
}

// ─── Summary / Dashboard Stats ──────────────────────────────────────────────

export interface DashboardSummary {
  totalConstituencies: number;
  totalCandidates: number;
  totalVotes: number;
  avgMarginPercent: number;
  avgWinnerVoteShare: number;
  avgCandidatesPerSeat: number;
  majorityWins: number;
  pluralityWins: number;
  fragmentedSeatCount: number;
  avgCompetitiveness: number;
  mostCompetitiveConstituency: CompetitivenessScore | null;
  leastCompetitiveConstituency: CompetitivenessScore | null;
  totalWastedVotes: number;
  wastedVotePercent: number;
}

export function computeDashboardSummary(
  results: ConstituencyResult[],
  competitiveness: CompetitivenessScore[],
  wastedVotes: WastedVoteResult[]
): DashboardSummary {
  const totalConstituencies = results.length;
  const totalCandidates = results.reduce((s, r) => s + r.totalCandidates, 0);
  const totalVotes = results.reduce((s, r) => s + r.totalVotes, 0);
  const avgMarginPercent =
    totalConstituencies > 0
      ? results.reduce((s, r) => s + r.marginPercent, 0) / totalConstituencies
      : 0;
  const avgWinnerVoteShare =
    totalConstituencies > 0
      ? results.reduce((s, r) => s + r.winnerVoteShare, 0) / totalConstituencies
      : 0;

  const majPlu = majorityVsPlurality(results);
  const fragmented = fragmentedSeats(results);
  const avgComp =
    competitiveness.length > 0
      ? competitiveness.reduce((s, c) => s + c.index, 0) /
        competitiveness.length
      : 0;

  const totalWasted = wastedVotes.reduce((s, w) => s + w.wastedVotes, 0);

  return {
    totalConstituencies,
    totalCandidates,
    totalVotes,
    avgMarginPercent: Math.round(avgMarginPercent * 100) / 100,
    avgWinnerVoteShare: Math.round(avgWinnerVoteShare * 100) / 100,
    avgCandidatesPerSeat:
      Math.round(avgCandidatesPerConstituency(results) * 10) / 10,
    majorityWins: majPlu.majority,
    pluralityWins: majPlu.plurality,
    fragmentedSeatCount: fragmented.length,
    avgCompetitiveness: Math.round(avgComp * 10) / 10,
    mostCompetitiveConstituency: competitiveness[0] ?? null,
    leastCompetitiveConstituency:
      competitiveness[competitiveness.length - 1] ?? null,
    totalWastedVotes: totalWasted,
    wastedVotePercent:
      totalVotes > 0 ? Math.round((totalWasted / totalVotes) * 10000) / 100 : 0,
  };
}

// ─── Gender Statistics ──────────────────────────────────────────────────────

// ── Gender category keys & bilingual labels ─────────────────────────────────

type GenderKey = 'male' | 'female' | 'other' | 'unknown';

/** English display labels for each gender key. */
export const GENDER_LABELS_EN: Record<GenderKey, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  unknown: 'Unknown',
};

/** Nepali display labels for each gender key. */
export const GENDER_LABELS_NP: Record<GenderKey, string> = {
  male: 'पुरुष',
  female: 'महिला',
  other: 'अन्य',
  unknown: 'अज्ञात',
};

/**
 * Get the display label for a gender key in the given locale.
 */
export function getGenderLabel(
  key: string,
  locale: 'en' | 'np' = 'en'
): string {
  const labels = locale === 'np' ? GENDER_LABELS_NP : GENDER_LABELS_EN;
  return (labels as Record<string, string>)[key] ?? key;
}

export interface GenderBreakdown {
  /** Total candidates by gender (key is a canonical gender key) */
  totalByGender: { gender: string; count: number }[];
  /** Winners by gender */
  winnersByGender: { gender: string; count: number }[];
  /** Gender-wise average votes received */
  avgVotesByGender: { gender: string; avgVotes: number; totalVotes: number }[];
  /** Party-wise gender breakdown (top parties) */
  partyGenderBreakdown: {
    party: string;
    partyEn: string | null;
    male: number;
    female: number;
    other: number;
    total: number;
    femalePct: number;
  }[];
}

/**
 * Compute gender-related statistics from candidate data.
 *
 * Gender values from the Election Commission are typically:
 *   "Male" / "पुरुष", "Female" / "महिला", or "Other" / "अन्य"
 *
 * We normalize to canonical keys: 'male', 'female', 'other', 'unknown'.
 * Use getGenderLabel(key, locale) for display.
 */
export function computeGenderStats(
  allCandidates: Candidate[],
  results: ConstituencyResult[]
): GenderBreakdown {
  const winners = results.map((r) => r.winner);

  // Normalize gender string to a canonical key
  function normalizeGender(g: string): GenderKey {
    if (!g) return 'unknown';
    const lower = g.trim().toLowerCase();
    // Check female first to ensure 'महिला' (starts with 'म') is not caught by 'म' check for male
    if (
      lower === 'female' ||
      lower === 'महिला' ||
      lower === 'f' ||
      lower.startsWith('f') ||
      lower.startsWith('महि')
    )
      return 'female';
    if (
      lower === 'male' ||
      lower === 'पुरुष' ||
      lower === 'm' ||
      lower.startsWith('m') ||
      lower.startsWith('पु') ||
      lower.startsWith('म')
    )
      return 'male';
    if (!lower) return 'unknown';
    return 'other';
  }

  // Total candidates by gender
  const genderCount = new Map<string, number>();
  const genderVotes = new Map<string, number>();
  for (const c of allCandidates) {
    const g = normalizeGender(c.gender);
    genderCount.set(g, (genderCount.get(g) || 0) + 1);
    genderVotes.set(g, (genderVotes.get(g) || 0) + c.votes);
  }

  const totalByGender = Array.from(genderCount.entries())
    .map(([gender, count]) => ({ gender, count }))
    .sort((a, b) => b.count - a.count);

  // Winners by gender
  const winnerGenderCount = new Map<string, number>();
  for (const w of winners) {
    const g = normalizeGender(w.gender);
    winnerGenderCount.set(g, (winnerGenderCount.get(g) || 0) + 1);
  }

  const winnersByGender = Array.from(winnerGenderCount.entries())
    .map(([gender, count]) => ({ gender, count }))
    .sort((a, b) => b.count - a.count);

  // Average votes by gender
  const avgVotesByGender = Array.from(genderCount.entries())
    .map(([gender, count]) => ({
      gender,
      avgVotes: Math.round((genderVotes.get(gender) || 0) / count),
      totalVotes: genderVotes.get(gender) || 0,
    }))
    .sort((a, b) => b.avgVotes - a.avgVotes);

  // Party-wise gender breakdown
  const partyGender = new Map<
    string,
    { partyEn: string | null; male: number; female: number; other: number }
  >();

  for (const c of allCandidates) {
    if (!partyGender.has(c.party)) {
      partyGender.set(c.party, {
        partyEn: c.party_en,
        male: 0,
        female: 0,
        other: 0,
      });
    }
    const entry = partyGender.get(c.party)!;
    const g = normalizeGender(c.gender);
    if (g === 'male') entry.male++;
    else if (g === 'female') entry.female++;
    else entry.other++;
  }

  const partyGenderBreakdown = Array.from(partyGender.entries())
    .map(([party, data]) => {
      const total = data.male + data.female + data.other;
      return {
        party,
        partyEn: data.partyEn,
        male: data.male,
        female: data.female,
        other: data.other,
        total,
        femalePct: total > 0 ? (data.female / total) * 100 : 0,
      };
    })
    .filter((p) => p.total >= 3) // Only parties with at least 3 candidates
    .sort((a, b) => b.total - a.total);

  return {
    totalByGender,
    winnersByGender,
    avgVotesByGender,
    partyGenderBreakdown,
  };
}

// ─── Education Statistics ───────────────────────────────────────────────────

export interface EducationBreakdown {
  /** Total candidates by education level (key is a canonical education key) */
  totalByEducation: { education: string; count: number }[];
  /** Winners by education level */
  winnersByEducation: { education: string; count: number }[];
  /** Average votes by education level */
  avgVotesByEducation: {
    education: string;
    avgVotes: number;
    totalVotes: number;
    count: number;
  }[];
}

// ── Education category keys & bilingual labels ──────────────────────────────

/**
 * Canonical keys for education categories.
 * These keys are used internally; display labels come from the maps below.
 */
type EducationKey =
  | 'phd'
  | 'masters'
  | 'bachelors'
  | 'intermediate'
  | 'slc'
  | 'below_slc'
  | 'literate'
  | 'not_specified'
  | 'other';

/** English display labels for each education key. */
export const EDUCATION_LABELS_EN: Record<EducationKey, string> = {
  phd: 'PhD / Doctorate',
  masters: 'Masters',
  bachelors: 'Bachelors',
  intermediate: 'Intermediate / +2',
  slc: 'SLC / SEE',
  below_slc: 'Below SLC',
  literate: 'Literate',
  not_specified: 'Not Specified',
  other: 'Other',
};

/** Nepali display labels for each education key. */
export const EDUCATION_LABELS_NP: Record<EducationKey, string> = {
  phd: 'विद्यावारिधि / पीएचडी',
  masters: 'स्नातकोत्तर',
  bachelors: 'स्नातक',
  intermediate: 'प्रमाणपत्र तह / +२',
  slc: 'एसईई / एसएलसी',
  below_slc: 'एसएलसी भन्दा कम',
  literate: 'साक्षर',
  not_specified: 'उल्लेख नभएको',
  other: 'अन्य',
};

/**
 * Get the display label for an education key in the given locale.
 */
export function getEducationLabel(
  key: string,
  locale: 'en' | 'np' = 'en'
): string {
  const labels = locale === 'np' ? EDUCATION_LABELS_NP : EDUCATION_LABELS_EN;
  return (labels as Record<string, string>)[key] ?? key;
}

/**
 * Normalize education/qualification strings into canonical keys.
 *
 * Raw data from the Election Commission is wildly inconsistent — 700+ distinct
 * strings in Nepali, English, abbreviations, mixed, with typos and zero-width
 * characters. We strip ZWJ/ZWNJ, lowercase, and bucket into broad categories.
 *
 * Returns a canonical key (e.g. 'masters', 'bachelors') — NOT a display label.
 * Use getEducationLabel(key, locale) for display.
 */
function normalizeEducation(raw: string): EducationKey {
  if (!raw || !raw.trim()) return 'not_specified';

  // Strip zero-width joiners/non-joiners that appear in Devanagari text
  const cleaned = raw.replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
  const lower = cleaned.toLowerCase();

  // ── PhD / Doctorate ───────────────────────────────────────────────
  if (
    lower.includes('ph.d') ||
    lower.includes('phd') ||
    lower.includes('पीएचडी') ||
    lower.includes('विद्यावारिधि') ||
    lower.includes('doctorate') ||
    lower.includes('doctor of')
  )
    return 'phd';

  // ── Masters ───────────────────────────────────────────────────────
  // Must come before Bachelors because 'स्नातकोत्तर' contains 'स्नातक'
  if (
    lower.includes('post graduate') ||
    lower.includes('post-graduate') ||
    lower.includes('master') ||
    lower.includes('m.a') ||
    lower.includes('m.sc') ||
    lower.includes('m.b.s') ||
    lower.includes('m.ed') ||
    lower.includes('m.phil') ||
    lower.includes('mbs') ||
    lower.includes('mpa') ||
    lower.includes('mba') ||
    lower.includes('ll.m') ||
    lower.includes('m. a') ||
    /\bma\b/.test(lower) ||
    lower.includes('एम.ए') ||
    lower.includes('एम ए') ||
    lower.includes('एमए') ||
    lower.includes('एम.बी.एस') ||
    lower.includes('एम.एड') ||
    lower.includes('एम.एस.सि') ||
    lower.includes('एम.फिल') ||
    lower.includes('स्नातकोत्तर') ||
    lower.includes('स्नातकोतर') ||
    lower.includes('स्नाकोत्तर') ||
    lower.includes('स्नात्तकोत्तर') ||
    lower.includes('स्नात्तकोतर') ||
    lower.includes('स्नातोकत्तर')
  )
    return 'masters';

  // ── Bachelors ─────────────────────────────────────────────────────
  if (
    lower.includes('graduate') ||
    lower.includes('bachelor') ||
    lower.includes('b.a') ||
    lower.includes('b.sc') ||
    lower.includes('b.ed') ||
    lower.includes('b.b.s') ||
    lower.includes('b.com') ||
    lower.includes('b.tech') ||
    lower.includes('b.e.') ||
    lower.includes('ll.b') ||
    lower.includes('bbs') ||
    lower.includes('b.l.') ||
    lower.includes('b.n.') ||
    lower.includes('bba') ||
    lower.includes('b. a') ||
    /\bba\b/.test(lower) ||
    /\bbe\b/.test(lower) ||
    lower.includes('बि.ए') ||
    lower.includes('बि.बि.एस') ||
    lower.includes('बि.एड') ||
    lower.includes('बि.एस.सि') ||
    lower.includes('बि.कम') ||
    lower.includes('बि.ई') ||
    lower.includes('बि.डि') ||
    lower.includes('स्नातक') ||
    lower.includes('स्नाक्तोर') ||
    lower.includes('स्नात्तक') ||
    lower.includes('degree')
  )
    return 'bachelors';

  // ── Intermediate / +2 / Higher Secondary / Proficiency Certificate ─
  if (
    lower.includes('intermediate') ||
    lower.includes('+2') ||
    lower.includes('+२') ||
    lower.includes('plus two') ||
    lower.includes('higher secondary') ||
    lower.includes('i.a') ||
    lower.includes('i.sc') ||
    lower.includes('i.com') ||
    lower.includes('proficiency') ||
    lower.includes('10+2') ||
    lower.includes('१०+२') ||
    lower.includes('twelve') ||
    lower.includes('12') ||
    lower.includes('१२') ||
    lower.includes('उच्च माध्यमिक') ||
    lower.includes('प्रवीणता') ||
    lower.includes('प्रविणता') ||
    lower.includes('प्रमाणपत्र तह') ||
    lower.includes('प्रमाण पत्र तह') ||
    lower.includes('प्लस टु') ||
    lower.includes('प्लस टू') ||
    lower.includes('आई.ए') ||
    lower.includes('आइ ए') ||
    lower.includes('आई ए') ||
    lower.includes('आइ.ए') ||
    lower.includes('आ.ए') || // Common typo for I.A. in 2082 data
    lower.includes('डिप्लोमा') ||
    lower.includes('diploma')
  )
    return 'intermediate';

  // ── SLC / SEE / Secondary (class 10) ──────────────────────────────
  if (
    lower.includes('slc') ||
    lower.includes('s.l.c') ||
    /\bsee\b/.test(lower) ||
    lower.includes('secondary') ||
    lower.includes('माध्यमिक') ||
    lower.includes('10') ||
    lower.includes('१०') ||
    lower.includes('metric') ||
    lower.includes('ten') ||
    lower.includes('matric') ||
    lower.includes('एस.एल.सी') ||
    lower.includes('एस एल सी') ||
    lower.includes('एस.एल.सि') ||
    lower.includes('एस एल सि') ||
    lower.includes('एसएलसी') ||
    lower.includes('एसइइ') ||
    lower.includes('दश') ||
    lower.includes('कक्षा १०') ||
    lower.includes('कक्षा 10') ||
    lower.includes('10 पास') ||
    lower.includes('१० पास') ||
    lower.includes('10 कक्षा')
  )
    return 'slc';

  // ── Below SLC (class 5–9, primary, basic) ─────────────────────────
  if (
    lower.includes('primary') ||
    lower.includes('basic') ||
    lower.includes('under slc') ||
    lower.includes('below') ||
    lower.includes('प्राथमिक') ||
    /[५६७८९]/.test(cleaned) ||
    /\b[5-9]\b/.test(lower) ||
    lower.includes('कक्षा ८') ||
    lower.includes('कक्षा ७') ||
    lower.includes('कक्षा ६') ||
    lower.includes('कक्षा ५') ||
    lower.includes('कक्षा ९') ||
    lower.includes('8 पास') ||
    lower.includes('८ पास') ||
    lower.includes('७ पास') ||
    lower.includes('5 पास') ||
    lower.includes('५ पास') ||
    lower.includes('आठ पास') ||
    lower.includes('8 कक्षा') ||
    lower.includes('७ कक्षा') ||
    lower.includes('5 कक्षा') ||
    lower.includes('9 कक्षा') ||
    lower.includes('9 class') ||
    lower.includes('8 pass') ||
    lower.includes('7 pass') ||
    lower.includes('5 pass') ||
    lower.includes('class 8') ||
    lower.includes('class 7') ||
    lower.includes('class 5')
  )
    return 'below_slc';

  // ── Literate (can read/write but no formal qualification) ─────────
  if (
    lower.includes('literate') ||
    lower.includes('साक्षर') ||
    lower.includes('लेखपढ') ||
    lower.includes('सामान्य') ||
    lower.includes('साधारण')
  )
    return 'literate';

  // ── Catch-all: if only a dash or blank-ish ────────────────────────
  if (cleaned === '-' || cleaned === '—' || cleaned.length <= 1)
    return 'not_specified';

  // If nothing matched, bucket as 'other'
  return 'other';
}

/**
 * Compute education-related statistics from candidate data.
 *
 * Internally uses canonical keys (e.g. 'masters'). The consumer should call
 * getEducationLabel(key, locale) to get the display string.
 */
export function computeEducationStats(
  allCandidates: Candidate[],
  results: ConstituencyResult[]
): EducationBreakdown {
  const winners = results.map((r) => r.winner);

  // Total candidates by education level
  const eduCount = new Map<string, number>();
  const eduVotes = new Map<string, number>();
  for (const c of allCandidates) {
    const edu = normalizeEducation(c.qualification);
    eduCount.set(edu, (eduCount.get(edu) || 0) + 1);
    eduVotes.set(edu, (eduVotes.get(edu) || 0) + c.votes);
  }

  const totalByEducation = Array.from(eduCount.entries())
    .map(([education, count]) => ({ education, count }))
    .sort((a, b) => b.count - a.count);

  // Winners by education level
  const winnerEduCount = new Map<string, number>();
  for (const w of winners) {
    const edu = normalizeEducation(w.qualification);
    winnerEduCount.set(edu, (winnerEduCount.get(edu) || 0) + 1);
  }

  const winnersByEducation = Array.from(winnerEduCount.entries())
    .map(([education, count]) => ({ education, count }))
    .sort((a, b) => b.count - a.count);

  // Average votes by education
  const avgVotesByEducation = Array.from(eduCount.entries())
    .map(([education, count]) => ({
      education,
      avgVotes: Math.round((eduVotes.get(education) || 0) / count),
      totalVotes: eduVotes.get(education) || 0,
      count,
    }))
    .sort((a, b) => b.avgVotes - a.avgVotes);

  return {
    totalByEducation,
    winnersByEducation,
    avgVotesByEducation,
  };
}
