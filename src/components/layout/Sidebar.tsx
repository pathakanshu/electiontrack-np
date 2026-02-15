import React from 'react';
import { ElectionStats } from '../../hooks/useElectionData';

interface WatchlistItemProps {
  constituencyName: string;
  districtName: string;
  leadingCandidate: string;
  party: string;
  votes: number;
}

/**
 * Renders an individual constituency in the user's watchlist.
 */
const WatchlistItem: React.FC<WatchlistItemProps> = ({
  constituencyName,
  districtName,
  leadingCandidate,
  party,
  votes,
}) => (
  <article className="watchlist-item">
    <div className="watchlist-item-header">
      <h3 className="watchlist-item-title">
        {districtName} - {constituencyName}
      </h3>
      <span className="party-tag">{party}</span>
    </div>
    <div className="watchlist-item-details">
      <div className="watchlist-item-detail">
        <span className="detail-label">Leading:</span>
        <span className="detail-value">{leadingCandidate}</span>
      </div>
      <div className="watchlist-item-detail">
        <span className="detail-label">Votes:</span>
        <span className="detail-value">{votes.toLocaleString()}</span>
      </div>
    </div>
  </article>
);

interface SidebarProps {
  stats: ElectionStats | null;
}

/**
 * Sidebar Component
 * Displays a 2fr/1fr split between a scrollable Watchlist and a static Leaderboard.
 */
const Sidebar: React.FC<SidebarProps> = ({ stats }) => {
  // Sort parties by seat count descending for the Leaderboard
  const partyEntries = stats ? Object.entries(stats.partyStandings) : [];
  const sortedParties = [...partyEntries].sort(([, a], [, b]) => b - a);
  const topFive = sortedParties.slice(0, 5);

  return (
    <aside className="sidebar-map-panel">
      {/* Watchlist Section - Should take 2fr and be scrollable */}
      <div className="sidebar-section watchlist-section">
        <h2 id="watchlist-text">Your Watchlist</h2>
        <div className="watchlist-scroll-container">
          <div className="watchlist-content">
            {/* Dummy constituency for now */}
            <WatchlistItem
              districtName="Kathmandu"
              constituencyName="1"
              leadingCandidate="Prakash Man Singh"
              party="Nepali Congress"
              votes={7143}
            />
            <WatchlistItem
              districtName="Lalitpur"
              constituencyName="3"
              leadingCandidate="Toshina Karki"
              party="RSP"
              votes={31136}
            />
            <p className="hint-text">
              Search for a constituency to add it here.
            </p>
          </div>
        </div>
      </div>

      {/* Leaderboard Section - Should take 1fr */}
      <div className="sidebar-section leaderboard-section">
        <div className="parties-index">
          <h3>Leaderboard (Top 5)</h3>
          {topFive.length > 0 ? (
            <ul className="index-list">
              {topFive.map(([party, seats], index) => (
                <li key={party} className="index-item">
                  <span className="rank">#{index + 1}</span>
                  <span className="party-name">{party}</span>
                  <span className="seat-count">{seats}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="status-message">Counting in progress...</p>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
