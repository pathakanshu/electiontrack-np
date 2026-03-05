/**
 * src/components/statistics/StatCard.tsx
 *
 * Reusable card component for the statistics dashboard.
 * Displays a single stat with a label, value, optional subtitle,
 * and optional trend indicator (up/down/neutral).
 *
 * These cards form the summary grid at the top of the /statistics page,
 * giving users a quick glance at key election metrics before they scroll
 * into the detailed D3 visualizations.
 */

import React from 'react';

export type TrendDirection = 'up' | 'down' | 'neutral' | 'none';

export interface StatCardProps {
  /** Short label describing the stat (e.g. "Total Votes") */
  label: string;
  /** The primary value to display (e.g. "12,456,789" or "45.6%") */
  value: string | number;
  /** Optional secondary line of context below the value */
  subtitle?: string;
  /** Optional trend arrow direction */
  trend?: TrendDirection;
  /** Optional trend label (e.g. "+3.2% from 2074") */
  trendLabel?: string;
  /** Optional accent color override for the value text */
  accentColor?: string;
  /** Optional icon or emoji to show before the label */
  icon?: string;
  /** If true, render a slightly larger card (spans 2 columns on wide screens) */
  wide?: boolean;
  /** Optional click handler to drill into a detailed view */
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  trend = 'none',
  trendLabel,
  accentColor,
  icon,
  wide = false,
  onClick,
}) => {
  const trendArrow = {
    up: '▲',
    down: '▼',
    neutral: '●',
    none: '',
  }[trend];

  const trendColor = {
    up: '#2ecc71',
    down: '#e74c3c',
    neutral: '#3498db',
    none: 'transparent',
  }[trend];

  return (
    <div
      className={`stat-card${wide ? ' stat-card--wide' : ''}${onClick ? ' stat-card--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="stat-card__label">{label}</div>

      <div
        className="stat-card__value"
        style={accentColor ? { color: accentColor } : undefined}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>

      {subtitle && <div className="stat-card__subtitle">{subtitle}</div>}

      {trend !== 'none' && trendLabel && (
        <div className="stat-card__trend" style={{ color: trendColor }}>
          <span className="stat-card__trend-arrow">{trendArrow}</span>
          <span className="stat-card__trend-label">{trendLabel}</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
