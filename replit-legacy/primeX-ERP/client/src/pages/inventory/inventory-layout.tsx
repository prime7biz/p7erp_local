import React from 'react';
import { Route, Switch } from 'wouter';
import { AIRecommendationSidebar } from '@/components/inventory/ai-recommendation-sidebar';
import { useAuth } from '@/context/auth-context';

export function InventoryLayout() {
  const { user, tenant } = useAuth();
  const hasPremiumPlan = tenant?.subscription === 'premium';
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main content area */}
        <div className="lg:col-span-3">
          <Switch>
            <Route path="/inventory/warehouses" component={() => <div id="inventory-content" />} />
            <Route path="/inventory/categories" component={() => <div id="inventory-content" />} />
            <Route path="/inventory/subcategories" component={() => <div id="inventory-content" />} />
            <Route path="/inventory/units" component={() => <div id="inventory-content" />} />
          </Switch>
        </div>
        
        {/* AI Recommendation sidebar */}
        {hasPremiumPlan && (
          <div className="lg:col-span-1">
            <AIRecommendationSidebar />
          </div>
        )}
      </div>
    </div>
  );
}