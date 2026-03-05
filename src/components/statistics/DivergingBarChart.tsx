/**
 * src/components/statistics/DivergingBarChart.tsx
 *
 * D3-powered diverging (butterfly) bar chart component.
 * Bars extend left or right from a center axis based on whether
 * values are negative or positive.
 *
 * Used across the statistics page for:
 * - Seat–Vote Gap: shows which parties are over/under-represented
 * - Swing Analysis: shows vote share change per party (+/-)
 * - Incumbent vote share change
 * - Turnout change between elections
 *
 * Features:
 * - Center zero-line with bars extending in both directions
 * - Animated entry transitions (bars grow from center)
 * - Color-coded positive (green/blue) vs negative (red) bars
 * - Interactive tooltips on hover
 * - Responsive width via ResizeObserver
 * - Dark-theme styled to match the app
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  THEME,
  setupSvg,
  styleAxis,
  getTooltip,
  showTooltip,
  hideTooltip,
  TRANSITION_DURATION,
  EASE,
  observeResize,
  formatPercent,
  formatNumber,
  formatSigned,
  type ChartMargin,
} from './chartHelpers';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DivergingDatum {
  /** Display label for the bar (y-axis) */
  label: string;
  /** Numeric value — negative extends left, positive extends right */
  value: number;
  /** Optional color override. If not set, auto-colored by sign. */
  color?: string;
  /** Optional tooltip HTML override */
  tooltipHtml?: string;
  /** Optional secondary annotation text */
  annotation?: string;
}

