import { describe, expect, it } from "vitest";
import { bn } from "./locales/bn";
import { en } from "./locales/en";

type Tree = { [k: string]: string | Tree };

function flatten(obj: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const e = flatten(en as Tree);
  const b = flatten(bn as Tree);

  it("Bangla has exactly the English keys", () => {
    expect(Object.keys(b).sort()).toEqual(Object.keys(e).sort());
  });

  it("keeps every {{placeholder}} and has no empty text", () => {
    for (const key of Object.keys(e)) {
      expect(placeholders(b[key] ?? ""), key).toEqual(placeholders(e[key] ?? ""));
      expect((b[key] ?? "").trim().length, key).toBeGreaterThan(0);
    }
  });
});
