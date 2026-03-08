import React from 'react';
import { getAllElections, ElectionConfig } from '../../config/elections';
import { useLanguage, useTranslation } from '../../i18n';

interface HeaderProps {
  selectedElectionId: string;
  onElectionChange: (id: string) => void;
}

/**
 * Header — two-column layout.
 *
 * Left column:  BIG title ("Nepal Election Tracker")
 * Right column: election switcher row, data source, monitoring info
 *               — all stacked vertically, right-aligned, filling the space
 *               next to the title instead of wasting it.
 */
const Header: React.FC<HeaderProps> = ({
  selectedElectionId,
  onElectionChange,
}) => {
  const allElections = getAllElections();
  const selectedElection = allElections.find(
    (e) => e.id === selectedElectionId
  );
  const { t } = useTranslation();
  const { locale } = useLanguage();
  // Allow dynamic key access for translation
  const tt = t as (
    key: string,
    params?: Record<string, string | number>
  ) => string;

  const isLive = selectedElection?.isCurrent ?? false;

  return (
    <header>
      <div className="heading-bar">
        {/* ── Left: BIG title ── */}
        <div className="heading-bar__left">
          <h1 className="heading-bar__title">
            <a href="#/" className="heading-bar__title-link">
              {tt('heading_title')}
            </a>
          </h1>
          <a
            className="heading-bar__url"
            href="https://election.pathakanshu.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            election.pathakanshu.com
          </a>
        </div>

        {/* ── Right: stacked metadata ── */}
        <div className="heading-bar__right">
          {/* Row 1: election switcher + live badge */}
          <div className="heading-bar__row">
            <span className="heading-bar__tracking-label">
              {tt('heading_now_tracking')}
            </span>
            <select
              className="election-switcher"
              value={selectedElectionId}
              onChange={(e) => onElectionChange(e.target.value)}
              aria-label={t('select_election_aria')}
            >
              {allElections.map((election: ElectionConfig) => (
                <option key={election.id} value={election.id}>
                  {locale === 'np'
                    ? (election.nameNp ?? election.name)
                    : election.name}
                </option>
              ))}
            </select>
            {selectedElection?.missingData && (
              <span
                className="heading-missing-data-badge"
                title={tt('heading_incomplete_data_tooltip')}
              >
                {tt('heading_incomplete_data')}
              </span>
            )}
            {isLive && (
              <span
                className="live-badge"
                title={
                  locale === 'np'
                    ? 'प्रत्यक्ष निर्वाचन ट्र्याकिङ सक्रिय छ'
                    : 'Live election tracking is active'
                }
              >
                <span className="live-badge__dot" aria-hidden="true" />
                {locale === 'np' ? 'प्रत्यक्ष' : 'Live'}
              </span>
            )}
          </div>

          {/* Row 2: data source + monitoring info */}
          <div className="heading-bar__row heading-bar__row--secondary">
            <span className="heading-bar__source">
              {locale === 'np' ? 'स्रोत' : 'Data'}:{' '}
              <a
                href="https://election.gov.np"
                target="_blank"
                rel="noopener noreferrer"
              >
                election.gov.np
              </a>
            </span>
            {isLive && (
              <span className="heading-bar__monitoring">
                {' · '}
                {locale === 'np'
                  ? 'परिवर्तनहरू लगभग हरेक ५ मिनेटमा अनुगमन गरिन्छ'
                  : 'changes are monitored every ~ 5 minutes'}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
