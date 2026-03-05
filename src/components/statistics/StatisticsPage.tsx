/**
 * src/components/statistics/StatisticsPage.tsx
 *
 * Main statistics dashboard page mounted at #/statistics.
 * Assembles all statistical sections — Core Results, Competitiveness,
 * Structural Stats, Geographic, and Simulation — into a scrollable
 * dark-themed layout with D3-powered visualizations.
 *
 * Data flow:
 *   useStatisticsData() hook → pre-computed stats → Section components
 *   Each section uses BarChart, DonutChart, DivergingBarChart, DataTable,
 *   SwingSimulator, and StatCard to present the data.
 */

import React, { useMemo, useState } from 'react';
import useStatisticsData from '../../hooks/useStatisticsData';
import { useLanguage, useTranslation } from '../../i18n';
import { getNameFromFields } from '../../i18n/getName';
import { getEducationLabel, getGenderLabel } from '../../utils/statistics';

// Layout components
import Section from './Section';
import StatCard from './StatCard';

// D3 chart components
import BarChart, { type BarDatum } from './BarChart';
import DonutChart, { type DonutDatum } from './DonutChart';
import DivergingBarChart, { type DivergingDatum } from './DivergingBarChart';
import DataTable, { type Column } from './DataTable';
import SwingSimulator from './SwingSimulator';

// Helpers
import {
  THEME,
  formatNumber,
  formatPercent,
  formatPercentPrecise,
  formatVotes,
  formatSigned,
  formatConstituencyLabel,
  displayPartyName,
  truncate,
  partyColor,
} from './chartHelpers';

import colorMappingJson from '../../config/colorMapping.json';

// ─── Party color lookup ─────────────────────────────────────────────────────

const partyColorMap: Record<string, string> = (
  colorMappingJson as { parties: Record<string, string>; others: string }
).parties;
const othersColor = (
  colorMappingJson as { parties: Record<string, string>; others: string }
).others;

function getPartyColor(partyNp: string): string {
  return partyColorMap[partyNp] ?? othersColor;
}

// ─── Component ──────────────────────────────────────────────────────────────

const SECTION_IDS = [
  'all',
  'core-results',
  'competitiveness',
  'structural',
  'demographics',
  'geographic',
  'simulation',
] as const;

type SectionId = (typeof SECTION_IDS)[number];

const SECTION_LABEL_KEYS: Record<SectionId, string> = {
  all: 'stats_nav_all',
  'core-results': 'stats_nav_core',
  competitiveness: 'stats_nav_competitiveness',
  structural: 'stats_nav_structural',
  demographics: 'stats_nav_demographics',
  geographic: 'stats_nav_geographic',
  simulation: 'stats_nav_simulation',
};

