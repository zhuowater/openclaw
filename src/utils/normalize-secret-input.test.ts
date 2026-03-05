import { describe, expect, it } from "vitest";
import { normalizeSecretInput, normalizeOptionalSecretInput } from "./normalize-secret-input.js";

describe("normalizeSecretInput", () => {
  it("returns empty string for non-string values", () => {
    expect(normalizeSecretInput(null)).toBe("");
    expect(normalizeSecretInput(undefined)).toBe("");
    expect(normalizeSecretInput(42)).toBe("");
    expect(normalizeSecretInput({})).toBe("");
    expect(normalizeSecretInput([])).toBe("");
    expect(normalizeSecretInput(true)).toBe("");
  });

  it("trims whitespace from both ends", () => {
    expect(normalizeSecretInput("  sk-abc123  ")).toBe("sk-abc123");
    expect(normalizeSecretInput("\ttoken\t")).toBe("token");
  });

  it("strips \\r characters (Windows line endings)", () => {
    expect(normalizeSecretInput("sk-abc\r\n123")).toBe("sk-abc123");
    expect(normalizeSecretInput("sk-abc\r123")).toBe("sk-abc123");
  });

  it("strips \\n characters (Unix line endings)", () => {
    expect(normalizeSecretInput("sk-abc\n123")).toBe("sk-abc123");
  });

  it("strips Unicode line separators", () => {
    expect(normalizeSecretInput("sk-abc\u2028123")).toBe("sk-abc123");
    expect(normalizeSecretInput("sk-abc\u2029123")).toBe("sk-abc123");
  });

  it("strips multiple line breaks", () => {
    expect(normalizeSecretInput("sk\r\nabc\r\n123\r\n")).toBe("skabc123");
  });

  it("preserves internal spaces", () => {
    expect(normalizeSecretInput("Bearer sk-abc123")).toBe("Bearer sk-abc123");
  });

  it("handles empty string", () => {
    expect(normalizeSecretInput("")).toBe("");
  });

  it("handles string with only line breaks and whitespace", () => {
    expect(normalizeSecretInput("\r\n\t  \n")).toBe("");
  });
});

describe("normalizeOptionalSecretInput", () => {
  it("returns undefined for non-string values", () => {
    expect(normalizeOptionalSecretInput(null)).toBeUndefined();
    expect(normalizeOptionalSecretInput(undefined)).toBeUndefined();
    expect(normalizeOptionalSecretInput(42)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(normalizeOptionalSecretInput("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(normalizeOptionalSecretInput("   ")).toBeUndefined();
    expect(normalizeOptionalSecretInput("\r\n")).toBeUndefined();
  });

  it("returns normalized value for non-empty strings", () => {
    expect(normalizeOptionalSecretInput("  sk-abc\r\n123  ")).toBe("sk-abc123");
  });
});