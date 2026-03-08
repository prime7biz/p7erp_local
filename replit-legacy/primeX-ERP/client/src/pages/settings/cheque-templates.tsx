import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Loader2,
  CreditCard,
  Image as ImageIcon,
} from "lucide-react";

interface FieldPosition {
  top: number;
  left: number;
  fontSize: number;
  maxWidth?: number;
}

interface FieldPositions {
  date: FieldPosition;
  payeeName: FieldPosition;
  amountWords: FieldPosition & { maxWidth: number };
  amountFigures: FieldPosition;
}

interface ChequeTemplate {
  id: number;
  tenantId: number;
  bankAccountId: number;
  templateName: string;
  templateImageUrl: string | null;
  fieldPositions: FieldPositions;
  chequeWidthMm: number;
  chequeHeightMm: number;
  isActive: boolean;
}

interface BankAccount {
  id: number;
  accountName: string;
  bankName: string;
}

const DEFAULT_FIELD_POSITIONS: FieldPositions = {
  date: { top: 10, left: 70, fontSize: 12 },
  payeeName: { top: 25, left: 15, fontSize: 14 },
  amountWords: { top: 38, left: 15, fontSize: 12, maxWidth: 70 },
  amountFigures: { top: 25, left: 78, fontSize: 14 },
};

const FIELD_LABELS: Record<string, string> = {
  date: "Date",
  payeeName: "Payee Name",
  amountWords: "Amount in Words",
  amountFigures: "Amount in Figures",
};

const SAMPLE_DATA: Record<string, string> = {
  date: "01/01/2026",
  payeeName: "ABC Textiles Ltd.",
  amountWords: "One Lakh Twenty Three Thousand Four Hundred Fifty Six Taka Only",
  amountFigures: "1,23,456.00",
};

