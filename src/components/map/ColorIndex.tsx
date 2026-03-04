import React, { useState, useMemo } from 'react';
import colorMapping from '../../config/colorMapping.json';
import { Candidate } from '../../types/election';

interface ColorIndexProps {
  leadingCandidates: Candidate[];
}

const ColorIndex: React.FC<ColorIndexProps> = ({ leadingCandidates }) => {
  const [open, setOpen] = useState(false);

  // Build the set of parties actually present in this election's results.
  // Then iterate colorMapping.parties (which has the canonical display order)
  // and keep only those that appear in the election — preserving the
  // ranking order defined in the mapping file.
  const partyColors = useMemo(() => {
    const presentParties = new Set(leadingCandidates.map((c) => c.party));
    return Object.entries(
      colorMapping.parties as Record<string, string>
    ).filter(([name]) => presentParties.has(name));
  }, [leadingCandidates]);

  return (
    <div className="color-index-container">
      {open && (
        <div className="color-index-panel">
          <ul className="color-index-list">
            {partyColors.map(([name, color]) => (
              <li key={name} className="color-index-item">
                <span
                  className="color-index-swatch"
                  style={{ backgroundColor: color }}
                />
                <span className="color-index-name">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        className="color-index-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Hide color index' : 'Show color index'}
      >
        <span className="color-index-toggle-label">Party Colors</span>
        <svg
          className={`color-index-chevron ${open ? 'color-index-chevron-up' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M2 4L6 8L10 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
};

export default ColorIndex;
