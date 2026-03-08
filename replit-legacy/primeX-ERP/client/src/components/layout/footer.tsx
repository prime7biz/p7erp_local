import { useState, useEffect } from "react";

export const Footer = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Get current date and time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);
  
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };
  
  // Calculate system uptime (this is just for display, in a real app you'd get this from the server)
  const getSystemUptime = () => {
    return "99.9%";
  };
  
  // Format login time (in a real app, you'd get the actual login time from the auth context)
  const getLoginTime = () => {
    // For demo purposes, we'll just show a time from 2 hours ago
    const loginTime = new Date();
    loginTime.setHours(loginTime.getHours() - 2);
    
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(loginTime);
  };
  
  return (
    <footer className="bg-neutral-lightest border-t border-primary/20 py-3 px-4 md:px-6 text-xs md:text-sm text-neutral-dark">
      <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center">
        <div className="flex flex-col sm:flex-row items-center mb-2 sm:mb-0">
          <div className="flex items-center mr-4 mb-2 sm:mb-0">
            <span className="material-icons text-status-success text-sm mr-1">verified</span>
            <span>System Status: <span className="font-semibold text-status-success">{getSystemUptime()}</span></span>
          </div>
          <div className="flex items-center">
            <span className="material-icons text-primary text-sm mr-1">login</span>
            <span>Login Time: <span className="font-semibold text-primary">{getLoginTime()}</span></span>
          </div>
        </div>
        
        <div className="flex items-center">
          <span className="text-center">
            &copy; {currentTime.getFullYear()} <span className="font-semibold text-primary">Prime7 Business Solutions</span>. All rights reserved.
          </span>
        </div>
        
        <div className="hidden md:block text-right">
          <span>{formatDate(currentTime)}</span>
        </div>
      </div>
    </footer>
  );
};