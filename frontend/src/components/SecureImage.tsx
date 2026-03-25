import type { CSSProperties } from "react";

import { useSecureImage } from "@/hooks/useSecureImage";

type Props = {
  url: string | null | undefined;
  alt: string;
  className?: string;
  style?: CSSProperties;
};

/** Renders tenant-scoped images that require JWT (paths under /api/v1/files/). */
export function SecureImage({ url, alt, className, style }: Props) {
  const src = useSecureImage(url);
  if (!src) return null;
  return <img src={src} alt={alt} className={className} style={style} />;
}
