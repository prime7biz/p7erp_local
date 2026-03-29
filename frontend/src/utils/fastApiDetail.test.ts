import { describe, expect, it } from "vitest";
import { parseFastApiErrorDetail } from "./fastApiDetail";

describe("parseFastApiErrorDetail", () => {
  it("reads string detail", () => {
    expect(parseFastApiErrorDetail("Not found")).toEqual({ message: "Not found", code: null });
  });

  it("reads structured FastAPI body", () => {
    expect(parseFastApiErrorDetail({ code: "AI_FORBIDDEN", message: "No AI for you" })).toEqual({
      message: "No AI for you",
      code: "AI_FORBIDDEN",
    });
  });

  it("falls back when unknown", () => {
    expect(parseFastApiErrorDetail(null)).toEqual({ message: "Request failed", code: null });
  });
});
