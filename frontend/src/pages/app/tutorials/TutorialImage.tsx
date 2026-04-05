import { cn } from "@/lib/utils";

interface TutorialImageProps {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
}

export function TutorialImage({ src, alt, caption, className }: TutorialImageProps) {
  return (
    <figure className={cn("my-4", className)}>
      <img
        src={src}
        alt={alt}
        className="max-h-72 w-full rounded-lg border border-border bg-surface-subtle object-contain"
        loading="lazy"
      />
      {caption ? <figcaption className="mt-2 text-center text-xs text-text-muted">{caption}</figcaption> : null}
    </figure>
  );
}
