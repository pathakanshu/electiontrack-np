import React from 'react';

const Header: React.FC = () => {
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
        <h1>heading</h1>
        <p>Now Tracking: 20xx lorem ipsum`</p>
      </div>
    </header>
  );
};

export default Header;
