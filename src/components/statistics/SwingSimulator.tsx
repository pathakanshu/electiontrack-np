/**
 * src/components/statistics/SwingSimulator.tsx
 *
 * Interactive Uniform National Swing simulator.
 * Allows users to select a party and apply a percentage-point swing,
 * then see the projected seat changes rendered with D3.
 *
 * Features:
 * - Party selector dropdown (top 10 parties by seats won)
 * - Swing slider from -10% to +10% with +1/+3/+5 preset buttons
 * - Animated D3 bar chart showing current vs projected seats
 * - List of constituencies that would flip
 * - Summary stat cards (seats gained/lost, total projected)
 * - Dark-theme styled to match the app
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import * as d3 from 'd3';
import {
  THEME,
  getTooltip,
  showTooltip,
  hideTooltip,
  formatNumber,
  formatSigned,
  formatConstituencyLabel,
  displayPartyName,
  observeResize,
  TRANSITION_DURATION,
  EASE,
} from './chartHelpers';
import { useLanguage } from '../../i18n';
import type { SwingSimulationResult } from '../../utils/statistics';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SwingSimulatorProps {
  /** Top parties available for simulation */
  topParties: { party: string; partyEn: string | null; seats: number }[];
  /** Callback to run the swing simulation */
  onSimulate: (
    party: string,
    swingPercent: number
  ) => SwingSimulationResult | null;
  /** Callback to run multi-swing (+1, +3, +5) */
  onMultiSwing: (party: string) => SwingSimulationResult[] | null;
  /** Lookup map from constituencyId → districtId, used to label flipped seats */
  constituencyDistrictMap: Map<number, number>;
  /** Optional CSS class */
  className?: string;
}

// ─── Preset buttons ─────────────────────────────────────────────────────────

const PRESETS = [
  { label: '-5%', value: -5 },
  { label: '-3%', value: -3 },
  { label: '-1%', value: -1 },
  { label: '+1%', value: 1 },
  { label: '+3%', value: 3 },
  { label: '+5%', value: 5 },
];

// ─── Component ──────────────────────────────────────────────────────────────

