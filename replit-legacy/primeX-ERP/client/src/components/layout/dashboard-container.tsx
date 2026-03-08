import { ReactNode } from "react";
import { Helmet } from "react-helmet";

interface DashboardContainerProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  containerClassName?: string; // For custom container styling if needed
}

export function DashboardContainer({ 
  children, 
  title, 
  subtitle, 
  actions,
  containerClassName = "" 
}: DashboardContainerProps) {
  return (
    <div className="flex flex-col h-full min-h-screen">
      <Helmet>
        <title>{title} | Prime7 ERP</title>
      </Helmet>

      <div className={`flex-1 space-y-4 p-4 md:p-8 pt-6 ${containerClassName}`}>
        {/* Page Header - consistent spacing and alignment */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 mt-2">
          <div className="flex-1 min-w-0"> {/* min-w-0 prevents text overflow */}
            <h2 className="text-3xl font-bold tracking-tight truncate">{title}</h2>
            {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0">
              {actions}
            </div>
          )}
        </div>

        {/* Main Content - consistent padding and spacing */}
        <div className="space-y-4 pb-16"> {/* Added bottom padding to prevent footer overlap */}
          {children}
        </div>
        
        {/* Footer - consistent across all pages */}
        <footer className="border-t mt-8 pt-6 pb-4 text-sm text-gray-500">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              &copy; {new Date().getFullYear()} Prime7 Business Solutions. All rights reserved.
            </div>
            <div className="flex gap-4">
              <a href="#" className="hover:text-primary">Terms</a>
              <a href="#" className="hover:text-primary">Privacy</a>
              <a href="#" className="hover:text-primary">Support</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}