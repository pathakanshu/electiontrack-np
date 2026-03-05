/**
 * src/components/statistics/BarChart.tsx
 *
 * Reusable D3-powered horizontal bar chart component.
 * Used across the statistics page for:
 * - Narrowest 10 seats (by margin %)
 * - Safest 10 seats (by margin %)
 * - Party seat/vote comparisons
 * - Flip cost rankings
 * - Any ranked list with a numeric value
 *
 * Features:
 * - Animated entry transitions
 * - Dark-theme styled with the app's color palette
 * - Interactive tooltips on hover
 * - Responsive width via ResizeObserver
 * - Optional color-coding per bar (e.g. by party color)
 */

import React, { useRef, useEffect, useState } from 'react';
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
  type ChartMargin,
} from './chartHelpers';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BarDatum {
  /** Display label for the bar (y-axis) */
  label: string;
  /** Numeric value for the bar length (x-axis) */
  value: number;
  /** Optional bar color override (defaults to accent gold) */
  color?: string;
  /** Optional tooltip HTML — if not provided, a default is generated */
  tooltipHtml?: string;
  /** Optional secondary value shown as text at end of bar */
  annotation?: string;
}

export interface BarChartProps {
  /** The data to render */
  data: BarDatum[];
  /** Chart title rendered inside the SVG */
  title?: string;
  /** Whether to format values as percentages */
  valueIsPercent?: boolean;
  /** Fixed chart height. If not set, auto-calculated from data length. */
  height?: number;
  /** Bar height in pixels (default 28) */
  barHeight?: number;
  /** Gap between bars in pixels (default 6) */
  barGap?: number;
  /** Custom margin overrides */
  margin?: Partial<ChartMargin>;
  /** X-axis label (e.g. "Margin %") */
  xLabel?: string;
  /** Maximum x value — if not set, derived from data */
  xMax?: number;
  /** Sort order: 'asc' | 'desc' | 'none'. Default 'none' (use data order). */
  sort?: 'asc' | 'desc' | 'none';
  /** Default bar color when datum.color is not set */
  defaultColor?: string;
  /** Show value labels at end of each bar */
  showValues?: boolean;
  /** Optional CSS class on the wrapper div */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

const BarChart: React.FC<BarChartProps> = ({
  data,
  title,
  valueIsPercent = false,
  height: fixedHeight,
  barHeight = 28,
  barGap = 6,
  margin: marginOverride,
  xLabel,
  xMax: xMaxOverride,
  sort = 'none',
  defaultColor = THEME.accent,
  showValues = true,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);

  // Sort data if requested
  const sortedData = React.useMemo(() => {
    if (sort === 'none') return data;
    const copy = [...data];
    if (sort === 'asc') copy.sort((a, b) => a.value - b.value);
    else copy.sort((a, b) => b.value - a.value);
    return copy;
  }, [data, sort]);

  // Observe container width for responsiveness
  useEffect(() => {
    if (!containerRef.current) return;
    return observeResize(containerRef.current, (w) => {
      if (w > 0) setWidth(w);
    });
  }, []);

  // Main D3 render effect
  useEffect(() => {
    if (!svgRef.current || sortedData.length === 0) return;

    const margin: ChartMargin = {
      top: title ? 32 : 12,
      right: showValues ? 72 : 24,
      bottom: xLabel ? 36 : 20,
      left: 0, // We'll compute this dynamically
      ...marginOverride,
    };

    // Compute left margin from label text widths
    const tempSvg = d3.select(svgRef.current);
    let maxLabelWidth = 80;

    // Quick measurement: create temporary text elements
    const tempGroup = tempSvg.append('g').attr('class', 'temp-measure');
    sortedData.forEach((d) => {
      const text = tempGroup
        .append('text')
        .style('font-size', '11px')
        .text(d.label);
      const bbox = (text.node() as SVGTextElement).getBBox();
      if (bbox.width > maxLabelWidth) maxLabelWidth = bbox.width;
    });
    tempGroup.remove();

    margin.left = Math.min(maxLabelWidth + 16, width * 0.4);

    const chartHeight =
      fixedHeight ??
      sortedData.length * (barHeight + barGap) +
        margin.top +
        margin.bottom;

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
        .attr('y', 20)
        .attr('fill', THEME.text)
        .style('font-size', '13px')
        .style('font-weight', '600')
        .text(title);
    }

    // ── Scales ──
    const dataMax = d3.max(sortedData, (d) => d.value) ?? 0;
    const xMax = xMaxOverride ?? dataMax * 1.15;

    const xScale = d3
      .scaleLinear()
      .domain([0, xMax])
      .range([0, innerWidth])
      .nice();

    const yScale = d3
      .scaleBand<number>()
      .domain(sortedData.map((_, i) => i))
      .range([0, sortedData.length * (barHeight + barGap)])
      .padding(barGap / (barHeight + barGap));

    // ── Grid lines ──
    const xTicks = xScale.ticks(5);
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(xTicks)
      .join('line')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', 0)
      .attr('y2', sortedData.length * (barHeight + barGap))
      .attr('stroke', THEME.gridLine)
      .attr('stroke-dasharray', '3,3')
      .attr('stroke-width', 0.5);

    // ── X Axis ──
    const xAxisGroup = g
      .append('g')
      .attr(
        'transform',
        `translate(0,${sortedData.length * (barHeight + barGap)})`
      )
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickFormat((d) =>
            valueIsPercent ? `${d}%` : formatNumber(d as number)
          )
      );
    styleAxis(xAxisGroup, { hideAxisLine: true });

    if (xLabel) {
      g.append('text')
        .attr('x', innerWidth / 2)
        .attr(
          'y',
          sortedData.length * (barHeight + barGap) + 32
        )
        .attr('text-anchor', 'middle')
        .attr('fill', THEME.textMuted)
        .style('font-size', '11px')
        .text(xLabel);
    }

    // ── Tooltip ──
    const tooltip = getTooltip();

    // ── Bars ──
    const barGroups = g
      .selectAll<SVGGElement, BarDatum>('.bar-group')
      .data(sortedData, (_, i) => i.toString())
      .join('g')
      .attr('class', 'bar-group')
      .attr('transform', (_, i) => `translate(0,${yScale(i)})`);

    // Label text (left of bar)
    barGroups
      .append('text')
      .attr('x', -8)
      .attr('y', yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', THEME.textSecondary)
      .style('font-size', '11px')
      .text((d) => d.label);

    // Bar rect — starts at width 0 and animates
    barGroups
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('height', yScale.bandwidth())
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', (d) => d.color ?? defaultColor)
      .attr('opacity', 0.85)
      .attr('width', 0) // start at 0 for animation
      .on('mouseenter', function (event: MouseEvent, d: BarDatum) {
        d3.select(this).attr('opacity', 1);
        const html =
          d.tooltipHtml ??
          `<strong>${d.label}</strong><br/>` +
            `${valueIsPercent ? formatPercent(d.value) : formatNumber(d.value)}`;
        showTooltip(tooltip, html, event);
      })
      .on('mousemove', function (event: MouseEvent, d: BarDatum) {
        const html =
          d.tooltipHtml ??
          `<strong>${d.label}</strong><br/>` +
            `${valueIsPercent ? formatPercent(d.value) : formatNumber(d.value)}`;
        showTooltip(tooltip, html, event);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 0.85);
        hideTooltip(tooltip);
      })
      .transition()
      .duration(TRANSITION_DURATION)
      .ease(EASE)
      .delay((_, i) => i * 40)
      .attr('width', (d) => Math.max(0, xScale(d.value)));

    // Value labels at end of bar
    if (showValues) {
      barGroups
        .append('text')
        .attr('class', 'bar-value')
        .attr('y', yScale.bandwidth() / 2)
        .attr('dy', '0.35em')
        .attr('fill', THEME.text)
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('font-variant-numeric', 'tabular-nums')
        .attr('x', 4) // start near 0
        .style('opacity', 0)
        .text((d) =>
          d.annotation ??
          (valueIsPercent ? formatPercent(d.value) : formatNumber(d.value))
        )
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(EASE)
        .delay((_, i) => i * 40 + 200)
        .attr('x', (d) => xScale(d.value) + 6)
        .style('opacity', 1);
    }
  }, [
    sortedData,
    width,
    title,
    valueIsPercent,
    fixedHeight,
    barHeight,
    barGap,
    marginOverride,
    xLabel,
    xMaxOverride,
    defaultColor,
    showValues,
  ]);

  return (
    <div
      ref={containerRef}
      className={`bar-chart-container${className ? ` ${className}` : ''}`}
      style={{ width: '100%', overflowX: 'auto' }}
    >
      <svg ref={svgRef} />
    </div>
  );
};

export default BarChart;
