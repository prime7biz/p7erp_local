// Tiny stand-in for @testing-library/jest-dom (not installed in this project).
// Import this file once in a test: `import "./domMatchers";`
import { expect } from "vitest";

type Result = { pass: boolean; message: () => string };

function text(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

expect.extend({
  toBeInTheDocument(received: Element | null): Result {
    const pass = !!received && received.ownerDocument.contains(received);
    return { pass, message: () => `expected element ${pass ? "not " : ""}to be in the document` };
  },
  toHaveAttribute(received: Element, name: string, value?: string): Result {
    const actual = received.getAttribute(name);
    const pass = value === undefined ? actual !== null : actual === value;
    return { pass, message: () => `expected attribute ${name} ${pass ? "not " : ""}to be ${String(value)}, got ${String(actual)}` };
  },
  toHaveTextContent(received: Element, expected: string | RegExp): Result {
    const actual = text(received);
    const pass = typeof expected === "string" ? actual.includes(expected) : expected.test(actual);
    return { pass, message: () => `expected text "${actual}" ${pass ? "not " : ""}to contain ${String(expected)}` };
  },
  toBeDisabled(received: HTMLButtonElement): Result {
    return { pass: received.disabled === true, message: () => "expected element to be disabled" };
  },
  toBeEnabled(received: HTMLButtonElement): Result {
    return { pass: received.disabled === false, message: () => "expected element to be enabled" };
  },
});

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> {
    toBeInTheDocument(): T;
    toHaveAttribute(name: string, value?: string): T;
    toHaveTextContent(expected: string | RegExp): T;
    toBeDisabled(): T;
    toBeEnabled(): T;
  }
  interface AsymmetricMatchersContaining {
    toBeInTheDocument(): unknown;
  }
}
