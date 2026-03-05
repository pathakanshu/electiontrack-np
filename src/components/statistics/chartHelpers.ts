/**
 * src/components/statistics/chartHelpers.ts
 *
 * Shared D3 chart utilities for consistent styling, formatting, and layout
 * across all statistics visualizations.
 *
 * These helpers enforce the dark-theme aesthetic of the app and provide
 * common formatting functions so each chart doesn't reinvent the wheel.
 */

import * as d3 from 'd3';
import en from '../../i18n/en';
import np from '../../i18n/np';
import type { Locale } from '../../i18n';

// ─── Color Palette ──────────────────────────────────────────────────────────

/** Light theme colors — NYT-inspired newspaper palette. */
export const THEME = {
  bg: '#ffffff',
  cardBg: '#f9f9f7',
  surface: '#f9f9f7',
  surfaceHover: '#f0f0ed',
  border: '#e0e0dc',
  text: '#121212',
  textSecondary: '#555555',
  textMuted: '#999999',
  accent: '#121212',
  accentDim: 'rgba(18, 18, 18, 0.06)',
  positive: '#1a7f37',
  negative: '#c41d1d',
  neutral: '#326891',
  gridLine: '#e8e8e4',
  axisLine: '#c8c8c4',
  tooltipBg: 'rgba(255, 255, 255, 0.97)',
  tooltipBorder: '#d0d0cd',
} as const;

/**
 * A curated categorical palette for up to 12 parties.
 * Beyond that, falls back to d3.schemeTableau10 cycling.
 */
export const PARTY_PALETTE = [
  '#d62728', // UML / communist red
  '#2ca02c', // Congress green
  '#8b0000', // Maoist deep red
  '#1f77b4', // RSP blue
  '#b8860b', // RPP gold
  '#e377c2', // Forum pink
  '#7b4fae', // Nagarik purple
  '#d35400', // Janmat orange
  '#17becf', // JSP teal
  '#8c564b', // Unified Socialist
  '#8fae1b', // Loktantrik
  '#a52a2a', // Majdur Kisan
];

/**
 * Get a color for a party index, cycling through palette then d3 fallback.
 */
export function partyColor(index: number): string {
  if (index < PARTY_PALETTE.length) return PARTY_PALETTE[index];
  const fallback = d3.schemeTableau10;
  return fallback[index % fallback.length];
}

// ─── Number Formatting ──────────────────────────────────────────────────────

/** Format large numbers with commas: 1234567 → "1,234,567" */
export const formatNumber = d3.format(',');

/** Format percentages to 1 decimal: 45.678 → "45.7%" */
export const formatPercent = (v: number) => d3.format('.1f')(v) + '%';

/** Format percentages to 2 decimals: 45.678 → "45.68%" */
export const formatPercentPrecise = (v: number) => d3.format('.2f')(v) + '%';

/** Compact number format: 1200000 → "1.2M" */
export const formatCompact = d3.format('.3~s');

/** Signed number with + prefix: +3.2%, -1.5% */
export const formatSigned = (v: number) =>
  (v >= 0 ? '+' : '') + d3.format('.1f')(v) + '%';

/** Format vote counts in a human-friendly way */
export function formatVotes(n: number): string {
  if (n >= 1_000_000) return d3.format('.2~s')(n);
  if (n >= 10_000) return d3.format('.3~s')(n);
  return formatNumber(n);
}

// ─── Constituency label ─────────────────────────────────────────────────────

/**
 * Look up the English district name from the i18n dictionary.
 * Falls back to "District {id}" if not found.
 */
function getDistrictName(districtId: number, locale: Locale = 'en'): string {
  const dict = locale === 'np' ? np : en;
  const key = `district_${districtId}`;
  return (
    (dict as Record<string, string>)[key] ??
    (en as Record<string, string>)[key] ??
    `District ${districtId}`
  );
}

/**
 * Format a constituency ID into a readable label using the district name.
 * The constituency_id is composed as: districtId + sub_id (e.g., 271 = district 27, seat 1)
 *
 * @param constituencyId - The composite constituency ID
 * @param districtId - The district ID
 * @returns e.g., "Kathmandu-1", "Bara-2"
 */
export function formatConstituencyLabel(
  constituencyId: number,
  districtId: number,
  locale: Locale = 'en'
): string {
  // Extract the sub-constituency number by removing the district prefix
  const districtStr = String(districtId);
  const constStr = String(constituencyId);
  const sub = constStr.startsWith(districtStr)
    ? constStr.slice(districtStr.length)
    : String(constituencyId % 10 || constituencyId % 100);
  return `${getDistrictName(districtId, locale)}-${sub}`;
}

/**
 * Get a readable party name based on the active locale.
 *
 * - 'en': prefer English translation, fall back to Nepali (API name)
 * - 'np': always use the Nepali name (the `party` field from the API)
 */
export function displayPartyName(
  party: string,
  partyEn: string | null,
  locale: Locale = 'en'
): string {
  if (locale === 'np') return party;
  return partyEn || party;
}

/**
 * Truncate a string to maxLen characters, appending '…' if truncated.
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

// ─── SVG Setup ──────────────────────────────────────────────────────────────

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGIN: ChartMargin = {
  top: 24,
  right: 24,
  bottom: 40,
  left: 56,
};

/**
 * Clear an SVG container and set up the base group with margins applied.
 * Returns the inner `<g>` element and the inner width/height.
 */
