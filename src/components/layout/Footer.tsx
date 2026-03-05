import React from 'react';
import { useTranslation } from '../../i18n';

const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <footer>
      <small>{t('footer_disclaimer')}</small>
    </footer>
  );
};

export default Footer;
