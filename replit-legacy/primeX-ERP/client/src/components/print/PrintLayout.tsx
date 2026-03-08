import { APP_VERSION } from "@/lib/version";

interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
}

interface PrintLayoutProps {
  title: string;
  subtitle?: string;
  dateRange?: string;
  children: React.ReactNode;
  showSignatures?: boolean;
  signatures?: Array<{ label: string; name?: string }>;
  companyInfo?: CompanyInfo;
  qrCode?: React.ReactNode;
}

export function PrintLayout({
  title,
  subtitle,
  dateRange,
  children,
  showSignatures = false,
  signatures = [
    { label: "Prepared By" },
    { label: "Checked By" },
    { label: "Approved By" },
  ],
  companyInfo,
  qrCode,
}: PrintLayoutProps) {
  const printedAt = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const companyName = companyInfo?.name || "Lakhsma Innerwear Limited";
  const hasCompanyInfo = !!companyInfo?.name;

  return (
    <div className="print-layout">
      <div className="print-header pb-3 mb-4 border-b-2 border-gray-300 relative">
        {qrCode && (
          <div className="absolute top-0 right-0">
            {qrCode}
          </div>
        )}
        <div className="text-center">
          {companyInfo?.logoUrl && (
            <img
              src={companyInfo.logoUrl}
              alt={companyName}
              className="mx-auto mb-2 max-h-[60px] object-contain"
            />
          )}
          <h1 className="text-xl font-bold m-0">{companyName}</h1>
        {hasCompanyInfo ? (
          <>
            {companyInfo.address && (
              <p className="text-xs text-muted-foreground m-0">
                {companyInfo.address}
              </p>
            )}
            {companyInfo.phone && (
              <p className="text-xs text-muted-foreground m-0">
                Phone: {companyInfo.phone}
              </p>
            )}
            {companyInfo.email && (
              <p className="text-xs text-muted-foreground m-0">
                Email: {companyInfo.email}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground m-0">
              Head Office: 417 (First Floor) Road # 07, Baridhara DOHS, Dhaka-1206
            </p>
            <p className="text-xs text-muted-foreground m-0">
              Factory: South Vanganahati, Sreepur, Gazipur
            </p>
            <p className="text-xs text-muted-foreground m-0">
              Email: info@lakhsmaiw.com
            </p>
          </>
        )}
        </div>
      </div>

      <div className="print-title text-center mb-1">
        <h2 className="text-lg font-bold">{title}</h2>
      </div>

      {(subtitle || dateRange) && (
        <div className="print-subtitle text-center mb-4">
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
          {dateRange && (
            <p className="text-sm text-muted-foreground">{dateRange}</p>
          )}
        </div>
      )}

      <div className="print-content">{children}</div>

      {showSignatures && signatures.length > 0 && (
        <div className="print-signatures flex justify-between mt-16 pt-0">
          {signatures.map((sig, idx) => (
            <div key={idx} className="print-signature-block text-center min-w-[120px]">
              <div className="print-signature-line border-t border-black mt-10 pt-1 text-sm">
                {sig.label}
              </div>
              {sig.name && (
                <div className="print-signature-name text-xs text-muted-foreground mt-1">
                  {sig.name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="print-footer text-center mt-6 pt-3 border-t border-gray-300 text-xs text-muted-foreground">
        <p>Prime7 ERP v{APP_VERSION} | Printed on: {printedAt}</p>
        <p>{companyName} — Confidential</p>
      </div>
    </div>
  );
}