export function setupSvg(
  svgElement: SVGSVGElement,
  width: number,
  height: number,
  margin: ChartMargin = DEFAULT_MARGIN
): {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  innerWidth: number;
  innerHeight: number;
} {
  const svg = d3
    .select(svgElement)
    .attr('width', width)
    .attr('height', height)
    .style('background', 'transparent');

  // Clear previous content
  svg.selectAll('*').remove();

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  return {
    svg,
    g,
    innerWidth: width - margin.left - margin.right,
    innerHeight: height - margin.top - margin.bottom,
  };
}

// ─── Axes ───────────────────────────────────────────────────────────────────

/**
 * Style a D3 axis group to match the dark theme.
 * Call this after appending the axis to a `<g>`.
 */
export function styleAxis(
  axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  options?: {
    hideAxisLine?: boolean;
    hideTicks?: boolean;
    tickColor?: string;
    fontSize?: string;
  }
): void {
  const {
    hideAxisLine = false,
    hideTicks = false,
    tickColor = THEME.textMuted,
    fontSize = '11px',
  } = options ?? {};

  // Axis line (the "domain" path)
  axisGroup
    .select('.domain')
    .attr('stroke', hideAxisLine ? 'none' : THEME.axisLine);

  // Tick lines
  axisGroup
    .selectAll('.tick line')
    .attr('stroke', hideTicks ? 'none' : THEME.gridLine);

  // Tick labels
  axisGroup
    .selectAll('.tick text')
    .attr('fill', tickColor)
    .style('font-size', fontSize);
}

/**
 * Add horizontal grid lines (useful for bar/line charts).
 */
export function addGridLines(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  yScale: d3.AxisScale<d3.NumberValue>,
  innerWidth: number,
  tickCount = 5
): void {
  const ticks =
    'ticks' in yScale
      ? (yScale as d3.ScaleLinear<number, number>).ticks(tickCount)
      : [];

  g.append('g')
    .attr('class', 'grid-lines')
    .selectAll('line')
    .data(ticks)
    .join('line')
    .attr('x1', 0)
    .attr('x2', innerWidth)
    .attr('y1', (d) => Number(yScale(d)))
    .attr('y2', (d) => Number(yScale(d)))
    .attr('stroke', THEME.gridLine)
    .attr('stroke-dasharray', '3,3')
    .attr('stroke-width', 0.5);
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

/**
 * Create or select a shared tooltip div for D3 charts.
 * The tooltip is appended to `document.body` once and reused.
 */
export function getTooltip(): d3.Selection<
  HTMLDivElement,
  unknown,
  HTMLElement,
  unknown
> {
  let tooltip = d3.select<HTMLDivElement, unknown>('#stats-tooltip');
  if (tooltip.empty()) {
    tooltip = d3
      .select('body')
      .append('div')
      .attr('id', 'stats-tooltip')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background', THEME.tooltipBg)
      .style('backdrop-filter', 'blur(8px)')
      .style('border', `1px solid ${THEME.tooltipBorder}`)
      .style('border-radius', '0')
      .style('padding', '6px 10px')
      .style('font-size', '11px')
      .style('line-height', '1.5')
      .style('color', THEME.text)
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.08)')
      .style('z-index', '9999')
      .style('opacity', 0)
      .style('max-width', '280px')
      .style('font-family', 'Inter, -apple-system, sans-serif')
      .style('transition', 'opacity 0.15s ease');
  }
  return tooltip;
}

/**
 * Show the tooltip at a given screen position with HTML content.
 */
export function showTooltip(
  tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown>,
  html: string,
  event: MouseEvent
): void {
  tooltip
    .html(html)
    .style('opacity', 1)
    .style('left', event.clientX + 12 + 'px')
    .style('top', event.clientY - 10 + 'px');
}

/**
 * Hide the tooltip.
 */
export function hideTooltip(
  tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown>
): void {
  tooltip.style('opacity', 0);
}

// ─── Chart Title ────────────────────────────────────────────────────────────

/**
 * Add a chart title inside the SVG.
 */
export function addChartTitle(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  title: string,
  options?: { x?: number; y?: number; fontSize?: string }
): void {
  const { x = 16, y = 18, fontSize = '13px' } = options ?? {};
  svg
    .append('text')
    .attr('x', x)
    .attr('y', y)
    .attr('fill', THEME.text)
    .style('font-size', fontSize)
    .style('font-weight', '600')
    .text(title);
}

// ─── Responsive helper ──────────────────────────────────────────────────────

/**
 * Observe the width of a container element and call back when it changes.
 * Returns a cleanup function for useEffect.
 */
export function observeResize(
  element: HTMLElement,
  callback: (width: number, height: number) => void
): () => void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      callback(width, height);
    }
  });
  observer.observe(element);
  return () => observer.disconnect();
}

// ─── Animation helpers ──────────────────────────────────────────────────────

/** Standard transition duration for chart animations (ms). */
export const TRANSITION_DURATION = 600;

/** D3 easing for smooth entry animations. */
export const EASE = d3.easeCubicOut;

/**
 * Create a standard D3 transition.
 */
export function standardTransition<
  GElement extends d3.BaseType,
  Datum,
  PElement extends d3.BaseType,
  PDatum,
>(
  selection: d3.Selection<GElement, Datum, PElement, PDatum>
): d3.Transition<GElement, Datum, PElement, PDatum> {
  return selection.transition().duration(TRANSITION_DURATION).ease(EASE);
}
