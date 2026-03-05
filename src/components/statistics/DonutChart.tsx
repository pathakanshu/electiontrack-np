/**
 * src/components/statistics/DonutChart.tsx
 *
 * Reusable D3-powered donut/pie chart component.
 * Used across the statistics page for:
 * - Majority vs Plurality wins breakdown
 * - Party seat share distribution
 * - Wasted vote proportions
 * - Gender breakdown or any categorical split
 *
 * Features:
 * - Animated arc entry transitions (clockwise wipe)
 * - Center label for total or key metric
 * - Interactive hover: arc expansion + tooltip
 * - Legend rendered as HTML for better text wrapping
 * - Dark-theme styled to match the app
 * - Responsive via ResizeObserver
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  THEME,
  getTooltip,
  showTooltip,
  hideTooltip,
  formatNumber,
  formatPercent,
  TRANSITION_DURATION,
  EASE,
  observeResize,
  partyColor,
} from './chartHelpers';
import { useTranslation } from '../../i18n';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DonutDatum {
  /** Display label for the segment */
  label: string;
  /** Numeric value (used for arc sizing) */
  value: number;
  /** Optional color override — if not set, auto-assigned from palette */
  color?: string;
  /** Optional tooltip HTML override */
  tooltipHtml?: string;
}

export interface DonutChartProps {
  /** The data slices to render */
  data: DonutDatum[];
  /** Chart title rendered above the donut */
  title?: string;
  /** Text shown in the center of the donut (e.g. total count) */
  centerLabel?: string;
  /** Secondary text below the center label */
  centerSublabel?: string;
  /** Outer radius as a fraction of available space (default 0.42) */
  radiusFraction?: number;
  /** Inner radius as a fraction of outer radius — 0 = pie, 0.6 = donut (default 0.6) */
  innerRadiusFraction?: number;
  /** Whether to show the legend. Default true. */
  showLegend?: boolean;
  /** Whether to show percentage labels on arcs. Default true when <= 8 slices. */
  showArcLabels?: boolean;
  /** Fixed size (width = height). If not set, uses container width. */
  size?: number;
  /** Minimum size to prevent the chart from getting too small */
  minSize?: number;
  /** Optional CSS class */
  className?: string;
  /** Format values as percentages in tooltips */
  valueIsPercent?: boolean;
  /** Corner radius for arc segments (default 3) */
  cornerRadius?: number;
  /** Pad angle between segments in radians (default 0.02) */
  padAngle?: number;
  /** Max legend items to show before collapsing behind "see more". Default 6. */
  maxLegendItems?: number;
  /** Number of legend columns (1 = default flow, 2 = grid). Default 1. */
  legendColumns?: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

const DonutChart: React.FC<DonutChartProps> = ({
  data,
  title,
  centerLabel,
  centerSublabel,
  radiusFraction = 0.42,
  innerRadiusFraction = 0.6,
  showLegend = true,
  showArcLabels,
  size: fixedSize,
  minSize = 200,
  className,
  valueIsPercent = false,
  cornerRadius = 3,
  padAngle = 0.02,
  maxLegendItems = 6,
  legendColumns = 1,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerWidth, setContainerWidth] = useState(fixedSize ?? 360);
  const [legendExpanded, setLegendExpanded] = useState(false);

  // Auto-determine whether to show arc labels
  const shouldShowArcLabels = showArcLabels ?? data.length <= 8;

  // Filter out zero-value entries and compute total
  const filteredData = useMemo(() => data.filter((d) => d.value > 0), [data]);

  const total = useMemo(
    () => filteredData.reduce((sum, d) => sum + d.value, 0),
    [filteredData]
  );

  // Observe container width
  useEffect(() => {
    if (fixedSize || !containerRef.current) return;
    return observeResize(containerRef.current, (w) => {
      if (w > 0) setContainerWidth(w);
    });
  }, [fixedSize]);

  // Main D3 render
  useEffect(() => {
    if (!svgRef.current || filteredData.length === 0) return;

    const chartSize = Math.max(
      minSize,
      fixedSize ?? Math.min(containerWidth, 400)
    );
    const titleOffset = title ? 28 : 0;
    const svgHeight = chartSize + titleOffset;

    const svg = d3
      .select(svgRef.current)
      .attr('width', chartSize)
      .attr('height', svgHeight)
      .style('background', 'transparent');

    // Clear previous
    svg.selectAll('*').remove();

    // Title
    if (title) {
      svg
        .append('text')
        .attr('x', chartSize / 2)
        .attr('y', 18)
        .attr('text-anchor', 'middle')
        .attr('fill', THEME.text)
        .style('font-size', '13px')
        .style('font-weight', '600')
        .text(title);
    }

    // Center group
    const g = svg
      .append('g')
      .attr(
        'transform',
        `translate(${chartSize / 2},${chartSize / 2 + titleOffset})`
      );

    // Dimensions
    const outerRadius = chartSize * radiusFraction;
    const innerRadius = outerRadius * innerRadiusFraction;

    // Color scale
    const colorScale = (i: number): string => {
      if (filteredData[i]?.color) return filteredData[i].color!;
      return partyColor(i);
    };

    // Pie layout
    const pie = d3
      .pie<DonutDatum>()
      .value((d) => d.value)
      .sort(null) // preserve data order
      .padAngle(padAngle);

    const arcs = pie(filteredData);

    // Arc generators
    const arcGenerator = d3
      .arc<d3.PieArcDatum<DonutDatum>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(cornerRadius);

    const arcHoverGenerator = d3
      .arc<d3.PieArcDatum<DonutDatum>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius + 6)
      .cornerRadius(cornerRadius);

    const arcLabelGenerator = d3
      .arc<d3.PieArcDatum<DonutDatum>>()
      .innerRadius((outerRadius + innerRadius) / 2)
      .outerRadius((outerRadius + innerRadius) / 2);

    // Tooltip
    const tooltip = getTooltip();

    // Draw arcs
    const arcPaths = g
      .selectAll<SVGPathElement, d3.PieArcDatum<DonutDatum>>('.arc')
      .data(arcs)
      .join('path')
      .attr('class', 'arc')
      .attr('fill', (_, i) => colorScale(i))
      .attr('stroke', THEME.cardBg)
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event: MouseEvent, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arcHoverGenerator as any);

        const pct = total > 0 ? (d.data.value / total) * 100 : 0;
        const html =
          d.data.tooltipHtml ??
          `<strong>${d.data.label}</strong><br/>` +
            `${valueIsPercent ? formatPercent(d.data.value) : formatNumber(d.data.value)}` +
            `${!valueIsPercent ? ` (${formatPercent(pct)})` : ''}`;
        showTooltip(tooltip, html, event);
      })
      .on('mousemove', function (event: MouseEvent, d) {
        const pct = total > 0 ? (d.data.value / total) * 100 : 0;
        const html =
          d.data.tooltipHtml ??
          `<strong>${d.data.label}</strong><br/>` +
            `${valueIsPercent ? formatPercent(d.data.value) : formatNumber(d.data.value)}` +
            `${!valueIsPercent ? ` (${formatPercent(pct)})` : ''}`;
        showTooltip(tooltip, html, event);
      })
      .on('mouseleave', function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arcGenerator as any);
        hideTooltip(tooltip);
      });

    // Animated entry: clockwise wipe using attrTween on the arc path
    arcPaths.each(function (d, i) {
      const path = d3.select(this);
      const interpolate = d3.interpolate(
        { startAngle: d.startAngle, endAngle: d.startAngle },
        { startAngle: d.startAngle, endAngle: d.endAngle }
      );

      path
        .attr('d', arcGenerator({ ...d, endAngle: d.startAngle } as any))
        .transition()
        .duration(TRANSITION_DURATION)
        .ease(EASE)
        .delay(i * 60)
        .attrTween('d', function () {
          return (t: number) => {
            const interpolated = interpolate(t);
            return arcGenerator({
              ...d,
              startAngle: interpolated.startAngle,
              endAngle: interpolated.endAngle,
            } as any) as string;
          };
        });
    });

    // Arc percentage labels
    if (shouldShowArcLabels) {
      g.selectAll<SVGTextElement, d3.PieArcDatum<DonutDatum>>('.arc-label')
        .data(arcs)
        .join('text')
        .attr('class', 'arc-label')
        .attr('transform', (d) => {
          const centroid = arcLabelGenerator.centroid(d);
          return `translate(${centroid})`;
        })
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .style('font-size', '10px')
        .style('font-weight', '600')
        .style('pointer-events', 'none')
        .style('text-shadow', '0 1px 3px rgba(0,0,0,0.7)')
        .style('opacity', 0)
        .text((d) => {
          const pct = total > 0 ? (d.data.value / total) * 100 : 0;
          // Only show label if the arc is big enough (> 5%)
          return pct >= 5 ? `${Math.round(pct)}%` : '';
        })
        .transition()
        .duration(TRANSITION_DURATION)
        .delay((_, i) => i * 60 + 300)
        .ease(EASE)
        .style('opacity', 1);
    }

    // Center label
    if (centerLabel) {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', centerSublabel ? '-0.2em' : '0.1em')
        .attr('fill', THEME.text)
        .style('font-size', innerRadius > 50 ? '22px' : '16px')
        .style('font-weight', '700')
        .style('font-variant-numeric', 'tabular-nums')
        .text(centerLabel);
    }

    if (centerSublabel) {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .attr('fill', THEME.textMuted)
        .style('font-size', '11px')
        .text(centerSublabel);
    }
  }, [
    filteredData,
    total,
    containerWidth,
    fixedSize,
    minSize,
    title,
    centerLabel,
    centerSublabel,
    radiusFraction,
    innerRadiusFraction,
    shouldShowArcLabels,
    valueIsPercent,
    cornerRadius,
    padAngle,
  ]);

  return (
    <div
      ref={containerRef}
      className={`donut-chart-wrapper${className ? ` ${className}` : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        width: '100%',
      }}
    >
      <svg ref={svgRef} />

      {/* HTML-based legend for better text wrapping & accessibility */}
      {showLegend &&
        filteredData.length > 0 &&
        (() => {
          const needsCollapse = filteredData.length > maxLegendItems;
          const visibleItems =
            needsCollapse && !legendExpanded
              ? filteredData.slice(0, maxLegendItems)
              : filteredData;

          return (
            <div
              className={`donut-legend${legendColumns > 1 ? ' donut-legend--grid' : ''}`}
            >
              {visibleItems.map((d, i) => {
                const pct = total > 0 ? (d.value / total) * 100 : 0;
                return (
                  <div key={d.label} className="donut-legend__item">
                    <span
                      className="donut-legend__swatch"
                      style={{
                        backgroundColor: d.color ?? partyColor(i),
                      }}
                    />
                    <span className="donut-legend__label">{d.label}</span>
                    <span className="donut-legend__value">
                      {valueIsPercent
                        ? formatPercent(d.value)
                        : formatNumber(d.value)}
                      {!valueIsPercent && (
                        <span className="donut-legend__pct">
                          {' '}
                          ({formatPercent(pct)})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
              {needsCollapse && (
                <button
                  className="donut-legend__toggle"
                  onClick={() => setLegendExpanded((v) => !v)}
                >
                  {legendExpanded
                    ? t('legend_show_less')
                    : t('legend_show_more')}
                </button>
              )}
            </div>
          );
        })()}
    </div>
  );
};

export default DonutChart;
