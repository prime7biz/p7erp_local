import { TutorialImage } from "./TutorialImage";
import type { TutorialImageAsset } from "@/data/tutorials/types";

interface TutorialImageGridProps {
  images: TutorialImageAsset[];
}

export function TutorialImageGrid({ images }: TutorialImageGridProps) {
  if (!images.length) return null;

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {images.map((img, i) => (
        <TutorialImage key={`${img.src}-${i}`} src={img.src} alt={img.alt} caption={img.caption} />
      ))}
    </div>
  );
}
