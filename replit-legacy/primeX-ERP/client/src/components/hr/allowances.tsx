import { useState } from 'react';
import { motion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { 
  BarChart4,
  Wallet,
  Receipt,
  Info,
  Calculator,
} from "lucide-react";

const containerAnimation = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemAnimation = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.5
    }
  }
};

export default function Allowances() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart4 className="h-4 w-4" />
            <span>Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="allowances" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span>Allowances</span>
          </TabsTrigger>
          <TabsTrigger value="claims" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span>Claims</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Allowances Overview</CardTitle>
                <CardDescription>
                  Monthly summary of all allowances and claims
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Calculator className="h-8 w-8 opacity-50" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Allowances not configured</h3>
                  <p className="text-sm text-center max-w-md">
                    Allowance management requires allowance types and policies to be configured. 
                    Contact your system administrator to set up allowances.
                  </p>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-lg">
                    <div className="p-3 border rounded-md text-center">
                      <div className="text-xs text-muted-foreground">Allowance Types</div>
                      <div className="text-sm font-medium mt-1">Not configured</div>
                    </div>
                    <div className="p-3 border rounded-md text-center">
                      <div className="text-xs text-muted-foreground">Active Policies</div>
                      <div className="text-sm font-medium mt-1">—</div>
                    </div>
                    <div className="p-3 border rounded-md text-center">
                      <div className="text-xs text-muted-foreground">Pending Claims</div>
                      <div className="text-sm font-medium mt-1">—</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="allowances">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Allowance Definitions</CardTitle>
                <CardDescription>
                  Define and manage allowance types
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No allowances defined</p>
                  <p className="text-xs mt-1">Configure allowance types to get started</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="claims">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Allowance Claims</CardTitle>
                <CardDescription>
                  Employee allowance claims and approvals
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No claims submitted</p>
                  <p className="text-xs mt-1">Define allowances first before submitting claims</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
