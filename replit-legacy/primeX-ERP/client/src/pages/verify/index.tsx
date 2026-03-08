import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CheckCircle2, XCircle, FileText, Building2, Calendar, Hash, Banknote, Shield, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface VerificationResult {
  valid: boolean;
  message?: string;
  documentType?: string;
  documentNumber?: string;
  date?: string;
  amount?: string;
  status?: string;
  companyName?: string;
  verifiedAt?: string;
}

export default function VerifyPage() {
  const params = useParams<{ code: string }>();
  const code = params.code || "";

  const { data, isLoading, isError } = useQuery<VerificationResult>({
    queryKey: ["/api/public/verify", code],
    queryFn: async () => {
      const res = await fetch(`/api/public/verify/${encodeURIComponent(code)}`);
      return res.json();
    },
    enabled: !!code,
    retry: false,
  });

  const isValid = data?.valid === true;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-slate-800">Document Verification</span>
          </div>
          <p className="text-sm text-slate-500">Verify the authenticity of your document</p>
        </div>

        {isLoading && (
          <Card className="border-slate-200 shadow-lg">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-slate-500 text-sm">Verifying document...</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && (!code || isError || !isValid) && (
          <Card className="border-red-200 shadow-lg overflow-hidden">
            <div className="bg-red-500 text-white px-6 py-4 flex items-center gap-3">
              <XCircle className="h-6 w-6 shrink-0" />
              <div>
                <h2 className="font-semibold text-lg">Invalid or Expired Code</h2>
                <p className="text-red-100 text-sm">
                  {data?.message || "This verification code is not valid or has expired."}
                </p>
              </div>
            </div>
            <CardContent className="py-8 text-center">
              <p className="text-slate-500 text-sm">
                Please check the code and try again, or contact the issuing company for assistance.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && isValid && data && (
          <Card className="border-green-200 shadow-lg overflow-hidden">
            <div className="bg-green-500 text-white px-6 py-4 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <div>
                <h2 className="font-semibold text-lg">Verified Document</h2>
                <p className="text-green-100 text-sm">This document has been verified as authentic.</p>
              </div>
            </div>
            <CardContent className="py-6 space-y-4">
              {data.companyName && (
                <DetailRow
                  icon={<Building2 className="h-4 w-4 text-slate-400" />}
                  label="Company"
                  value={data.companyName}
                />
              )}
              <Separator />
              {data.documentType && (
                <DetailRow
                  icon={<FileText className="h-4 w-4 text-slate-400" />}
                  label="Document Type"
                  value={data.documentType}
                />
              )}
              {data.documentNumber && (
                <DetailRow
                  icon={<Hash className="h-4 w-4 text-slate-400" />}
                  label="Document Number"
                  value={data.documentNumber}
                />
              )}
              {data.date && (
                <DetailRow
                  icon={<Calendar className="h-4 w-4 text-slate-400" />}
                  label="Date"
                  value={new Date(data.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                />
              )}
              {data.amount && (
                <DetailRow
                  icon={<Banknote className="h-4 w-4 text-slate-400" />}
                  label="Amount"
                  value={data.amount}
                />
              )}
              {data.status && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Status</span>
                    <Badge variant={["approved", "completed", "posted"].includes(data.status.toLowerCase()) ? "default" : "secondary"}>
                      {data.status}
                    </Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by Prime7 ERP &bull; Secure Document Verification
        </p>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}