const SwingSimulator: React.FC<SwingSimulatorProps> = ({
  topParties,
  onSimulate,
  onMultiSwing,
  constituencyDistrictMap,
  className,
}) => {
  const { locale } = useLanguage();

  // State
  const [selectedParty, setSelectedParty] = useState<string>(
    topParties[0]?.party ?? ''
  );
  const [swingPercent, setSwingPercent] = useState<number>(3);
  const [result, setResult] = useState<SwingSimulationResult | null>(null);
  const [multiResults, setMultiResults] = useState<
    SwingSimulationResult[] | null
  >(null);
  const [showFlipped, setShowFlipped] = useState(false);

  // Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const multiSvgRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(500);

  // Observe container width
  useEffect(() => {
    if (!chartContainerRef.current) return;
    return observeResize(chartContainerRef.current, (w) => {
      if (w > 0) setChartWidth(w);
    });
  }, []);

  // Run simulation when party or swing changes
  const runSimulation = useCallback(() => {
    if (!selectedParty) return;
    const res = onSimulate(selectedParty, swingPercent);
    setResult(res);

    const multi = onMultiSwing(selectedParty);
    setMultiResults(multi);
  }, [selectedParty, swingPercent, onSimulate, onMultiSwing]);

  // Auto-run on mount and when inputs change
  useEffect(() => {
    runSimulation();
  }, [runSimulation]);

  // Party display name
  const selectedPartyDisplay = useMemo(() => {
    const p = topParties.find((t) => t.party === selectedParty);
    return p ? displayPartyName(p.party, p.partyEn, locale) : selectedParty;
  }, [selectedParty, topParties, locale]);

  // ── D3: Current vs Projected seats bar chart ──
  useEffect(() => {
    if (!svgRef.current || !result) return;

    const margin = { top: 20, right: 40, bottom: 28, left: 110 };
    const barHeight = 36;
    const barGap = 12;
    const totalBarArea = 2 * barHeight + barGap;
    const height = totalBarArea + margin.top + margin.bottom;
    const width = chartWidth;

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .style('background', 'transparent');

    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;

    const maxVal = Math.max(result.currentSeats, result.projectedSeats, 1);

    const xScale = d3
      .scaleLinear()
      .domain([0, maxVal * 1.25])
      .range([0, innerWidth]);

    // Data
    const bars = [
      {
        label: 'Current Seats',
        value: result.currentSeats,
        color: THEME.textMuted,
      },
      {
        label: `Projected (${swingPercent >= 0 ? '+' : ''}${swingPercent}%)`,
        value: result.projectedSeats,
        color:
          result.seatChange > 0
            ? THEME.positive
            : result.seatChange < 0
              ? THEME.negative
              : THEME.neutral,
      },
    ];

    const tooltip = getTooltip();

    // Grid lines
    const ticks = xScale.ticks(5);
    g.append('g')
      .selectAll('line')
      .data(ticks)
      .join('line')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', 0)
      .attr('y2', totalBarArea)
      .attr('stroke', THEME.gridLine)
      .attr('stroke-dasharray', '3,3')
      .attr('stroke-width', 0.5);

    // Bars
    bars.forEach((bar, i) => {
      const y = i * (barHeight + barGap);

      // Label
      g.append('text')
        .attr('x', -8)
        .attr('y', y + barHeight / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .attr('fill', THEME.textSecondary)
        .style('font-size', '12px')
        .text(bar.label);

      // Bar rect
      g.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', 0)
        .attr('height', barHeight)
        .attr('rx', 4)
        .attr('fill', bar.color)
        .attr('opacity', 0.85)
        .on('mouseenter', function (event: MouseEvent) {
          d3.select(this).attr('opacity', 1);
          showTooltip(
            tooltip,
            `<strong>${bar.label}</strong><br/>${bar.value} seats`,
            event
          );
        })
        .on('mousemove', function (event: MouseEvent) {
          showTooltip(
            tooltip,
            `<strong>${bar.label}</strong><br/>${bar.value} seats`,
            event
          );
        })
        .on('mouseleave', function () {
          d3.select(this).attr('opacity', 0.85);
          hideTooltip(tooltip);
        })
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(EASE)
        .attr('width', xScale(bar.value));

      // Value label
      g.append('text')
        .attr('x', 4)
        .attr('y', y + barHeight / 2)
        .attr('dy', '0.35em')
        .attr('fill', THEME.text)
        .style('font-size', '13px')
        .style('font-weight', '700')
        .style('font-variant-numeric', 'tabular-nums')
        .style('opacity', 0)
        .text(bar.value)
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(EASE)
        .delay(200)
        .attr('x', xScale(bar.value) + 8)
        .style('opacity', 1);
    });

    // X axis
    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0,${totalBarArea + 4})`)
      .call(d3.axisBottom(xScale).ticks(5));

    xAxisG.select('.domain').attr('stroke', THEME.axisLine);
    xAxisG.selectAll('.tick line').attr('stroke', THEME.gridLine);
    xAxisG
      .selectAll('.tick text')
      .attr('fill', THEME.textMuted)
      .style('font-size', '10px');
  }, [result, chartWidth, swingPercent]);

  // ── D3: Multi-swing comparison chart (+1, +3, +5) ──
  useEffect(() => {
    if (!multiSvgRef.current || !multiResults || multiResults.length === 0)
      return;

    const margin = { top: 24, right: 50, bottom: 28, left: 52 };
    const barWidth = 48;
    const gap = 24;
    const totalWidth = Math.max(
      chartWidth,
      multiResults.length * (barWidth + gap) + margin.left + margin.right
    );
    const chartInnerHeight = 140;
    const height = chartInnerHeight + margin.top + margin.bottom;

    const svg = d3
      .select(multiSvgRef.current)
      .attr('width', totalWidth)
      .attr('height', height)
      .style('background', 'transparent');

    svg.selectAll('*').remove();

    // Title
    svg
      .append('text')
      .attr('x', 12)
      .attr('y', 16)
      .attr('fill', THEME.text)
      .style('font-size', '12px')
      .style('font-weight', '600')
      .text('Seat Change Under Different Swings');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const innerWidth = totalWidth - margin.left - margin.right;

    // Compute scale
    const maxChange = Math.max(
      1,
      d3.max(multiResults, (d) => Math.abs(d.seatChange)) ?? 1
    );

    const xScale = d3
      .scaleBand<number>()
      .domain(multiResults.map((_, i) => i))
      .range([0, innerWidth])
      .padding(0.4);

    const yScale = d3
      .scaleLinear()
      .domain([-maxChange * 1.3, maxChange * 1.3])
      .range([chartInnerHeight, 0])
      .nice();

    const zeroY = yScale(0);

    // Zero line
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', zeroY)
      .attr('y2', zeroY)
      .attr('stroke', THEME.axisLine)
      .attr('stroke-width', 1);

    // Grid lines
    const yTicks = yScale.ticks(5).filter((t) => t !== 0);
    g.append('g')
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', THEME.gridLine)
      .attr('stroke-dasharray', '3,3')
      .attr('stroke-width', 0.5);

    // Y axis
    const yAxisG = g.append('g').call(
      d3
        .axisLeft(yScale)
        .ticks(5)
        .tickFormat((d) => ((d as number) >= 0 ? '+' : '') + d)
    );
    yAxisG.select('.domain').attr('stroke', THEME.axisLine);
    yAxisG.selectAll('.tick line').attr('stroke', 'none');
    yAxisG
      .selectAll('.tick text')
      .attr('fill', THEME.textMuted)
      .style('font-size', '10px');

    const tooltip = getTooltip();

    // Bars
    multiResults.forEach((res, i) => {
      const x = xScale(i)!;
      const barW = xScale.bandwidth();
      const change = res.seatChange;
      const barColor =
        change > 0
          ? THEME.positive
          : change < 0
            ? THEME.negative
            : THEME.textMuted;

      const y = change >= 0 ? yScale(change) : zeroY;
      const h = Math.abs(yScale(change) - zeroY);

      g.append('rect')
        .attr('x', x)
        .attr('y', zeroY)
        .attr('width', barW)
        .attr('height', 0)
        .attr('rx', 3)
        .attr('fill', barColor)
        .attr('opacity', 0.85)
        .on('mouseenter', function (event: MouseEvent) {
          d3.select(this).attr('opacity', 1);
          showTooltip(
            tooltip,
            `<strong>${res.swingPercent >= 0 ? '+' : ''}${res.swingPercent}% swing</strong><br/>` +
              `${res.projectedSeats} projected seats<br/>` +
              `<span style="color:${barColor}">${change >= 0 ? '+' : ''}${change} seats</span><br/>` +
              `${res.flippedConstituencies.length} constituencies flip`,
            event
          );
        })
        .on('mousemove', function (event: MouseEvent) {
          showTooltip(
            tooltip,
            `<strong>${res.swingPercent >= 0 ? '+' : ''}${res.swingPercent}% swing</strong><br/>` +
              `${res.projectedSeats} projected seats<br/>` +
              `<span style="color:${barColor}">${change >= 0 ? '+' : ''}${change} seats</span><br/>` +
              `${res.flippedConstituencies.length} constituencies flip`,
            event
          );
        })
        .on('mouseleave', function () {
          d3.select(this).attr('opacity', 0.85);
          hideTooltip(tooltip);
        })
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(EASE)
        .delay(i * 80)
        .attr('y', y)
        .attr('height', h);

      // Value label above/below bar
      g.append('text')
        .attr('x', x + barW / 2)
        .attr('y', zeroY)
        .attr('text-anchor', 'middle')
        .attr('fill', barColor)
        .style('font-size', '12px')
        .style('font-weight', '700')
        .style('font-variant-numeric', 'tabular-nums')
        .style('opacity', 0)
        .text((change >= 0 ? '+' : '') + change)
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(EASE)
        .delay(i * 80 + 200)
        .attr('y', change >= 0 ? yScale(change) - 6 : yScale(change) + 16)
        .style('opacity', 1);

      // X label
      g.append('text')
        .attr('x', x + barW / 2)
        .attr('y', chartInnerHeight + 16)
        .attr('text-anchor', 'middle')
        .attr('fill', THEME.textSecondary)
        .style('font-size', '11px')
        .style('font-weight', '600')
        .text((res.swingPercent >= 0 ? '+' : '') + res.swingPercent + '%');
    });
  }, [multiResults, chartWidth]);

  // ── Empty state ──
  if (topParties.length === 0) {
    return (
      <div className={`swing-simulator${className ? ` ${className}` : ''}`}>
        <p style={{ color: THEME.textMuted, fontStyle: 'italic' }}>
          No party data available for simulation.
        </p>
      </div>
    );
  }

  return (
    <div className={`swing-simulator${className ? ` ${className}` : ''}`}>
      {/* ── Controls ── */}
      <div className="swing-sim__controls">
        {/* Party selector */}
        <div className="swing-sim__control-group">
          <label className="swing-sim__label" htmlFor="swing-party-select">
            Party
          </label>
          <select
            id="swing-party-select"
            className="swing-sim__select"
            value={selectedParty}
            onChange={(e) => setSelectedParty(e.target.value)}
          >
            {topParties.map((p) => (
              <option key={p.party} value={p.party}>
                {displayPartyName(p.party, p.partyEn, locale)} ({p.seats} seats)
              </option>
            ))}
          </select>
        </div>

        {/* Swing slider */}
        <div className="swing-sim__control-group">
          <label className="swing-sim__label" htmlFor="swing-slider">
            Swing:{' '}
            <span
              style={{
                color:
                  swingPercent > 0
                    ? THEME.positive
                    : swingPercent < 0
                      ? THEME.negative
                      : THEME.text,
                fontWeight: 700,
              }}
            >
              {swingPercent >= 0 ? '+' : ''}
              {swingPercent}%
            </span>
          </label>
          <input
            id="swing-slider"
            type="range"
            className="swing-sim__slider"
            min={-10}
            max={10}
            step={0.5}
            value={swingPercent}
            onChange={(e) => setSwingPercent(parseFloat(e.target.value))}
          />

          {/* Preset buttons */}
          <div className="swing-sim__presets">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                className={`swing-sim__preset-btn${swingPercent === p.value ? ' swing-sim__preset-btn--active' : ''}`}
                onClick={() => setSwingPercent(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Result Summary Cards ── */}
      {result && (
        <div className="swing-sim__summary">
          <div className="swing-sim__summary-card">
            <div className="swing-sim__summary-label">Current Seats</div>
            <div className="swing-sim__summary-value">
              {result.currentSeats}
            </div>
          </div>
          <div className="swing-sim__summary-card">
            <div className="swing-sim__summary-label">Projected Seats</div>
            <div
              className="swing-sim__summary-value"
              style={{
                color:
                  result.seatChange > 0
                    ? THEME.positive
                    : result.seatChange < 0
                      ? THEME.negative
                      : THEME.text,
              }}
            >
              {result.projectedSeats}
            </div>
          </div>
          <div className="swing-sim__summary-card">
            <div className="swing-sim__summary-label">Seat Change</div>
            <div
              className="swing-sim__summary-value"
              style={{
                color:
                  result.seatChange > 0
                    ? THEME.positive
                    : result.seatChange < 0
                      ? THEME.negative
                      : THEME.text,
              }}
            >
              {result.seatChange >= 0 ? '+' : ''}
              {result.seatChange}
            </div>
          </div>
          <div className="swing-sim__summary-card">
            <div className="swing-sim__summary-label">Flipped Seats</div>
            <div
              className="swing-sim__summary-value"
              style={{ color: THEME.accent }}
            >
              {result.flippedConstituencies.length}
            </div>
          </div>
        </div>
      )}

      {/* ── Charts ── */}
      <div ref={chartContainerRef} className="swing-sim__charts">
        {/* Current vs Projected */}
        <svg ref={svgRef} />

        {/* Multi-swing comparison */}
        {multiResults && multiResults.length > 0 && (
          <svg ref={multiSvgRef} style={{ marginTop: '1rem' }} />
        )}
      </div>

      {/* ── Flipped Constituencies List ── */}
      {result && result.flippedConstituencies.length > 0 && (
        <div className="swing-sim__flipped">
          <button
            className="swing-sim__toggle-btn"
            onClick={() => setShowFlipped(!showFlipped)}
          >
            {showFlipped ? '▾ Hide' : '▸ Show'}{' '}
            {result.flippedConstituencies.length} flipped
            {result.flippedConstituencies.length === 1
              ? ' constituency'
              : ' constituencies'}
          </button>

          {showFlipped && (
            <div className="swing-sim__flipped-list">
              {result.flippedConstituencies.map((cId) => {
                const districtId = constituencyDistrictMap.get(cId) ?? cId;
                return (
                  <span key={cId} className="swing-sim__flipped-tag">
                    {formatConstituencyLabel(cId, districtId, locale)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Explanation ── */}
      <p className="swing-sim__explainer">
        <strong>How this works:</strong> A Uniform National Swing shifts the
        selected party's vote share by the specified percentage points in every
        constituency. Votes are redistributed proportionally among all other
        parties. This is a simplified model — real swings are rarely uniform —
        but it reveals which seats are most sensitive to national trends.
      </p>
    </div>
  );
};

export default SwingSimulator;
