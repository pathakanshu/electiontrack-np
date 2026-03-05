/**
 * src/components/statistics/Section.tsx
 *
 * Reusable collapsible section wrapper for the statistics page.
 * Groups related visualizations under a titled, bordered card that
 * matches the app's dark theme. Sections can be collapsed to reduce
 * visual clutter when the user wants to focus on specific metrics.
 *
 * Usage:
 * ```tsx
 * <Section title="Core Results" icon="🗳" id="core-results">
 *   <SomeChart />
 *   <AnotherChart />
 * </Section>
 * ```
 */

import React, { useState, useCallback } from 'react';

export interface SectionProps {
  /** Section heading text */
  title: string;
  /** Optional emoji or icon shown before the title */
  icon?: string;
  /** Optional HTML id for anchor linking (e.g. #core-results) */
  id?: string;
  /** Optional subtitle / description shown below the title */
  description?: string;
  /** Whether the section starts collapsed. Defaults to false (expanded). */
  defaultCollapsed?: boolean;
  /** Child content — charts, tables, stat cards, etc. */
  children: React.ReactNode;
  /** Optional extra CSS class on the outer wrapper */
  className?: string;
}

const Section: React.FC<SectionProps> = ({
  title,
  icon,
  id,
  description,
  defaultCollapsed = false,
  children,
  className,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle]
  );

  return (
    <section
      className={`stats-section${collapsed ? ' stats-section--collapsed' : ''}${className ? ` ${className}` : ''}`}
      id={id}
    >
      {/* Clickable header bar */}
      <div
        className="stats-section__header"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-controls={id ? `${id}-content` : undefined}
      >
        <div className="stats-section__title-row">
          <h2 className="stats-section__title">{title}</h2>
        </div>

        <span
          className={`stats-section__chevron${collapsed ? ' stats-section__chevron--collapsed' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </div>

      {description && !collapsed && (
        <p className="stats-section__description">{description}</p>
      )}

      {/* Collapsible content area */}
      {!collapsed && (
        <div
          className="stats-section__content"
          id={id ? `${id}-content` : undefined}
        >
          {children}
        </div>
      )}
    </section>
  );
};

export default Section;
