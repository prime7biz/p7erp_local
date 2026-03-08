import { useEffect } from 'react';
import { useLocation } from 'wouter';

export const ReportsStaticPage: React.FC = () => {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/reports');
  }, [setLocation]);

  return null;
};

export default ReportsStaticPage;
