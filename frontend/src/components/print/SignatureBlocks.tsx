import type { DocumentSignatory } from "@/api/client";

type Props = {
  signatories?: DocumentSignatory[];
  /** Used when the response has no signatories (older backend): blank lines with these labels. */
  fallbackLabels: string[];
};

/** Backend timestamps are naive UTC; mark them as UTC so the browser shows local time. */
function formatSignedAt(value: string): string {
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  const d = new Date(hasZone ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function blankSignatory(label: string): DocumentSignatory {
  return {
    role_label: label,
    user_id: null,
    name: null,
    designation: null,
    signed_at: null,
    signature_image_data_uri: null,
  };
}

export function SignatureBlocks({ signatories, fallbackLabels }: Props) {
  const blocks = signatories && signatories.length > 0 ? signatories : fallbackLabels.map(blankSignatory);
  return (
    <div className="vp-signatures">
      {blocks.map((s) => (
        <div key={s.role_label} className="vp-sig-block">
          <div className="vp-sig-line">
            {s.signature_image_data_uri ? (
              <img className="vp-sig-image" src={s.signature_image_data_uri} alt={`Signature of ${s.name ?? s.role_label}`} />
            ) : null}
          </div>
          {s.name ? <span className="vp-sig-name">{s.name}</span> : null}
          {s.designation ? <span className="vp-sig-designation">{s.designation}</span> : null}
          {s.signed_at ? <span className="vp-sig-date">Digitally signed {formatSignedAt(s.signed_at)}</span> : null}
          <span className="vp-sig-role">{s.role_label}</span>
        </div>
      ))}
    </div>
  );
}
