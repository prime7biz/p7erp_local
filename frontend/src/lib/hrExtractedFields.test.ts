import { describe, expect, it } from "vitest";
import { cleanExtractedValue, decodeEntities, readExtractedField } from "./hrExtractedFields";

const f = (value: unknown) => ({ value, confidence: 0.9 });

describe("HR extraction values", () => {
  it("takes the NID 'address' and the birth certificate 'birth_registration_number'", () => {
    expect(readExtractedField({ address: f("House 12, Mirpur, Dhaka") }, "address_line")).toBe("House 12, Mirpur, Dhaka");
    expect(readExtractedField({ address_line: f("Road 1"), address: f("Other") }, "address_line")).toBe("Road 1");
    expect(readExtractedField({ birth_registration_number: f("1998 2612 3456 7890 1") }, "birth_registration_no")).toBe("19982612345678901");
  });

  it("turns AI gender and blood group into the form's options, or leaves the field alone", () => {
    expect(cleanExtractedValue("gender", "MALE")).toBe("Male");
    expect(cleanExtractedValue("gender", "female")).toBe("Female");
    expect(cleanExtractedValue("gender", "মহিলা")).toBe("Female");
    expect(cleanExtractedValue("gender", "unknown")).toBe("");
    expect(cleanExtractedValue("blood_group", "B+")).toBe("B+");
    expect(cleanExtractedValue("blood_group", "b (+ve)")).toBe("B+");
    expect(cleanExtractedValue("blood_group", "AB Negative")).toBe("AB-");
    expect(cleanExtractedValue("blood_group", "O−")).toBe("O-");
    expect(cleanExtractedValue("blood_group", "X")).toBe("");
  });

  it("keeps ID numbers digits-only, but never mangles text that is not a number", () => {
    expect(cleanExtractedValue("national_id", "1234 5678 90")).toBe("1234567890");
    expect(cleanExtractedValue("national_id", "1234-5678-90")).toBe("1234567890");
    expect(cleanExtractedValue("national_id", "BR-1990-001234")).toBe("BR-1990-001234");
  });

  it("decodes the API's HTML escaping and ignores empty, list and object values", () => {
    expect(decodeEntities("Rahim &amp; Sons &lt;Ltd&gt;")).toBe("Rahim & Sons <Ltd>");
    expect(readExtractedField({ address_line: f("Road 3 &amp; 4") }, "address_line")).toBe("Road 3 & 4");
    expect(readExtractedField({ first_name: f(null) }, "first_name")).toBe("");
    expect(readExtractedField({ first_name: f(["a"]) }, "first_name")).toBe("");
    expect(readExtractedField({ first_name: "  Rahima " }, "first_name")).toBe("Rahima");
    expect(readExtractedField({}, "email")).toBe("");
  });
});