const StatisticsPage: React.FC<{ refreshKey?: number }> = ({
  refreshKey = 0,
}) => {
  const { t } = useTranslation();
  const { locale } = useLanguage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tt = t as (
    key: string,
    params?: Record<string, string | number>
  ) => string;
  const { data, loading, error, runSwingSim, runMultiSwing } =
    useStatisticsData(refreshKey);

  const [activeSection, setActiveSection] = useState<SectionId>('core-results');

  const showSection = (id: string) =>
    activeSection === 'all' || activeSection === id;

  // Build a constituency → district lookup map for use by SwingSimulator.
  // This hook MUST be called before any early returns (Rules of Hooks).
  const constituencyDistrictMap = useMemo(() => {
    const map = new Map<number, number>();
    if (data) {
      for (const r of data.results) {
        map.set(r.constituencyId, r.districtId);
      }
    }
    return map;
  }, [data]);

  // Build a party name (Nepali → English) lookup from candidate data.
  // Used by ProvincePerformanceTable to translate the top-party column.
  // This hook MUST be called before any early returns (Rules of Hooks).
  const partyEnMap = useMemo(() => {
    const map = new Map<string, string | null>();
    if (data) {
      for (const c of data.candidates) {
        if (!map.has(c.party)) map.set(c.party, c.party_en);
      }
    }
    return map;
  }, [data]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="stats-page stats-page--loading">
        <div className="stats-page__loading-box">
          <h2>{tt('stats_loading_title')}</h2>
          <p>{tt('stats_loading_description')}</p>
          <div className="stats-page__spinner" />
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !data) {
    return (
      <div className="stats-page stats-page--error">
        <h2>{tt('stats_error_title')}</h2>
        <p style={{ color: '#ff4d4d' }}>
          {error?.message ?? tt('stats_error_unknown')}
        </p>
        <p style={{ color: THEME.textMuted }}>{tt('stats_error_hint')}</p>
      </div>
    );
  }

  const {
    summary,
    results,
    candidates,
    narrowest10,
    safest10,
    majorityVsPlurality: majPlur,
    avgCandidatesPerSeat,
    candidateDistribution,
    competitiveness,
    wastedVotes,
    partyAggregates,
    seatVoteGap,
    geoConcentration,
    fragmented,
    genderStats,
    educationStats,
    turnoutRank,
    provincePerf,
    flipCosts,
    closeSeatsSensitivity,
    hasPreviousElection,
    swingData,
    flippedSeats,
    incumbentSurvival: incumbentData,
    turnoutChangeData,
    topParties,
  } = data;

  return (
    <div className="stats-page">
      {/* ── Page Header ── */}
      <div className="stats-page__header">
        <h1 className="stats-page__title">{tt('stats_title')}</h1>
        <p className="stats-page__subtitle">
          {tt('stats_subtitle_prefix')}{' '}
          <strong>{summary.totalConstituencies}</strong>{' '}
          {tt('stats_subtitle_constituencies')} &middot;{' '}
          <strong>{formatNumber(summary.totalCandidates)}</strong>{' '}
          {tt('stats_subtitle_candidates')}
          &middot; <strong>{formatVotes(summary.totalVotes)}</strong>{' '}
          {tt('stats_subtitle_votes')}
        </p>

        <nav className="stats-page__nav" aria-label="Statistics sections">
          {SECTION_IDS.map((id) => (
            <button
              key={id}
              className={`stats-page__nav-btn${activeSection === id ? ' stats-page__nav-btn--active' : ''}`}
              onClick={() => setActiveSection(id)}
              aria-pressed={activeSection === id}
            >
              {tt(SECTION_LABEL_KEYS[id])}
            </button>
          ))}
        </nav>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
       *  SUMMARY CARDS
       * ════════════════════════════════════════════════════════════════════ */}
      <div className="stats-card-grid">
        <StatCard
          label={tt('stats_card_seats')}
          value={summary.totalConstituencies}
          subtitle={tt('stats_card_candidates_sub', {
            count: formatNumber(summary.totalCandidates),
          })}
        />
        <StatCard
          label={tt('stats_card_votes_cast')}
          value={formatVotes(summary.totalVotes)}
        />
        <StatCard
          label={tt('stats_card_avg_winner_share')}
          value={formatPercent(summary.avgWinnerVoteShare)}
          subtitle={tt('stats_card_margin', {
            value: formatPercent(summary.avgMarginPercent),
          })}
        />
        <StatCard
          label={tt('stats_card_competitiveness')}
          value={`${summary.avgCompetitiveness}/100`}
          subtitle={tt('stats_card_competitiveness_sub')}
          accentColor={
            summary.avgCompetitiveness > 60
              ? THEME.positive
              : summary.avgCompetitiveness > 40
                ? THEME.accent
                : THEME.negative
          }
        />
        <StatCard
          label={tt('stats_card_wasted_votes')}
          value={formatPercent(summary.wastedVotePercent)}
          subtitle={tt('stats_card_wasted_votes_sub')}
          accentColor={THEME.negative}
        />
        <StatCard
          label={tt('stats_card_candidates_per_seat')}
          value={summary.avgCandidatesPerSeat.toFixed(1)}
        />
        <StatCard
          label={tt('stats_card_majority_wins')}
          value={summary.majorityWins}
          subtitle={tt('stats_card_majority_wins_sub', {
            count: summary.pluralityWins,
          })}
        />
        <StatCard
          label={tt('stats_card_fragmented')}
          value={summary.fragmentedSeatCount}
          subtitle={tt('stats_card_fragmented_sub')}
          accentColor={
            summary.fragmentedSeatCount > 10 ? THEME.negative : THEME.text
          }
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
       *  SECTION 1: CORE RESULTS
       * ════════════════════════════════════════════════════════════════════ */}
      {showSection('core-results') && (
        <Section
          title={tt('stats_core_title')}
          id="core-results"
          description={tt('stats_core_desc')}
        >
          {results.length === 0 ? (
            <div className="stats-no-data-notice">
              <p>{tt('stats_no_results_yet')}</p>
            </div>
          ) : (
            <>
              {/* ── Majority vs Plurality Donut ── */}
              <div className="stats-row">
                <div className="stats-col stats-col--narrow">
                  <MajorityPluralityDonut
                    majority={majPlur.majority}
                    plurality={majPlur.plurality}
                  />
                </div>
                <div className="stats-col stats-col--narrow">
                  <CandidateDistributionDonut
                    distribution={candidateDistribution}
                  />
                </div>
                <div className="stats-col">
                  <PartySeatsDonut partyAggregates={partyAggregates} />
                </div>
              </div>

              {/* ── Narrowest 10 Seats ── */}
              <NarrowestSafestCharts
                narrowest={narrowest10}
                safest={safest10}
              />

              {/* ── Top-3 Vote Concentration Distribution ── */}
              <BarChart
                title={tt('stats_top3_title')}
                data={results
                  .sort((a, b) => b.top3Concentration - a.top3Concentration)
                  .slice(0, 10)
                  .map((r) => ({
                    label: formatConstituencyLabel(
                      r.constituencyId,
                      r.districtId,
                      locale
                    ),
                    value: r.top3Concentration,
                    color: getPartyColor(r.winner.party),
                    tooltipHtml:
                      `<strong>${formatConstituencyLabel(r.constituencyId, r.districtId, locale)}</strong><br/>` +
                      `Top-3 concentration: ${formatPercent(r.top3Concentration)}<br/>` +
                      `Winner: ${displayPartyName(r.winner.party, r.winner.party_en, locale)} (${formatPercent(r.winnerVoteShare)})<br/>` +
                      `Candidates: ${r.totalCandidates}`,
                  }))}
                valueIsPercent
                xLabel={tt('stats_top3_xlabel')}
              />
            </>
          )}
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
       *  SECTION 2: COMPETITIVENESS & SWING
       * ════════════════════════════════════════════════════════════════════ */}
      {showSection('competitiveness') && (
        <Section
          title={tt('stats_comp_title')}
          id="competitiveness"
          description={tt('stats_comp_desc')}
        >
          {/* ── Competitiveness Index ── */}
          <BarChart
            title={tt('stats_comp_chart_title')}
            data={competitiveness.slice(0, 10).map((c, i) => ({
              label: formatConstituencyLabel(
                c.constituencyId,
                c.districtId,
                locale
              ),
              value: c.index,
              color: d3InterpolateCompetitiveness(c.index),
              tooltipHtml:
                `<strong>${formatConstituencyLabel(c.constituencyId, c.districtId, locale)}</strong><br/>` +
                `Index: ${c.index}/100<br/>` +
                `Margin: ${formatPercent(c.marginPercent)}<br/>` +
                `Top-3 concentration: ${formatPercent(c.top3Concentration)}<br/>` +
                `Winner: ${displayPartyName(c.winnerParty, c.winnerPartyEn, locale)}`,
            }))}
            xLabel={tt('stats_comp_xlabel')}
            xMax={100}
            defaultColor={THEME.positive}
          />

          {/* ── Competitiveness Distribution Table ── */}
          <DataTable
            title={tt('stats_comp_table_title')}
            description={tt('stats_comp_table_desc')}
            columns={[
              {
                key: 'constituency',
                label: tt('stats_col_constituency'),
                minWidth: '90px',
              },
              {
                key: 'index',
                label: tt('stats_col_ci_score'),
                align: 'right',
                numeric: true,
                format: (v) => v.toFixed(1),
              },
              {
                key: 'margin',
                label: tt('stats_col_margin_pct'),
                align: 'right',
                numeric: true,
                format: (v) => formatPercent(v),
              },
              {
                key: 'top3',
                label: tt('stats_col_top3_conc'),
                align: 'right',
                numeric: true,
                format: (v) => formatPercent(v),
              },
              { key: 'winner', label: tt('stats_col_winner') },
            ]}
            rows={competitiveness.map((c) => ({
              constituency: formatConstituencyLabel(
                c.constituencyId,
                c.districtId,
                locale
              ),
              index: c.index,
              margin: c.marginPercent,
              top3: c.top3Concentration,
              winner: displayPartyName(c.winnerParty, c.winnerPartyEn, locale),
            }))}
            initialRows={15}
            defaultSortKey="index"
            defaultSortDir="desc"
            showRowNumbers
            compact
          />

          {/* ── Cross-election metrics ── */}
          {hasPreviousElection && (
            <>
              {/* Flipped Seats */}
              {flippedSeats && flippedSeats.length > 0 && (
                <DataTable
                  title={tt('stats_flipped_title', {
                    count: flippedSeats.length,
                  })}
                  description={tt('stats_flipped_desc')}
                  columns={[
                    {
                      key: 'constituency',
                      label: tt('stats_col_constituency'),
                      minWidth: '90px',
                    },
                    {
                      key: 'previous',
                      label: tt('stats_col_prev_winner'),
                      render: (v) => (
                        <span style={{ color: THEME.negative }}>{v}</span>
                      ),
                    },
                    {
                      key: 'current',
                      label: tt('stats_col_curr_winner'),
                      render: (v) => (
                        <span style={{ color: THEME.positive }}>{v}</span>
                      ),
                    },
                    {
                      key: 'margin',
                      label: tt('stats_col_margin_pct'),
                      align: 'right',
                      numeric: true,
                      format: (v) => formatPercent(v),
                    },
                  ]}
                  rows={flippedSeats.map((f) => ({
                    constituency: formatConstituencyLabel(
                      f.constituencyId,
                      f.districtId,
                      locale
                    ),
                    previous: displayPartyName(
                      f.previousWinner,
                      f.previousWinnerEn,
                      locale
                    ),
                    current: displayPartyName(
                      f.currentWinner,
                      f.currentWinnerEn,
                      locale
                    ),
                    margin: f.marginPercent,
                  }))}
                  initialRows={15}
                  defaultSortKey="margin"
                  showRowNumbers
                />
              )}

              {/* Incumbent Survival */}
              {incumbentData && incumbentData.total > 0 && (
                <>
                  <div className="stats-row">
                    <div className="stats-col stats-col--narrow">
                      <DonutChart
                        title={tt('stats_incumbent_survival')}
                        data={[
                          {
                            label: tt('stats_survived'),
                            value: incumbentData.survived,
                            color: THEME.positive,
                          },
                          {
                            label: tt('stats_lost'),
                            value: incumbentData.lost,
                            color: THEME.negative,
                          },
                        ]}
                        centerLabel={`${Math.round(incumbentData.survivalRate)}%`}
                        centerSublabel={tt('stats_survival_rate')}
                        size={260}
                      />
                    </div>
                    <div className="stats-col">
                      <DivergingBarChart
                        title={tt('stats_incumbent_change_title')}
                        data={incumbentData.details
                          .sort(
                            (a, b) =>
                              Math.abs(b.voteShareChange) -
                              Math.abs(a.voteShareChange)
                          )
                          .slice(0, 10)
                          .map((d) => {
                            const name = getNameFromFields(
                              d.incumbentNameEn,
                              d.incumbentName,
                              locale
                            );
                            const party = displayPartyName(
                              d.incumbentParty,
                              d.incumbentPartyEn,
                              locale
                            );
                            return {
                              label: truncate(name, 22),
                              value: d.voteShareChange,
                              tooltipHtml:
                                `<strong>${name}</strong><br/>` +
                                `${tt('stats_col_party')}: ${party}<br/>` +
                                `Previous: ${formatPercent(d.previousVoteShare)}<br/>` +
                                `Current: ${formatPercent(d.currentVoteShare)}<br/>` +
                                `Change: ${formatSigned(d.voteShareChange)}<br/>` +
                                `${d.survived ? tt('stats_reelected') : tt('stats_defeated')}`,
                            };
                          })}
                        xLabel={tt('stats_incumbent_change_xlabel')}
                        maxBars={10}
                        sort="abs-desc"
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {!hasPreviousElection && (
            <div className="stats-no-data-notice">
              <p>
                <strong>{tt('stats_no_cross_election')}</strong>{' '}
                {tt('stats_no_cross_election_desc')}
              </p>
            </div>
          )}
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
       *  SECTION 3: STRUCTURAL & "DAMN" STATS
       * ════════════════════════════════════════════════════════════════════ */}
      {showSection('structural') && (
        <Section
          title={tt('stats_structural_title')}
          id="structural"
          description={tt('stats_structural_desc')}
        >
          {/* ── Seat-Vote Gap ── */}
          <DivergingBarChart
            title={tt('stats_svgap_title')}
            data={seatVoteGap.slice(0, 15).map((s) => ({
              label: truncate(displayPartyName(s.party, s.partyEn, locale), 28),
              value: s.gap,
              color: s.gap > 0 ? THEME.positive : THEME.negative,
              tooltipHtml:
                `<strong>${displayPartyName(s.party, s.partyEn, locale)}</strong><br/>` +
                `Seat share: ${formatPercentPrecise(s.seatShare)}<br/>` +
                `Vote share: ${formatPercentPrecise(s.voteShare)}<br/>` +
                `Gap: ${formatSigned(s.gap)} pp<br/>` +
                `${s.gap > 0 ? tt('stats_over_represented') : tt('stats_under_represented')} ${tt('stats_in_fptp')}`,
            }))}
            xLabel={tt('stats_svgap_xlabel')}
            zeroLabel="0"
            sort="abs-desc"
            maxBars={15}
          />

          {/* ── Vote Efficiency by Party ── */}
          <DataTable
            title={tt('stats_vote_efficiency_title')}
            description={tt('stats_vote_efficiency_desc')}
            columns={[
              { key: 'party', label: tt('stats_col_party'), minWidth: '140px' },
              {
                key: 'seats',
                label: tt('stats_col_seats'),
                align: 'right',
                numeric: true,
              },
              {
                key: 'totalVotes',
                label: tt('stats_col_total_votes'),
                align: 'right',
                numeric: true,
                format: (v) => formatVotes(v),
              },
              {
                key: 'voteShare',
                label: tt('stats_col_vote_pct'),
                align: 'right',
                numeric: true,
                format: (v) => formatPercent(v),
              },
              {
                key: 'seatShare',
                label: tt('stats_col_seat_pct'),
                align: 'right',
                numeric: true,
                format: (v) => formatPercent(v),
              },
              {
                key: 'efficiency',
                label: tt('stats_col_votes_per_seat'),
                align: 'right',
                numeric: true,
                format: (v) =>
                  v === Infinity ? '∞' : formatNumber(Math.round(v)),
              },
              {
                key: 'wastedVotes',
                label: tt('stats_col_wasted_votes'),
                align: 'right',
                numeric: true,
                format: (v) => formatVotes(v),
              },
            ]}
            rows={partyAggregates.map((p) => ({
              party: displayPartyName(p.party, p.partyEn, locale),
              seats: p.seatsWon,
              totalVotes: p.totalVotes,
              voteShare: p.voteShare,
              seatShare: p.seatShare,
              efficiency: p.voteEfficiency,
              wastedVotes: p.wastedVotes,
            }))}
            initialRows={15}
            defaultSortKey="seats"
            defaultSortDir="desc"
            showRowNumbers
          />

          {/* ── Wasted Votes Bar Chart ── */}
          <BarChart
            title={tt('stats_wasted_chart_title')}
            data={wastedVotes.slice(0, 10).map((w) => ({
              label: formatConstituencyLabel(
                w.constituencyId,
                w.districtId,
                locale
              ),
              value: w.wastedPercent,
              color: THEME.negative,
              annotation: `${formatPercent(w.wastedPercent)} (${formatVotes(w.wastedVotes)})`,
              tooltipHtml:
                `<strong>${formatConstituencyLabel(w.constituencyId, w.districtId, locale)}</strong><br/>` +
                `Wasted: ${formatVotes(w.wastedVotes)} of ${formatVotes(w.totalVotes)}<br/>` +
                `${formatPercent(w.wastedPercent)} wasted`,
            }))}
            valueIsPercent
            xLabel={tt('stats_wasted_xlabel')}
            defaultColor={THEME.negative}
          />

          {/* ── Geographic Concentration ── */}
          <DataTable
            title={tt('stats_geo_conc_title')}
            description={tt('stats_geo_conc_desc')}
            columns={[
              { key: 'party', label: tt('stats_col_party'), minWidth: '140px' },
              {
                key: 'totalVotes',
                label: tt('stats_col_votes'),
                align: 'right',
                numeric: true,
                format: (v) => formatVotes(v),
              },
              {
                key: 'hhi',
                label: tt('stats_col_hhi'),
                align: 'right',
                numeric: true,
                format: (v) => formatNumber(v),
              },
              {
                key: 'topProvince',
                label: tt('stats_col_strongest_province'),
              },
              {
                key: 'topProvinceShare',
                label: tt('stats_col_share_top_province'),
                align: 'right',
                numeric: true,
                format: (v) => formatPercent(v),
              },
            ]}
            rows={geoConcentration.map((g) => ({
              party: displayPartyName(g.party, g.partyEn, locale),
              totalVotes: g.totalVotes,
              hhi: g.hhi,
              topProvince: g.provinceBreakdown[0]
                ? tt('stats_province_label', {
                    id: g.provinceBreakdown[0].province,
                  })
                : '—',
              topProvinceShare: g.provinceBreakdown[0]?.voteShare ?? 0,
            }))}
            initialRows={15}
            defaultSortKey="hhi"
            defaultSortDir="desc"
            showRowNumbers
          />

          {/* ── Fragmented Seats ── */}
          {fragmented.length > 0 && (
            <DataTable
              title={tt('stats_fragmented_title', { count: fragmented.length })}
              description={tt('stats_fragmented_desc')}
              columns={[
                {
                  key: 'constituency',
                  label: tt('stats_col_constituency'),
                  minWidth: '90px',
                },
                { key: 'winner', label: tt('stats_col_winner') },
                {
                  key: 'voteShare',
                  label: tt('stats_col_winner_vote_pct'),
                  align: 'right',
                  numeric: true,
                  format: (v) => formatPercent(v),
                  render: (v) => (
                    <span style={{ color: THEME.negative, fontWeight: 600 }}>
                      {formatPercent(v)}
                    </span>
                  ),
                },
                {
                  key: 'candidates',
                  label: tt('stats_col_candidates'),
                  align: 'right',
                  numeric: true,
                },
                {
                  key: 'margin',
                  label: tt('stats_col_margin_pct'),
                  align: 'right',
                  numeric: true,
                  format: (v) => formatPercent(v),
                },
              ]}
              rows={fragmented.map((f) => ({
                constituency: formatConstituencyLabel(
                  f.constituencyId,
                  f.districtId,
                  locale
                ),
                winner: displayPartyName(
                  f.winner.party,
                  f.winner.party_en,
                  locale
                ),
                voteShare: f.winnerVoteShare,
                candidates: f.totalCandidates,
                margin: f.marginPercent,
              }))}
              initialRows={15}
              defaultSortKey="voteShare"
              showRowNumbers
            />
          )}
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
       *  SECTION 4: GEOGRAPHIC & BEHAVIORAL
       * ════════════════════════════════════════════════════════════════════ */}
      {/* ════════════════════════════════════════════════════════════════════
       *  SECTION: DEMOGRAPHICS
       * ════════════════════════════════════════════════════════════════════ */}
      {showSection('demographics') && (
        <Section
          title={tt('stats_demographics_title')}
          id="demographics"
          description={tt('stats_demographics_desc')}
        >
          {/* ── Gender Donuts ── */}
          <div className="stats-row">
            <div className="stats-col stats-col--narrow">
              <DonutChart
                title={tt('stats_gender_donut_title')}
                data={genderStats.totalByGender.map((g, i) => ({
                  label: getGenderLabel(g.gender, locale),
                  value: g.count,
                  color:
                    g.gender === 'male'
                      ? THEME.neutral
                      : g.gender === 'female'
                        ? '#e377c2'
                        : THEME.textMuted,
                }))}
                centerLabel={`${genderStats.totalByGender.reduce((s, g) => s + g.count, 0)}`}
                centerSublabel={tt('stats_gender_candidates')}
                size={280}
              />
            </div>
            <div className="stats-col stats-col--narrow">
              <DonutChart
                title={tt('stats_gender_winners_title')}
                data={genderStats.winnersByGender.map((g) => ({
                  label: getGenderLabel(g.gender, locale),
                  value: g.count,
                  color:
                    g.gender === 'male'
                      ? THEME.neutral
                      : g.gender === 'female'
                        ? '#e377c2'
                        : THEME.textMuted,
                }))}
                centerLabel={`${genderStats.winnersByGender.reduce((s, g) => s + g.count, 0)}`}
                centerSublabel={tt('stats_gender_winners_center')}
                size={280}
              />
            </div>
            <div className="stats-col">
              <BarChart
                title={tt('stats_gender_avg_votes_title')}
                data={genderStats.avgVotesByGender.map((g) => ({
                  label: getGenderLabel(g.gender, locale),
                  value: g.avgVotes,
                  color:
                    g.gender === 'male'
                      ? THEME.neutral
                      : g.gender === 'female'
                        ? '#e377c2'
                        : THEME.textMuted,
                  tooltipHtml:
                    `<strong>${getGenderLabel(g.gender, locale)}</strong><br/>` +
                    `Avg votes: ${formatNumber(g.avgVotes)}<br/>` +
                    `Total votes: ${formatVotes(g.totalVotes)}`,
                }))}
                xLabel={tt('stats_gender_avg_votes_xlabel')}
              />
            </div>
          </div>

          {/* ── Party Gender Breakdown Table ── */}
          <DataTable
            title={tt('stats_gender_party_title')}
            description={tt('stats_gender_party_desc')}
            columns={[
              { key: 'party', label: tt('stats_col_party'), minWidth: '140px' },
              {
                key: 'male',
                label: tt('stats_col_male'),
                align: 'right',
                numeric: true,
              },
              {
                key: 'female',
                label: tt('stats_col_female'),
                align: 'right',
                numeric: true,
              },
              {
                key: 'other',
                label: tt('stats_col_other'),
                align: 'right',
                numeric: true,
              },
              {
                key: 'total',
                label: tt('stats_col_total'),
                align: 'right',
                numeric: true,
              },
              {
                key: 'femalePct',
                label: tt('stats_col_female_pct'),
                align: 'right',
                numeric: true,
                format: (v) => formatPercent(v),
                render: (v) => (
                  <span
                    style={{
                      color:
                        v > 30
                          ? THEME.positive
                          : v > 15
                            ? THEME.accent
                            : THEME.negative,
                      fontWeight: 600,
                    }}
                  >
                    {formatPercent(v)}
                  </span>
                ),
              },
            ]}
            rows={genderStats.partyGenderBreakdown.map((p) => ({
              party: displayPartyName(p.party, p.partyEn, locale),
              male: p.male,
              female: p.female,
              other: p.other,
              total: p.total,
              femalePct: p.femalePct,
            }))}
            initialRows={15}
            defaultSortKey="total"
            defaultSortDir="desc"
            showRowNumbers
          />

          {/* ── Education Donuts ── */}
          <div className="stats-row">
            <div className="stats-col stats-col--narrow">
              <DonutChart
                title={tt('stats_education_donut_title')}
                data={educationStats.totalByEducation
                  .slice(0, 8)
                  .map((e, i) => ({
                    label: truncate(getEducationLabel(e.education, locale), 20),
                    value: e.count,
                    color: partyColor(i),
                  }))}
                centerLabel={`${educationStats.totalByEducation.length}`}
                centerSublabel={tt('stats_cand_per_const_center')}
                size={280}
              />
            </div>
            <div className="stats-col stats-col--narrow">
              <DonutChart
                title={tt('stats_education_winners_title')}
                data={educationStats.winnersByEducation
                  .slice(0, 8)
                  .map((e, i) => ({
                    label: truncate(getEducationLabel(e.education, locale), 20),
                    value: e.count,
                    color: partyColor(i),
                  }))}
                centerLabel={`${educationStats.winnersByEducation.reduce((s, e) => s + e.count, 0)}`}
                centerSublabel={tt('stats_gender_winners_center')}
                size={280}
              />
            </div>
            <div className="stats-col">
              <BarChart
                title={tt('stats_education_avg_title')}
                data={educationStats.avgVotesByEducation
                  .slice(0, 10)
                  .map((e, i) => ({
                    label: truncate(getEducationLabel(e.education, locale), 22),
                    value: e.avgVotes,
                    color: partyColor(i),
                    tooltipHtml:
                      `<strong>${getEducationLabel(e.education, locale)}</strong><br/>` +
                      `Avg votes: ${formatNumber(e.avgVotes)}<br/>` +
                      `Candidates: ${e.count}<br/>` +
                      `Total votes: ${formatVotes(e.totalVotes)}`,
                  }))}
                xLabel={tt('stats_education_avg_xlabel')}
              />
            </div>
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
       *  SECTION 4: GEOGRAPHIC & BEHAVIORAL
       * ════════════════════════════════════════════════════════════════════ */}
      {showSection('geographic') && (
        <Section
          title={tt('stats_geo_title')}
          id="geographic"
          description={tt('stats_geo_desc')}
        >
          {/* ── Province Performance ── */}
          <ProvincePerformanceTable
            provincePerf={provincePerf}
            partyEnMap={partyEnMap}
          />

          {/* ── Turnout Ranking ── */}
          <BarChart
            title={tt('stats_turnout_top_title')}
            data={turnoutRank.slice(0, 10).map((t) => ({
              label: formatConstituencyLabel(
                t.constituencyId,
                t.districtId,
                locale
              ),
              value: t.totalVotes,
              color: THEME.neutral,
              annotation: formatVotes(t.totalVotes),
              tooltipHtml:
                `<strong>${formatConstituencyLabel(t.constituencyId, t.districtId, locale)}</strong><br/>` +
                `Rank: #${t.rank}<br/>` +
                `Total votes: ${formatNumber(t.totalVotes)}`,
            }))}
            xLabel={tt('stats_turnout_xlabel')}
            defaultColor={THEME.neutral}
          />

          {/* Bottom 20 turnout */}
          <BarChart
            title={tt('stats_turnout_bottom_title')}
            data={[...turnoutRank]
              .reverse()
              .slice(0, 10)
              .map((t) => ({
                label: formatConstituencyLabel(
                  t.constituencyId,
                  t.districtId,
                  locale
                ),
                value: t.totalVotes,
                color: THEME.negative,
                annotation: formatVotes(t.totalVotes),
                tooltipHtml:
                  `<strong>${formatConstituencyLabel(t.constituencyId, t.districtId, locale)}</strong><br/>` +
                  `Rank: #${t.rank} (of ${turnoutRank.length})<br/>` +
                  `Total votes: ${formatNumber(t.totalVotes)}`,
              }))}
            xLabel={tt('stats_turnout_xlabel')}
            defaultColor={THEME.negative}
          />

          {/* ── Turnout Change ── */}
          {hasPreviousElection &&
            turnoutChangeData &&
            turnoutChangeData.length > 0 && (
              <DivergingBarChart
                title={tt('stats_turnout_change_title')}
                data={turnoutChangeData
                  .sort(
                    (a, b) =>
                      Math.abs(b.changePercent) - Math.abs(a.changePercent)
                  )
                  .slice(0, 10)
                  .map((t) => ({
                    label: formatConstituencyLabel(
                      t.constituencyId,
                      t.districtId,
                      locale
                    ),
                    value: t.changePercent,
                    tooltipHtml:
                      `<strong>${formatConstituencyLabel(t.constituencyId, t.districtId, locale)}</strong><br/>` +
                      `Current: ${formatNumber(t.currentVotes)} votes<br/>` +
                      `Previous: ${formatNumber(t.previousVotes)} votes<br/>` +
                      `Change: ${formatSigned(t.changePercent)}`,
                  }))}
                xLabel={tt('stats_turnout_change_xlabel')}
                sort="abs-desc"
                maxBars={10}
              />
            )}
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
       *  SECTION 5: SIMULATION LAYER
       * ════════════════════════════════════════════════════════════════════ */}
      {showSection('simulation') && (
        <Section
          title={tt('stats_sim_title')}
          id="simulation"
          description={tt('stats_sim_desc')}
        >
          {/* ── Swing Simulator ── */}
          <SwingSimulator
            topParties={topParties}
            onSimulate={runSwingSim}
            onMultiSwing={runMultiSwing}
            constituencyDistrictMap={constituencyDistrictMap}
          />

          {/* ── Flip Cost Calculator ── */}
          <DataTable
            title={tt('stats_flip_cost_title')}
            description={tt('stats_flip_cost_desc')}
            columns={[
              {
                key: 'constituency',
                label: tt('stats_col_constituency'),
                minWidth: '90px',
              },
              { key: 'currentWinner', label: tt('stats_col_curr_winner') },
              { key: 'runnerUp', label: tt('stats_col_runner_up') },
              {
                key: 'votesToFlip',
                label: tt('stats_col_votes_to_flip'),
                align: 'right',
                numeric: true,
                render: (v) => (
                  <span style={{ color: THEME.accent, fontWeight: 700 }}>
                    {formatNumber(v)}
                  </span>
                ),
              },
            ]}
            rows={flipCosts.map((f) => ({
              constituency: formatConstituencyLabel(
                f.constituencyId,
                f.districtId,
                locale
              ),
              currentWinner: displayPartyName(
                f.currentWinner,
                f.currentWinnerEn,
                locale
              ),
              runnerUp: displayPartyName(f.runnerUp, f.runnerUpEn, locale),
              votesToFlip: f.votesToFlip,
            }))}
            initialRows={10}
            defaultSortKey="votesToFlip"
            showRowNumbers
          />

          {/* ── Aggregate flip cost summary ── */}
          <FlipCostSummary flipCosts={flipCosts} />

          {/* ── Close Seat Sensitivity ── */}
          <DataTable
            title={tt('stats_close_seat_title', {
              count: closeSeatsSensitivity.length,
            })}
            description={tt('stats_close_seat_desc')}
            columns={[
              {
                key: 'constituency',
                label: tt('stats_col_constituency'),
                minWidth: '90px',
              },
              { key: 'winner', label: tt('stats_col_curr_winner') },
              { key: 'runnerUp', label: tt('stats_col_runner_up') },
              {
                key: 'margin',
                label: tt('stats_col_margin_pct'),
                align: 'right',
                numeric: true,
                format: (v) => formatPercent(v),
                render: (v) => (
                  <span style={{ color: THEME.accent, fontWeight: 600 }}>
                    {formatPercent(v)}
                  </span>
                ),
              },
              {
                key: 'votesToFlip',
                label: tt('stats_col_votes_to_flip'),
                align: 'right',
                numeric: true,
                format: (v) => formatNumber(v),
              },
            ]}
            rows={closeSeatsSensitivity.map((c) => ({
              constituency: formatConstituencyLabel(
                c.constituencyId,
                c.districtId,
                locale
              ),
              winner: displayPartyName(c.winner, c.winnerEn, locale),
              runnerUp: displayPartyName(c.runnerUp, c.runnerUpEn, locale),
              margin: c.marginPercent,
              votesToFlip: c.votesToFlip,
            }))}
            initialRows={10}
            defaultSortKey="margin"
            showRowNumbers
          />
        </Section>
      )}

      {/* ── Footer ── */}
      <div className="stats-page__footer">
        <p>{tt('stats_footer')}</p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS (kept in same file to reduce file count)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Majority vs Plurality donut chart.
 */
const MajorityPluralityDonut: React.FC<{
  majority: number;
  plurality: number;
}> = ({ majority, plurality }) => {
  const { t } = useTranslation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tt = t as (
    key: string,
    params?: Record<string, string | number>
  ) => string;
  return (
    <DonutChart
      title={tt('stats_majority_vs_plurality')}
      data={[
        {
          label: tt('stats_majority_label'),
          value: majority,
          color: THEME.positive,
        },
        {
          label: tt('stats_plurality_label'),
          value: plurality,
          color: THEME.negative,
        },
      ]}
      centerLabel={`${majority}`}
      centerSublabel={tt('stats_majority_wins_center')}
      size={280}
    />
  );
};

/**
 * Candidate count distribution donut.
 */
const CandidateDistributionDonut: React.FC<{
  distribution: { count: number; frequency: number }[];
}> = ({ distribution }) => {
  const { t } = useTranslation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tt = t as (
    key: string,
    params?: Record<string, string | number>
  ) => string;
  const donutData: DonutDatum[] = distribution.map((d, i) => ({
    label: `${d.count}`,
    value: d.frequency,
    color: partyColor(i),
  }));

  return (
    <DonutChart
      title={tt('stats_cand_per_const')}
      data={donutData}
      centerLabel={`${distribution.length}`}
      centerSublabel={tt('stats_cand_per_const_center')}
      size={280}
      legendColumns={2}
    />
  );
};

/**
 * Party seats donut chart.
 */
const PartySeatsDonut: React.FC<{
  partyAggregates: {
    party: string;
    partyEn: string | null;
    seatsWon: number;
    totalVotes: number;
    voteShare: number;
    seatShare: number;
  }[];
}> = ({ partyAggregates }) => {
  // Show top 8 parties + combine the rest as "Others"
  const topN = 8;
  const { t } = useTranslation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tt = t as (
    key: string,
    params?: Record<string, string | number>
  ) => string;
  const top = partyAggregates.slice(0, topN);
  const othersSeats = partyAggregates
    .slice(topN)
    .reduce((s, p) => s + p.seatsWon, 0);

  const { locale: partyLocale } = useLanguage();
  const donutData: DonutDatum[] = top.map((p) => ({
    label: truncate(displayPartyName(p.party, p.partyEn, partyLocale), 30),
    value: p.seatsWon,
    color: getPartyColor(p.party),
    tooltipHtml:
      `<strong>${displayPartyName(p.party, p.partyEn, partyLocale)}</strong><br/>` +
      `Seats: ${p.seatsWon} (${formatPercent(p.seatShare)})<br/>` +
      `Votes: ${formatVotes(p.totalVotes)} (${formatPercent(p.voteShare)})`,
  }));

  if (othersSeats > 0) {
    donutData.push({
      label: tt('stats_others'),
      value: othersSeats,
      color: othersColor,
    });
  }

  const totalSeats = partyAggregates.reduce((s, p) => s + p.seatsWon, 0);

  return (
    <DonutChart
      title={tt('stats_seat_distribution')}
      data={donutData}
      centerLabel={`${totalSeats}`}
      centerSublabel={tt('stats_total_seats')}
      size={320}
    />
  );
};

/**
 * Narrowest + Safest seats side by side.
 */
const NarrowestSafestCharts: React.FC<{
  narrowest: {
    constituencyId: number;
    districtId: number;
    marginPercent: number;
    margin: number;
    winner: { party: string; party_en: string | null; name_np: string };
    runnerUp: {
      party: string;
      party_en: string | null;
      name_np: string;
    } | null;
    winnerVoteShare: number;
  }[];
  safest: {
    constituencyId: number;
    districtId: number;
    marginPercent: number;
    margin: number;
    winner: { party: string; party_en: string | null; name_np: string };
    winnerVoteShare: number;
  }[];
}> = ({ narrowest, safest }) => {
  const { t } = useTranslation();
  const tt = t as (
    key: string,
    params?: Record<string, string | number>
  ) => string;
  const { locale: chartLocale } = useLanguage();
  const narrowData: BarDatum[] = narrowest.map((r) => ({
    label: formatConstituencyLabel(r.constituencyId, r.districtId, chartLocale),
    value: r.marginPercent,
    color: getPartyColor(r.winner.party),
    tooltipHtml:
      `<strong>${formatConstituencyLabel(r.constituencyId, r.districtId, chartLocale)}</strong><br/>` +
      `Margin: ${formatPercent(r.marginPercent)} (${formatNumber(r.margin)} votes)<br/>` +
      `Winner: ${displayPartyName(r.winner.party, r.winner.party_en, chartLocale)}<br/>` +
      (r.runnerUp
        ? `Runner-up: ${displayPartyName(r.runnerUp.party, r.runnerUp.party_en, chartLocale)}`
        : ''),
  }));

  const safeData: BarDatum[] = safest.map((r) => ({
    label: formatConstituencyLabel(r.constituencyId, r.districtId, chartLocale),
    value: r.marginPercent,
    color: getPartyColor(r.winner.party),
    tooltipHtml:
      `<strong>${formatConstituencyLabel(r.constituencyId, r.districtId, chartLocale)}</strong><br/>` +
      `Margin: ${formatPercent(r.marginPercent)} (${formatNumber(r.margin)} votes)<br/>` +
      `Winner vote share: ${formatPercent(r.winnerVoteShare)}<br/>` +
      `Party: ${displayPartyName(r.winner.party, r.winner.party_en, chartLocale)}`,
  }));

  return (
    <div className="stats-row">
      <div className="stats-col">
        <BarChart
          title={tt('stats_narrowest_title')}
          data={narrowData}
          valueIsPercent
          xLabel={tt('stats_margin_xlabel')}
        />
      </div>
      <div className="stats-col">
        <BarChart
          title={tt('stats_safest_title')}
          data={safeData}
          valueIsPercent
          xLabel={tt('stats_margin_xlabel')}
        />
      </div>
    </div>
  );
};

/**
 * Province-level performance summary table.
 */
const ProvincePerformanceTable: React.FC<{
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
  partyEnMap: Map<string, string | null>;
}> = ({ provincePerf, partyEnMap }) => {
  const { t } = useTranslation();
  const { locale } = useLanguage();
  const tt = t as (
    key: string,
    params?: Record<string, string | number>
  ) => string;
  const provinces = Array.from(provincePerf.values()).sort(
    (a, b) => a.province - b.province
  );

  if (provinces.length === 0) return null;

  // Find the dominant party per province
  const rows = provinces.map((prov) => {
    let topParty = '';
    let topSeats = 0;
    for (const [party, seats] of prov.partySeats) {
      if (seats > topSeats) {
        topSeats = seats;
        topParty = party;
      }
    }

    return {
      province: tt('stats_province_label', { id: String(prov.province) }),
      totalSeats: prov.totalSeats,
      totalVotes: prov.totalVotes,
      topParty: displayPartyName(
        topParty,
        partyEnMap.get(topParty) ?? null,
        locale
      ),
      topPartySeats: topSeats,
      topPartyShare:
        prov.totalSeats > 0 ? (topSeats / prov.totalSeats) * 100 : 0,
    };
  });

  return (
    <DataTable
      title={tt('stats_province_perf_title')}
      description={tt('stats_geo_desc')}
      columns={[
        { key: 'province', label: tt('stats_col_province'), minWidth: '100px' },
        {
          key: 'totalSeats',
          label: tt('stats_col_total_seats'),
          align: 'right',
          numeric: true,
        },
        {
          key: 'totalVotes',
          label: tt('stats_col_total_votes'),
          align: 'right',
          numeric: true,
          format: (v) => formatVotes(v),
        },
        { key: 'topParty', label: tt('stats_col_top_party') },
        {
          key: 'topPartySeats',
          label: tt('stats_col_top_party_seats'),
          align: 'right',
          numeric: true,
        },
        {
          key: 'topPartyShare',
          label: tt('stats_col_top_party_share'),
          align: 'right',
          numeric: true,
          format: (v) => formatPercent(v),
        },
      ]}
      rows={rows}
      defaultSortKey="province"
      defaultSortDir="asc"
    />
  );
};

/**
 * Flip cost summary — aggregate numbers.
 */
const FlipCostSummary: React.FC<{
  flipCosts: {
    constituencyId: number;
    votesToFlip: number;
    runnerUp: string;
    runnerUpEn: string | null;
  }[];
}> = ({ flipCosts }) => {
  const { t } = useTranslation();
  const tt = t as (
    key: string,
    params?: Record<string, string | number>
  ) => string;
  if (flipCosts.length === 0) return null;

  // Aggregate: how many seats could X total votes flip?
  const thresholds = [100, 500, 1000, 5000];
  const summaryData = thresholds.map((threshold) => {
    const flippable = flipCosts.filter((f) => f.votesToFlip <= threshold);
    return {
      threshold,
      count: flippable.length,
    };
  });

  // Also aggregate by runner-up party
  const partyFlipCosts = new Map<
    string,
    { totalVotes: number; count: number }
  >();
  for (const f of flipCosts) {
    const key = f.runnerUp;
    if (!partyFlipCosts.has(key)) {
      partyFlipCosts.set(key, { totalVotes: 0, count: 0 });
    }
    const agg = partyFlipCosts.get(key)!;
    // Only count "cheap" flips (under 5000 votes)
    if (f.votesToFlip <= 5000) {
      agg.totalVotes += f.votesToFlip;
      agg.count++;
    }
  }

  return (
    <div className="flip-cost-summary">
      <div className="flip-cost-summary__title">
        {tt('stats_flip_thresholds_title')}
      </div>
      <div className="flip-cost-summary__cards">
        {summaryData.map((s) => (
          <div key={s.threshold} className="flip-cost-summary__card">
            <div className="flip-cost-summary__card-value">{s.count}</div>
            <div className="flip-cost-summary__card-label">
              {tt('stats_flip_threshold_label', {
                votes: formatNumber(s.threshold),
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Helper: interpolate a competitiveness color from red (low) to green (high).
 */
function d3InterpolateCompetitiveness(value: number): string {
  // 0 = muted red (blowout), 100 = deep teal (tight race)
  // Newspaper-appropriate palette: desaturated, readable on white
  const t = Math.max(0, Math.min(1, value / 100));
  const r = Math.round(196 - 170 * t); // 196 → 26
  const g = Math.round(80 + 47 * t); // 80  → 127
  const b = Math.round(29 + 26 * t); // 29  → 55
  return `rgb(${r},${g},${b})`;
}

export default StatisticsPage;
