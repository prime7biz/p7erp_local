import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Star, CreditCard, Users, Zap } from "lucide-react";
import { formatMoney } from "@/lib/formatters";

interface SubscriptionPlan {
  id: number;
  name: string;
  displayName: string;
  description: string;
  maxUsers: number;
  monthlyPrice: number;
  dailyEntryLimit: number | null;
  features: string[];
  sortOrder: number;
}

export default function PricingPage() {
  const { user } = useAuth();
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

  const { data: plans, isLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/auth/subscription-plans"],
  });

  const sortedPlans = plans?.slice().sort((a, b) => a.sortOrder - b.sortOrder) || [];
  const currentPlanName = user?.subscription?.planName;

  const currentPlanOrder = sortedPlans.find(p => p.displayName === currentPlanName || p.name === currentPlanName)?.sortOrder ?? -1;

  const handleUpgrade = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setUpgradeDialogOpen(true);
  };

  const getPlanAction = (plan: SubscriptionPlan) => {
    if (plan.displayName === currentPlanName || plan.name === currentPlanName) {
      return "current";
    }
    if (plan.name === "enterprise") {
      return "contact";
    }
    if (plan.sortOrder > currentPlanOrder && currentPlanOrder >= 0) {
      return "upgrade";
    }
    if (plan.sortOrder < currentPlanOrder) {
      return "downgrade";
    }
    return "upgrade";
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">Loading plans...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white min-h-full">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Subscription Plans</h1>
          <p className="text-gray-500 text-lg">Choose the plan that best fits your business needs</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sortedPlans.map((plan) => {
            const action = getPlanAction(plan);
            const isCurrent = action === "current";
            const isPopular = plan.name === "professional";

            return (
              <Card
                key={plan.id}
                className={`relative transition-all duration-200 hover:shadow-lg ${
                  isCurrent
                    ? "border-2 border-orange-500 shadow-md"
                    : "border border-gray-200 shadow-sm hover:border-gray-300"
                } ${action === "downgrade" ? "opacity-60" : ""}`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-orange-500 text-white hover:bg-orange-500 px-3 py-1">
                      Current Plan
                    </Badge>
                  </div>
                )}
                {isPopular && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-600 text-white hover:bg-blue-600 px-3 py-1">
                      <Star className="h-3 w-3 mr-1 fill-current" />
                      Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center pb-4 pt-6">
                  <CardTitle className="text-xl font-bold text-gray-900">
                    {plan.displayName}
                  </CardTitle>
                  <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                  <div className="mt-4">
                    {plan.name === "trial" ? (
                      <div>
                        <span className="text-4xl font-bold text-gray-900">Free</span>
                        <p className="text-sm text-gray-500 mt-1">{plan.dailyEntryLimit} entries/day</p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-4xl font-bold text-gray-900">
                          {formatMoney(plan.monthlyPrice || 0)}
                        </span>
                        <span className="text-gray-500">/mo</span>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-4 justify-center">
                    <Users className="h-4 w-4" />
                    <span>Up to {plan.maxUsers} users</span>
                  </div>

                  {plan.dailyEntryLimit && plan.name !== "trial" && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-4 justify-center">
                      <Zap className="h-4 w-4" />
                      <span>{plan.dailyEntryLimit} entries/day</span>
                    </div>
                  )}

                  <ul className="space-y-3 mb-6">
                    {plan.features?.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto">
                    {action === "current" && (
                      <Button
                        variant="outline"
                        className="w-full border-orange-500 text-orange-600 hover:bg-orange-50 cursor-default"
                        disabled
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Current Plan
                      </Button>
                    )}
                    {action === "upgrade" && (
                      <Button
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={() => handleUpgrade(plan)}
                      >
                        Upgrade
                      </Button>
                    )}
                    {action === "contact" && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleUpgrade(plan)}
                      >
                        Contact Sales
                      </Button>
                    )}
                    {action === "downgrade" && (
                      <p className="text-center text-sm text-gray-400">Downgrade</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade to {selectedPlan?.displayName}</DialogTitle>
            <DialogDescription>
              Contact our sales team to upgrade your plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700 w-16">Email:</span>
              <a href="mailto:sales@prime7erp.com" className="text-orange-600 hover:underline">
                sales@prime7erp.com
              </a>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700 w-16">Phone:</span>
              <a href="tel:+8801892787220" className="text-orange-600 hover:underline">
                +880-1892-787220
              </a>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}