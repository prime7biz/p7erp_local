/**
 * Validates Help & Tutorials content:
 *  - every image / video / poster path exists under frontend/public
 *  - article ids are unique and every relatedArticleIds entry exists
 *  - every article has alt text on images and a lastUpdated date
 * Route links (`/app/...`) are checked separately by `frontend/src/app/routeLinks.test.ts`.
 *
 * Run: `npm run check` (from this folder).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tutorialSections } from "../../frontend/src/data/tutorials/tutorialSections";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const publicDir = path.resolve(here, "..", "..", "frontend", "public");

const problems: string[] = [];
const ids = new Map<string, number>();
const referenced = new Set<string>();
let assetCount = 0;

function checkAsset(articleId: string, src: string | undefined, what: string) {
  if (!src) return;
  assetCount += 1;
  referenced.add(src.split("?")[0]);
  if (/^https?:\/\//.test(src)) {
    problems.push(`${articleId}: ${what} uses an external URL (${src}) — use a local /tutorials/ path`);
    return;
  }
  const file = path.join(publicDir, src.split("?")[0]);
  if (!fs.existsSync(file)) problems.push(`${articleId}: ${what} not found: ${src}`);
}

const articles = tutorialSections.flatMap((s) => s.articles);
for (const a of articles) ids.set(a.id, (ids.get(a.id) ?? 0) + 1);

for (const a of articles) {
  if ((ids.get(a.id) ?? 0) > 1) problems.push(`${a.id}: duplicate article id`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.lastUpdated)) problems.push(`${a.id}: lastUpdated must be YYYY-MM-DD`);
  for (const rid of a.relatedArticleIds ?? []) {
    if (!ids.has(rid)) problems.push(`${a.id}: relatedArticleIds → unknown article "${rid}"`);
  }
  checkAsset(a.id, a.coverImage, "coverImage");
  for (const img of a.images ?? []) {
    checkAsset(a.id, img.src, "image");
    if (!img.alt?.trim()) problems.push(`${a.id}: image ${img.src} has no alt text`);
  }
  for (const v of a.videos ?? []) {
    checkAsset(a.id, v.src, "video");
    checkAsset(a.id, v.poster, "video poster");
  }
  for (const ig of a.infographics ?? []) {
    if (ig.type === "diagram") checkAsset(a.id, ig.imageSrc, "diagram");
    if (ig.type === "steps") for (const st of ig.steps) checkAsset(a.id, st.imageSrc, `step "${st.title}" image`);
  }
  for (const m of a.content.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) checkAsset(a.id, m[1], "markdown image");
}

fs.writeFileSync(
  path.join(here, "referenced-assets.json"),
  `${JSON.stringify([...referenced].sort(), null, 2)}\n`,
);

const unused: string[] = [];
for (const dir of ["screens", "videos", "diagrams"]) {
  const root = path.join(publicDir, "tutorials", dir);
  if (!fs.existsSync(root)) continue;
  for (const file of fs.readdirSync(root, { recursive: true }) as string[]) {
    const rel = `/tutorials/${dir}/${file.replace(/\\/g, "/")}`;
    if (!/\.(jpg|png|svg|webm|mp4)$/.test(rel) || referenced.has(rel)) continue;
    if (rel.endsWith("-poster.jpg") && referenced.has(rel.replace(/-poster\.jpg$/, ".webm"))) continue;
    unused.push(rel);
  }
}
if (args.has("--delete-unused")) {
  for (const rel of unused) fs.rmSync(path.join(publicDir, rel));
  console.log(`Deleted ${unused.length} unused files under public/tutorials/.`);
} else if (unused.length) {
  console.log(`${unused.length} files under public/tutorials/ are not used by any article (run with --delete-unused to remove).`);
}

console.log(`${tutorialSections.length} sections, ${articles.length} articles, ${assetCount} asset references checked.`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("All tutorial assets and article links OK.");
