import React from 'react';
import { getAllElections, ElectionConfig } from '../../config/elections';

interface HeaderProps {
  selectedElectionId: string;
  onElectionChange: (id: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  selectedElectionId,
  onElectionChange,
}) => {
  const allElections = getAllElections();
  const selectedElection = allElections.find(
    (e) => e.id === selectedElectionId
  );

  return (
    <header>
      <nav>
        <ul className="navbar-list">
          <li className="navbar-item">
            <a href="#">Home</a>
          </li>
          <li className="navbar-item">
            <a href="#">About</a>
          </li>
          <li className="navbar-item">
            <a href="#">Docs</a>
          </li>
          <li className="navbar-item">
            <a href="#">ToS</a>
          </li>
          <li className="navbar-item">
            <a href="#">English</a> / <a href="#">Nepali</a>
          </li>
        </ul>
      </nav>
      <div className="heading-text">
        <h1>Election Tracker Nepal</h1>
        <div className="heading-subrow">
          <p className="heading-tracking-label">Now Tracking:</p>
          <select
            className="election-switcher"
            value={selectedElectionId}
            onChange={(e) => onElectionChange(e.target.value)}
            aria-label="Select election to view"
          >
            {allElections.map((election: ElectionConfig) => (
              <option key={election.id} value={election.id}>
                {election.name}
              </option>
            ))}
          </select>
          {selectedElection?.missingData && (
            <span
              className="heading-missing-data-badge"
              title="Some data may be incomplete for this election"
            >
              ⚠ incomplete data
            </span>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
