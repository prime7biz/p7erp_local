/**
 * Browser-only PNG rasterizer for the organogram SVG export string.
 * Kept separate from pure layout logic so unit tests can stub it.
 */
import { saveBlob } from "@/lib/fileSave";
import { buildExportSvg, clampCanvasSize, type ColourMode, type ChartLayout } from "./organogramChartLogic";

export async function downloadOrganogramPng(opts: {
  layout: ChartLayout;
  colourMode: ColourMode;
  date: string;
  title?: string;
}): Promise<void> {
  const svg = buildExportSvg({
    nodes: opts.layout.nodes,
    edges: opts.layout.edges,
    width: opts.layout.width,
    height: opts.layout.height,
    colourMode: opts.colourMode,
    title: opts.title,
  });
  const clamped = clampCanvasSize(opts.layout.width, opts.layout.height);
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(blobUrl);
    const canvas = document.createElement("canvas");
    canvas.width = clamped.width;
    canvas.height = clamped.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create a drawing surface for the PNG.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await canvasToBlob(canvas);
    if (!png) throw new Error("PNG export failed (chart may be too large for this device). Try Collapse to managers or Focus this team.");
    await saveBlob(png, `organogram-${opts.date}.png`);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the chart image for export."));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png");
  });
}