export interface DivergingBarChartProps {
  /** The data to render */
  data: DivergingDatum[];
  /** Chart title rendered inside the SVG */
  title?: string;
  /** Whether values represent percentages (affects formatting) */
  valueIsPercent?: boolean;
  /** Fixed chart height. If not set, auto-calculated from data length. */
  height?: number;
  /** Bar height in pixels (default 26) */
  barHeight?: number;
  /** Gap between bars in pixels (default 5) */
  barGap?: number;
  /** Custom margin overrides */
  margin?: Partial<ChartMargin>;
  /** X-axis label (e.g. "Swing %") */
  xLabel?: string;
  /** Symmetric x-axis domain max. If not set, derived from data. */
  xMax?: number;
  /** Color for positive (right) bars. Default: THEME.positive */
  positiveColor?: string;
  /** Color for negative (left) bars. Default: THEME.negative */
  negativeColor?: string;
  /** Whether to show value labels at end of each bar. Default true. */
  showValues?: boolean;
  /** Sort: 'asc' (most negative first), 'desc' (most positive first),
   *  'abs-desc' (largest magnitude first), 'none'. Default 'desc'. */
  sort?: 'asc' | 'desc' | 'abs-desc' | 'none';
  /** Optional CSS class on the wrapper div */
  className?: string;
  /** Zero line label (e.g. "0%"). Default: none. */
  zeroLabel?: string;
  /** Maximum number of bars to display (truncate the rest). Default: all. */
  maxBars?: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

const DivergingBarChart: React.FC<DivergingBarChartProps> = ({
  data,
  title,
  valueIsPercent = true,
  height: fixedHeight,
  barHeight = 26,
  barGap = 5,
  margin: marginOverride,
  xLabel,
  xMax: xMaxOverride,
  positiveColor = THEME.positive,
  negativeColor = THEME.negative,
  showValues = true,
  sort = 'desc',
  className,
  zeroLabel,
  maxBars,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);

  // Sort and optionally truncate data
  const processedData = useMemo(() => {
    let sorted: DivergingDatum[];
    switch (sort) {
      case 'asc':
        sorted = [...data].sort((a, b) => a.value - b.value);
        break;
      case 'desc':
        sorted = [...data].sort((a, b) => b.value - a.value);
        break;
      case 'abs-desc':
        sorted = [...data].sort(
          (a, b) => Math.abs(b.value) - Math.abs(a.value)
        );
        break;
      default:
        sorted = [...data];
    }
    if (maxBars && sorted.length > maxBars) {
      sorted = sorted.slice(0, maxBars);
    }
    return sorted;
  }, [data, sort, maxBars]);

  // Observe container width for responsiveness
  useEffect(() => {
    if (!containerRef.current) return;
    return observeResize(containerRef.current, (w) => {
      if (w > 0) setWidth(w);
    });
  }, []);

  // Main D3 render effect
  useEffect(() => {
    if (!svgRef.current || processedData.length === 0) return;

    // ── Compute label width ──
    const tempSvg = d3.select(svgRef.current);
    let maxLabelWidth = 60;
    const tempGroup = tempSvg.append('g').attr('class', 'temp-measure');
    processedData.forEach((d) => {
      const text = tempGroup
        .append('text')
        .style('font-size', '11px')
        .text(d.label);
      const bbox = (text.node() as SVGTextElement).getBBox();
      if (bbox.width > maxLabelWidth) maxLabelWidth = bbox.width;
    });
    tempGroup.remove();

    // ── Margins ──
    const margin: ChartMargin = {
      top: title ? 36 : 16,
      right: showValues ? 64 : 24,
      bottom: xLabel ? 40 : 24,
      left: Math.min(maxLabelWidth + 16, width * 0.35),
      ...marginOverride,
    };

    const totalBarArea =
      processedData.length * (barHeight + barGap) - barGap;
    const chartHeight =
      fixedHeight ?? totalBarArea + margin.top + margin.bottom;

    const { svg, g, innerWidth, innerHeight } = setupSvg(
      svgRef.current,
      width,
      chartHeight,
      margin
    );

    // ── Title ──
    if (title) {
      svg
        .append('text')
        .attr('x', 16)
        .attr('y', 22)
        .attr('fill', THEME.text)
        .style('font-size', '13px')
        .style('font-weight', '600')
        .text(title);
    }

    // ── Scales ──
    const absMax =
      xMaxOverride ??
      Math.max(
        1,
        d3.max(processedData, (d) => Math.abs(d.value)) ?? 1
      ) * 1.2;

    const xScale = d3
      .scaleLinear()
      .domain([-absMax, absMax])
      .range([0, innerWidth])
      .nice();

    const yScale = d3
      .scaleBand<number>()
      .domain(processedData.map((_, i) => i))
      .range([0, totalBarArea])
      .padding(barGap / (barHeight + barGap));

    const zeroX = xScale(0);

    // ── Grid lines ──
    const xTicks = xScale.ticks(8);
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(xTicks.filter((t) => t !== 0))
      .join('line')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', -4)
      .attr('y2', totalBarArea + 4)
      .attr('stroke', THEME.gridLine)
      .attr('stroke-dasharray', '3,3')
      .attr('stroke-width', 0.5);

    // ── Zero line (emphasized) ──
    g.append('line')
      .attr('x1', zeroX)
      .attr('x2', zeroX)
      .attr('y1', -4)
      .attr('y2', totalBarArea + 4)
      .attr('stroke', THEME.axisLine)
      .attr('stroke-width', 1.5);

    if (zeroLabel) {
      g.append('text')
        .attr('x', zeroX)
        .attr('y', -8)
        .attr('text-anchor', 'middle')
        .attr('fill', THEME.textMuted)
        .style('font-size', '10px')
        .text(zeroLabel);
    }

    // ── X Axis ──
    const xAxisGroup = g
      .append('g')
      .attr('transform', `translate(0,${totalBarArea + 4})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(8)
          .tickFormat((d) => {
            const num = d as number;
            if (valueIsPercent) {
              return (num >= 0 ? '+' : '') + d3.format('.0f')(num) + '%';
            }
            return formatNumber(num);
          })
      );
    styleAxis(xAxisGroup, { hideAxisLine: true });

    if (xLabel) {
      g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', totalBarArea + 36)
        .attr('text-anchor', 'middle')
        .attr('fill', THEME.textMuted)
        .style('font-size', '11px')
        .text(xLabel);
    }

    // ── Tooltip ──
    const tooltip = getTooltip();

    // ── Bar groups ──
    const barGroups = g
      .selectAll<SVGGElement, DivergingDatum>('.div-bar-group')
      .data(processedData, (_, i) => i.toString())
      .join('g')
      .attr('class', 'div-bar-group')
      .attr('transform', (_, i) => `translate(0,${yScale(i)})`);

    // Label text (left side, right-aligned to the label area)
    barGroups
      .append('text')
      .attr('x', -8)
      .attr('y', yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', THEME.textSecondary)
      .style('font-size', '11px')
      .text((d) => d.label);

    // Bar rects — grow from the zero line
    barGroups
      .append('rect')
      .attr('y', 0)
      .attr('height', yScale.bandwidth())
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', (d) => {
        if (d.color) return d.color;
        return d.value >= 0 ? positiveColor : negativeColor;
      })
      .attr('opacity', 0.85)
      // Start all bars at zero-width at the zero line
      .attr('x', zeroX)
      .attr('width', 0)
      .on('mouseenter', function (event: MouseEvent, d: DivergingDatum) {
        d3.select(this).attr('opacity', 1);
        const html =
          d.tooltipHtml ??
          `<strong>${d.label}</strong><br/>` +
            `${valueIsPercent ? formatSigned(d.value) : (d.value >= 0 ? '+' : '') + formatNumber(d.value)}` +
            (d.annotation ? `<br/><span style="color:${THEME.textMuted}">${d.annotation}</span>` : '');
        showTooltip(tooltip, html, event);
      })
      .on('mousemove', function (event: MouseEvent, d: DivergingDatum) {
        const html =
          d.tooltipHtml ??
          `<strong>${d.label}</strong><br/>` +
            `${valueIsPercent ? formatSigned(d.value) : (d.value >= 0 ? '+' : '') + formatNumber(d.value)}` +
            (d.annotation ? `<br/><span style="color:${THEME.textMuted}">${d.annotation}</span>` : '');
        showTooltip(tooltip, html, event);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 0.85);
        hideTooltip(tooltip);
      })
      // Animate: grow from zero line to final position
      .transition()
      .duration(TRANSITION_DURATION)
      .ease(EASE)
      .delay((_, i) => i * 30)
      .attr('x', (d) => (d.value >= 0 ? zeroX : xScale(d.value)))
      .attr('width', (d) => Math.abs(xScale(d.value) - zeroX));

    // ── Value labels ──
    if (showValues) {
      barGroups
        .append('text')
        .attr('class', 'div-bar-value')
        .attr('y', yScale.bandwidth() / 2)
        .attr('dy', '0.35em')
        .attr('fill', (d) => {
          if (d.color) return d.color;
          return d.value >= 0 ? positiveColor : negativeColor;
        })
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('font-variant-numeric', 'tabular-nums')
        .style('opacity', 0)
        // Position: positive values go to the right end, negative to the left
        .attr('x', zeroX)
        .attr('text-anchor', (d) => (d.value >= 0 ? 'start' : 'end'))
        .text((d) => {
          if (d.annotation) return d.annotation;
          return valueIsPercent
            ? formatSigned(d.value)
            : (d.value >= 0 ? '+' : '') + formatNumber(d.value);
        })
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(EASE)
        .delay((_, i) => i * 30 + 200)
        .attr('x', (d) => {
          if (d.value >= 0) {
            return xScale(d.value) + 6;
          } else {
            return xScale(d.value) - 6;
          }
        })
        .style('opacity', 1);
    }
  }, [
    processedData,
    width,
    title,
    valueIsPercent,
    fixedHeight,
    barHeight,
    barGap,
    marginOverride,
    xLabel,
    xMaxOverride,
    positiveColor,
    negativeColor,
    showValues,
    zeroLabel,
  ]);

  // ── Empty state ──
  if (processedData.length === 0) {
    return (
      <div
        className={`diverging-bar-chart-container${className ? ` ${className}` : ''}`}
        style={{
          width: '100%',
          padding: '2rem',
          textAlign: 'center',
          color: THEME.textMuted,
          fontSize: '0.85rem',
        }}
      >
        {title && (
          <div
            style={{
              fontWeight: 600,
              color: THEME.text,
              marginBottom: '0.5rem',
              fontSize: '13px',
            }}
          >
            {title}
          </div>
        )}
        No data available for this chart.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`diverging-bar-chart-container${className ? ` ${className}` : ''}`}
      style={{ width: '100%', overflowX: 'auto' }}
    >
      <svg ref={svgRef} />
      {maxBars && data.length > maxBars && (
        <div
          style={{
            textAlign: 'center',
            color: THEME.textMuted,
            fontSize: '0.75rem',
            marginTop: '0.25rem',
            fontStyle: 'italic',
          }}
        >
          Showing top {maxBars} of {data.length} entries
        </div>
      )}
    </div>
  );
};

export default DivergingBarChart;
