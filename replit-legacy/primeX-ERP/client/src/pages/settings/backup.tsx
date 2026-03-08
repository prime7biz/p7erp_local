import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  HardDrive,
  Download,
  Trash2,
  Upload,
  RefreshCw,
  CheckCircle,
  FileJson,
  Shield,
  Clock,
  Database,
  AlertTriangle,
} from "lucide-react";

interface BackupSettings {
  autoBackupEnabled: boolean;
  autoBackupFrequency: string;
}

interface BackupRecord {
  id: number;
  name: string;
  type: string;
  createdAt: string;
  sizeBytes: number;
}

interface GenerateResult {
  message: string;
  backupId: number;
  sizeBytes: number;
  recordCounts: Record<string, number>;
}

interface ValidationResult {
  valid: boolean;
  meta?: {
    version?: string;
    createdAt?: string;
    tenantId?: number;
    tables?: string[];
  };
  message?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

export default function BackupPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastGenerateResult, setLastGenerateResult] = useState<GenerateResult | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<BackupSettings>({
    queryKey: ["/api/backup/settings"],
  });

  const { data: backupsData, isLoading: backupsLoading } = useQuery<{ backups: BackupRecord[] }>({
    queryKey: ["/api/backup/list"],
  });

  const backups = backupsData?.backups || [];

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<BackupSettings>) => {
      const res = await apiRequest("/api/backup/settings", "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/backup/settings"] });
      toast({ title: "Settings updated", description: "Backup settings saved successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update settings", description: err.message, variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/backup/generate", "POST", {});
      return res.json() as Promise<GenerateResult>;
    },
    onSuccess: (data) => {
      setLastGenerateResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/backup/list"] });
      toast({ title: "Backup created", description: `Backup generated (${formatBytes(data.sizeBytes)})` });
    },
    onError: (err: Error) => {
      toast({ title: "Backup failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/backup/${id}`, "DELETE");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/backup/list"] });
      toast({ title: "Backup deleted" });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      setDeleteId(null);
    },
  });

  const validateMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/backup/upload-validate", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Validation failed" }));
        throw new Error(err.message || "Validation failed");
      }
      return res.json() as Promise<ValidationResult>;
    },
    onSuccess: (data) => {
      setValidationResult(data);
    },
    onError: (err: Error) => {
      setValidationResult({ valid: false, message: err.message });
      toast({ title: "Validation failed", description: err.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/backup/upload-restore", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Restore failed" }));
        throw new Error(err.message || "Restore failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/backup/list"] });
      setValidationResult(null);
      setSelectedFile(null);
      toast({ title: "Restore completed", description: "Data has been restored from backup." });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setValidationResult(null);
    validateMutation.mutate(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "application/json" || file.name.endsWith(".json"))) {
      handleFileSelect(file);
    } else {
      toast({ title: "Invalid file", description: "Please upload a JSON backup file.", variant: "destructive" });
    }
  }, [handleFileSelect]);

  const handleDownload = (id: number) => {
    window.open(`/api/backup/${id}/download`, "_blank");
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <HardDrive className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Backup & Restore</h1>
          <p className="text-sm text-muted-foreground">Manage your tenant data backups and restore points</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Auto-Backup Settings
            </CardTitle>
            <CardDescription>Configure automatic backup schedule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable Auto-Backup</p>
                    <p className="text-xs text-muted-foreground">Automatically create backups on schedule</p>
                  </div>
                  <Switch
                    checked={settings?.autoBackupEnabled ?? true}
                    onCheckedChange={(checked) =>
                      updateSettingsMutation.mutate({ autoBackupEnabled: checked })
                    }
                    disabled={updateSettingsMutation.isPending}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <label className="text-sm font-medium">Backup Frequency</label>
                  <Select
                    value={settings?.autoBackupFrequency || "daily"}
                    onValueChange={(value) =>
                      updateSettingsMutation.mutate({ autoBackupFrequency: value })
                    }
                    disabled={updateSettingsMutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              Create Manual Backup
            </CardTitle>
            <CardDescription>Generate a full snapshot of your data now</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="w-full"
            >
              {generateMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              {generateMutation.isPending ? "Generating Backup..." : "Generate Backup Now"}
            </Button>

            {lastGenerateResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                  <CheckCircle className="h-4 w-4" />
                  Backup Created ({formatBytes(lastGenerateResult.sizeBytes)})
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(lastGenerateResult.recordCounts).map(([table, count]) => (
                    <div key={table} className="text-xs text-muted-foreground flex justify-between px-1">
                      <span className="capitalize">{table.replace(/_/g, " ")}</span>
                      <span className="font-mono">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Saved Backups
          </CardTitle>
          <CardDescription>View and manage your backup history</CardDescription>
        </CardHeader>
        <CardContent>
          {backupsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No backups found. Create your first backup above.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="font-medium text-sm">{backup.name}</TableCell>
                      <TableCell>
                        <Badge variant={backup.type === "auto" ? "secondary" : "outline"} className="text-xs">
                          {backup.type === "auto" ? "Auto" : "Manual"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(backup.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatBytes(backup.sizeBytes)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(backup.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(backup.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            Restore from File
          </CardTitle>
          <CardDescription>Upload a JSON backup file to validate and restore</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            <FileJson className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium">
              {selectedFile ? selectedFile.name : "Drop a JSON backup file here or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedFile
                ? formatBytes(selectedFile.size)
                : "Supports .json backup files up to 100MB"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
          </div>

          {validateMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Validating backup file...
            </div>
          )}

          {validationResult && (
            <div
              className={`rounded-lg p-4 border ${
                validationResult.valid
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              {validationResult.valid ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                    <CheckCircle className="h-4 w-4" />
                    Backup file is valid
                  </div>
                  {validationResult.meta && (
                    <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
                      {validationResult.meta.createdAt && (
                        <p>Created: {formatDate(validationResult.meta.createdAt)}</p>
                      )}
                      {validationResult.meta.tables && (
                        <p>Tables: {validationResult.meta.tables.length}</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={() => selectedFile && restoreMutation.mutate(selectedFile)}
                      disabled={restoreMutation.isPending}
                      variant="destructive"
                      size="sm"
                    >
                      {restoreMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {restoreMutation.isPending ? "Restoring..." : "Restore This Backup"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setValidationResult(null);
                        setSelectedFile(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-700 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  {validationResult.message || "Invalid backup file"}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this backup? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
