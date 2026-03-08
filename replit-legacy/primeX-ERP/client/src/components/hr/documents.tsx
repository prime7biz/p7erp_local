import { useState } from 'react';
import { motion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { 
  FileText,
  FileUp,
  Settings2,
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

export default function Documents() {
  const [activeTab, setActiveTab] = useState("documents");
  
  return (
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Documents</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            <span>Templates</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="documents">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Generated Documents</CardTitle>
                <CardDescription>
                  Employee documents and records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 opacity-50" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No documents generated</h3>
                  <p className="text-sm text-center max-w-md">
                    Create document templates first, then generate documents for employees.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="templates">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Document Templates</CardTitle>
                <CardDescription>
                  Manage document templates for employee letters and certificates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No templates configured</p>
                  <p className="text-xs mt-1">Document template management not yet available</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
        
        <TabsContent value="settings">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Document Settings</CardTitle>
                <CardDescription>
                  Configure document generation settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Info className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Settings not configured</p>
                  <p className="text-xs mt-1">Document settings will be available after templates are set up</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
