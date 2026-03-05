import { describe, expect, it } from "vitest";
import { parseBooleanValue } from "./boolean.js";

describe("parseBooleanValue", () => {
  it("returns boolean values as-is", () => {
    expect(parseBooleanValue(true)).toBe(true);
    expect(parseBooleanValue(false)).toBe(false);
  });

  it("parses default truthy strings", () => {
    expect(parseBooleanValue("true")).toBe(true);
    expect(parseBooleanValue("1")).toBe(true);
    expect(parseBooleanValue("yes")).toBe(true);
    expect(parseBooleanValue("on")).toBe(true);
  });

  it("parses default falsy strings", () => {
    expect(parseBooleanValue("false")).toBe(false);
    expect(parseBooleanValue("0")).toBe(false);
    expect(parseBooleanValue("no")).toBe(false);
    expect(parseBooleanValue("off")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(parseBooleanValue("TRUE")).toBe(true);
    expect(parseBooleanValue("False")).toBe(false);
    expect(parseBooleanValue("YES")).toBe(true);
    expect(parseBooleanValue("NO")).toBe(false);
    expect(parseBooleanValue("On")).toBe(true);
    expect(parseBooleanValue("Off")).toBe(false);
  });

  it("trims whitespace", () => {
    expect(parseBooleanValue("  true  ")).toBe(true);
    expect(parseBooleanValue("\tfalse\n")).toBe(false);
    expect(parseBooleanValue(" 1 ")).toBe(true);
  });

  it("returns undefined for empty or whitespace-only strings", () => {
    expect(parseBooleanValue("")).toBeUndefined();
    expect(parseBooleanValue("   ")).toBeUndefined();
  });

  it("returns undefined for unrecognized strings", () => {
    expect(parseBooleanValue("maybe")).toBeUndefined();
    expect(parseBooleanValue("2")).toBeUndefined();
    expect(parseBooleanValue("yep")).toBeUndefined();
    expect(parseBooleanValue("nope")).toBeUndefined();
  });

  it("returns undefined for non-string, non-boolean types", () => {
    expect(parseBooleanValue(null)).toBeUndefined();
    expect(parseBooleanValue(undefined)).toBeUndefined();
    expect(parseBooleanValue(0)).toBeUndefined();
    expect(parseBooleanValue(1)).toBeUndefined();
    expect(parseBooleanValue({})).toBeUndefined();
    expect(parseBooleanValue([])).toBeUndefined();
  });

  it("supports custom truthy/falsy options", () => {
    const options = {
      truthy: ["si", "oui"],
      falsy: ["non", "nein"],
    };
    expect(parseBooleanValue("si", options)).toBe(true);
    expect(parseBooleanValue("oui", options)).toBe(true);
    expect(parseBooleanValue("non", options)).toBe(false);
    expect(parseBooleanValue("nein", options)).toBe(false);
    // Default values should not match with custom options
    expect(parseBooleanValue("true", options)).toBeUndefined();
    expect(parseBooleanValue("false", options)).toBeUndefined();
  });
});