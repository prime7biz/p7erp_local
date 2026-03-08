import { useEffect } from 'react';
import { useLocation } from 'wouter';

export const ReportDetailStaticPage: React.FC = () => {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/reports');
  }, [setLocation]);

  return null;
};

export default ReportDetailStaticPage;
