import { useState } from 'react';
import { motion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { 
  ClipboardList, 
  Clock1, 
  Info,
  UserCheck,
  AlertCircle,
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

export default function Attendance() {
  return (
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemAnimation}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Attendance Management
            </CardTitle>
            <CardDescription>
              Track and manage employee attendance records
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <UserCheck className="h-8 w-8 opacity-50" />
              </div>
              <h3 className="text-lg font-medium mb-2">Attendance tracking not configured</h3>
              <p className="text-sm text-center max-w-md">
                Attendance tracking requires integration with biometric devices or manual entry setup. 
                Contact your system administrator to configure attendance tracking.
              </p>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-lg">
                <div className="p-3 border rounded-md text-center">
                  <div className="text-xs text-muted-foreground">Biometric Devices</div>
                  <div className="text-sm font-medium mt-1">Not connected</div>
                </div>
                <div className="p-3 border rounded-md text-center">
                  <div className="text-xs text-muted-foreground">Manual Entry</div>
                  <div className="text-sm font-medium mt-1">Not enabled</div>
                </div>
                <div className="p-3 border rounded-md text-center">
                  <div className="text-xs text-muted-foreground">Shift Configuration</div>
                  <div className="text-sm font-medium mt-1">Not set up</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemAnimation}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock1 className="h-5 w-5 text-primary" />
              Overtime Analysis
            </CardTitle>
            <CardDescription>
              Overtime statistics and department breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Info className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No overtime data available</p>
              <p className="text-xs mt-1">Configure attendance tracking to view overtime analysis</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
