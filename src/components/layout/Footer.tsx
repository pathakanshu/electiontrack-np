import React from 'react';
import { useTranslation } from '../../i18n';

const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <footer>
      <small>{t('footer_disclaimer')}</small>
      <small className="footer-github">
        <a
          href="https://github.com/pathakanshu/electiontrack-np"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        {' · '}
        <a
          href="https://linktr.ee/pathakanshu"
          target="_blank"
          rel="noopener noreferrer"
        >
          Linktree
        </a>
      </small>
      <small className="footer-copyright">© 2026 Anshu Pathak</small>
    </footer>
  );
};

export default Footer;
