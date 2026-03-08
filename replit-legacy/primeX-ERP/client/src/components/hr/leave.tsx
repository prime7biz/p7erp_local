import { useState } from 'react';
import { motion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { 
  ClipboardList, 
  CalendarDays, 
  BarChart4,
  Info,
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

export default function Leave() {
  const [activeTab, setActiveTab] = useState("requests");
  
  return (
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="requests" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <span>Leave Requests</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span>Leave Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart4 className="h-4 w-4" />
            <span>Leave Analytics</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="requests">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Leave Requests</CardTitle>
                <CardDescription>
                  Manage employee leave requests and approvals
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <CalendarDays className="h-8 w-8 opacity-50" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Leave management not configured</h3>
                  <p className="text-sm text-center max-w-md">
                    Leave management requires leave type and policy configuration. 
                    Contact your system administrator to set up leave management.
                  </p>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-lg">
                    <div className="p-3 border rounded-md text-center">
                      <div className="text-xs text-muted-foreground">Leave Types</div>
                      <div className="text-sm font-medium mt-1">Not configured</div>
                    </div>
                    <div className="p-3 border rounded-md text-center">
                      <div className="text-xs text-muted-foreground">Leave Policies</div>
                      <div className="text-sm font-medium mt-1">Not set up</div>
                    </div>
                    <div className="p-3 border rounded-md text-center">
                      <div className="text-xs text-muted-foreground">Holiday Calendar</div>
                      <div className="text-sm font-medium mt-1">Not configured</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="calendar">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Leave Calendar</CardTitle>
                <CardDescription>
                  View leave schedule and holidays
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Leave calendar not configured</p>
                  <p className="text-xs mt-1">Set up leave management to view the leave calendar</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="analytics">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Leave Analytics</CardTitle>
                <CardDescription>
                  Leave utilization and trends
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No leave data available</p>
                  <p className="text-xs mt-1">Configure leave management to view analytics</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
