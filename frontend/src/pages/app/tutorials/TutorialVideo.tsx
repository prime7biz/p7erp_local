import { PlayCircle } from "lucide-react";
import type { TutorialVideoAsset } from "@/data/tutorials/types";

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s.toString().padStart(2, "0")} s` : `${s} s`;
}

/** Walkthrough video recorded from the real app (no autoplay; loads metadata only until played). */
export function TutorialVideo({ video }: { video: TutorialVideoAsset }) {
  const duration = formatDuration(video.durationSeconds);
  const type = video.src.endsWith(".mp4") ? "video/mp4" : "video/webm";

  return (
    <figure className="m-0 overflow-hidden rounded-xl border border-border bg-surface-subtle">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-semibold text-text-primary">
        <PlayCircle className="h-4 w-4 text-brand-primary" aria-hidden />
        <span>{video.title}</span>
        {duration ? <span className="font-normal text-text-muted">· {duration}</span> : null}
      </div>
      <video
        controls
        preload="metadata"
        playsInline
        poster={video.poster}
        className="block max-h-[480px] w-full bg-black"
        aria-label={video.title}
      >
        <source src={video.src} type={type} />
        Your browser cannot play this video.
      </video>
      {video.caption ? <figcaption className="px-4 py-2 text-xs text-text-muted">{video.caption}</figcaption> : null}
    </figure>
  );
}

export function TutorialVideoList({ videos }: { videos: TutorialVideoAsset[] }) {
  if (!videos.length) return null;
  return (
    <div className="space-y-4">
      {videos.map((v) => (
        <TutorialVideo key={v.src} video={v} />
      ))}
    </div>
  );
}
