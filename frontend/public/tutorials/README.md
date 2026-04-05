# Tutorial screenshots & diagrams

Place **Help & Tutorials** images here so they are served as static files (e.g. `/tutorials/voucher-entry-form.png`).

## Naming

- Use **kebab-case** and a short subject: `voucher-entry-header.png`, `inquiry-create-step1.png`, `grn-line-items.png`.
- Prefer **PNG** or **WebP** for UI screenshots; **SVG** is fine for simple diagrams.

## Article references

In `tutorialSections.ts`, reference paths from the site root:

- `coverImage: "/tutorials/my-cover.png"`
- `images: [{ src: "/tutorials/foo.png", alt: "…", caption: "…" }]`
- Infographic `diagram` type: `imageSrc: "/tutorials/diagram-ap-flow.svg"`

Do **not** hardcode external image URLs in tutorial content.

## Accessibility

Every image needs **alt** text; use **caption** when the image needs a visible explanation under the figure.
