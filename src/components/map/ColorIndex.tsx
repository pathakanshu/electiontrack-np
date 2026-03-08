import React, { useState, useMemo } from 'react';
import colorMapping from '../../config/colorMapping.json';
import { Candidate } from '../../types/election';
import { useLanguage, useTranslation } from '../../i18n';
import { getNameFromFields } from '../../i18n/getName';
import { highlightConstituencies, clearHighlights } from '../../map/maprender';

interface ColorIndexProps {
  leadingCandidates: Candidate[];
  map: any;
}

const ColorIndex: React.FC<ColorIndexProps> = ({ leadingCandidates, map }) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { locale } = useLanguage();

  // Build a map from Nepali party name → English party name using candidate data.
  // This avoids a separate translation system — party_en is resolved at bundle time.
  const partyEnMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of leadingCandidates) {
      if (!map.has(c.party)) {
        map.set(c.party, c.party_en);
      }
    }
    return map;
  }, [leadingCandidates]);

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

  // Check if any leading candidate's party is NOT in colorMapping.parties
  const hasOthers = useMemo(() => {
    const knownParties = new Set(
      Object.keys(colorMapping.parties as Record<string, string>)
    );
    return leadingCandidates.some((c) => !knownParties.has(c.party));
  }, [leadingCandidates]);

  const enterParty = (party: string) => {
    if (!map) return;
    const ids = new Set(
      leadingCandidates
        .filter((c) => c.party === party)
        .map((c) => c.constituency_id)
    );
    highlightConstituencies(map, ids, leadingCandidates);
  };

  const leaveParty = () => {
    if (map) clearHighlights(map, leadingCandidates);
  };

  return (
    <div className="color-index-container">
      {open && (
        <div className="color-index-panel">
          {partyColors.length === 0 ? (
            <p className="color-index-empty">{t('color_index_empty')}</p>
          ) : (
            <ul className="color-index-list">
              {partyColors.map(([name, color]) => (
                <li
                  key={name}
                  className="color-index-item"
                  onMouseEnter={() => enterParty(name)}
                  onMouseLeave={leaveParty}
                >
                  <span
                    className="color-index-swatch"
                    style={{ backgroundColor: color }}
                  />
                  <span className="color-index-name">
                    {getNameFromFields(
                      partyEnMap.get(name) ?? null,
                      name,
                      locale
                    )}
                  </span>
                </li>
              ))}
              {hasOthers && (
                <li key="__others" className="color-index-item">
                  <span
                    className="color-index-swatch"
                    style={{ backgroundColor: colorMapping.others }}
                  />
                  <span className="color-index-name">
                    {locale === 'np' ? 'अन्य' : 'Others'}
                  </span>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <button
        className="color-index-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? t('color_index_hide') : t('color_index_show')}
      >
        <span className="color-index-toggle-label">
          {t('color_index_title')}
        </span>
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