export default function ChequeTemplatesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ChequeTemplate | null>(null);
  const [formData, setFormData] = useState({
    bankAccountId: "",
    templateName: "",
  });
  const [fieldPositions, setFieldPositions] = useState<FieldPositions>(DEFAULT_FIELD_POSITIONS);
  const [currentTemplateId, setCurrentTemplateId] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: templatesData, isLoading } = useQuery<{ templates: ChequeTemplate[] }>({
    queryKey: ["/api/cheque-templates"],
  });

  const { data: bankAccountsData } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank/accounts"],
  });

  const templates = templatesData?.templates || [];
  const bankAccounts = Array.isArray(bankAccountsData) ? bankAccountsData : [];

  const createMutation = useMutation({
    mutationFn: async (data: { bankAccountId: number; templateName: string; fieldPositions: FieldPositions }) => {
      const res = await apiRequest("/api/cheque-templates", "POST", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cheque-templates"] });
      setCurrentTemplateId(data.id);
      setImageUrl(data.templateImageUrl);
      toast({ title: "Template created. You can now upload an image." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create template", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; templateName?: string; fieldPositions?: FieldPositions; isActive?: boolean }) => {
      const res = await apiRequest(`/api/cheque-templates/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cheque-templates"] });
      toast({ title: "Template updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update template", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/cheque-templates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cheque-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete template", description: err.message, variant: "destructive" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/cheque-templates/${id}/upload-image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (data) => {
      setImageUrl(data.imageUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/cheque-templates"] });
      toast({ title: "Image uploaded successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to upload image", description: err.message, variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setFormData({ bankAccountId: "", templateName: "" });
    setFieldPositions(DEFAULT_FIELD_POSITIONS);
    setCurrentTemplateId(null);
    setImageUrl(null);
    setDialogOpen(true);
  };

  const openEditDialog = (template: ChequeTemplate) => {
    setEditingTemplate(template);
    setFormData({
      bankAccountId: String(template.bankAccountId),
      templateName: template.templateName,
    });
    setFieldPositions(template.fieldPositions || DEFAULT_FIELD_POSITIONS);
    setCurrentTemplateId(template.id);
    setImageUrl(template.templateImageUrl);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.bankAccountId || !formData.templateName) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    if (editingTemplate || currentTemplateId) {
      const id = currentTemplateId || editingTemplate!.id;
      updateMutation.mutate({
        id,
        templateName: formData.templateName,
        fieldPositions,
      });
    } else {
      createMutation.mutate({
        bankAccountId: parseInt(formData.bankAccountId),
        templateName: formData.templateName,
        fieldPositions,
      });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const id = currentTemplateId || editingTemplate?.id;
    if (!id) {
      toast({ title: "Please save the template first before uploading an image", variant: "destructive" });
      return;
    }
    uploadMutation.mutate({ id, file });
  };

  const updateFieldPosition = (field: keyof FieldPositions, prop: string, value: number) => {
    setFieldPositions((prev) => ({
      ...prev,
      [field]: { ...prev[field], [prop]: value },
    }));
  };

  const getBankName = (bankAccountId: number) => {
    const bank = bankAccounts.find((b) => b.id === bankAccountId);
    return bank ? `${bank.bankName} - ${bank.accountName}` : `Bank #${bankAccountId}`;
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardContainer
      title="Cheque Templates"
      subtitle="Configure cheque printing templates for bank accounts"
      actions={
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No cheque templates yet</p>
              <p className="text-sm mt-1">Create a template to start printing cheques</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template Name</TableHead>
                    <TableHead>Bank Account</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.templateName}</TableCell>
                      <TableCell>{getBankName(template.bankAccountId)}</TableCell>
                      <TableCell>
                        {template.templateImageUrl ? (
                          <Badge variant="outline" className="text-green-600">
                            <ImageIcon className="h-3 w-3 mr-1" />
                            Uploaded
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600">No Image</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={template.isActive}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({ id: template.id, isActive: checked })
                            }
                          />
                          <span className="text-sm">{template.isActive ? "Active" : "Inactive"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(template)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => deleteMutation.mutate(template.id)}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Cheque Template" : currentTemplateId ? "Configure Template" : "Create Cheque Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Account</Label>
                <Select
                  value={formData.bankAccountId}
                  onValueChange={(v) => setFormData((p) => ({ ...p, bankAccountId: v }))}
                  disabled={!!editingTemplate || !!currentTemplateId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((bank) => (
                      <SelectItem key={bank.id} value={String(bank.id)}>
                        {bank.bankName} - {bank.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  value={formData.templateName}
                  onChange={(e) => setFormData((p) => ({ ...p, templateName: e.target.value }))}
                  placeholder="e.g. Standard Cheque"
                />
              </div>
            </div>

            {(currentTemplateId || editingTemplate) && (
              <>
                <div className="space-y-2">
                  <Label>Cheque Image</Label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadMutation.isPending}
                    >
                      {uploadMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Upload Image
                    </Button>
                    {imageUrl && <span className="text-sm text-green-600">Image uploaded ✓</span>}
                  </div>
                </div>

                {imageUrl && (
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Field Positioning</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(Object.keys(FIELD_LABELS) as Array<keyof FieldPositions>).map((field) => (
                        <Card key={field} className="p-3">
                          <p className="font-medium text-sm mb-2">{FIELD_LABELS[field]}</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label className="text-xs">Top %</Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={fieldPositions[field].top}
                                onChange={(e) => updateFieldPosition(field, "top", parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Left %</Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={fieldPositions[field].left}
                                onChange={(e) => updateFieldPosition(field, "left", parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Font Size</Label>
                              <Input
                                type="number"
                                min={6}
                                max={36}
                                value={fieldPositions[field].fontSize}
                                onChange={(e) => updateFieldPosition(field, "fontSize", parseInt(e.target.value) || 12)}
                              />
                            </div>
                          </div>
                          {field === "amountWords" && (
                            <div className="mt-2">
                              <Label className="text-xs">Max Width %</Label>
                              <Input
                                type="number"
                                min={10}
                                max={100}
                                step={1}
                                value={(fieldPositions.amountWords as FieldPositions["amountWords"]).maxWidth}
                                onChange={(e) => updateFieldPosition("amountWords", "maxWidth", parseInt(e.target.value) || 70)}
                              />
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Live Preview</Label>
                      <div className="border rounded-lg overflow-hidden relative bg-gray-100">
                        <img
                          src={imageUrl}
                          alt="Cheque template"
                          className="w-full"
                          style={{ display: "block" }}
                        />
                        {(Object.keys(FIELD_LABELS) as Array<keyof FieldPositions>).map((field) => (
                          <div
                            key={field}
                            className="absolute text-black font-medium pointer-events-none"
                            style={{
                              top: `${fieldPositions[field].top}%`,
                              left: `${fieldPositions[field].left}%`,
                              fontSize: `${fieldPositions[field].fontSize}px`,
                              maxWidth: field === "amountWords" ? `${fieldPositions.amountWords.maxWidth}%` : undefined,
                              whiteSpace: field === "amountWords" ? "normal" : "nowrap",
                              lineHeight: 1.2,
                            }}
                          >
                            {SAMPLE_DATA[field]}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTemplate || currentTemplateId ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
