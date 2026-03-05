import { describe, expect, it } from "vitest";
import { safeJsonStringify } from "./safe-json.js";

describe("safeJsonStringify", () => {
  it("serializes plain objects", () => {
    expect(safeJsonStringify({ a: 1, b: "hello" })).toBe('{"a":1,"b":"hello"}');
  });

  it("serializes arrays", () => {
    expect(safeJsonStringify([1, 2, 3])).toBe("[1,2,3]");
  });

  it("serializes null and primitives", () => {
    expect(safeJsonStringify(null)).toBe("null");
    expect(safeJsonStringify(42)).toBe("42");
    expect(safeJsonStringify("hello")).toBe('"hello"');
    expect(safeJsonStringify(true)).toBe("true");
  });

  it("converts bigint values to strings", () => {
    const result = safeJsonStringify({ value: BigInt("9007199254740993") });
    expect(result).toBe('{"value":"9007199254740993"}');
  });

  it("converts functions to [Function] placeholder", () => {
    const result = safeJsonStringify({ fn: () => {} });
    expect(result).toBe('{"fn":"[Function]"}');
  });

  it("serializes Error instances with name, message, and stack", () => {
    const err = new Error("test error");
    const result = safeJsonStringify({ error: err });
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.error.name).toBe("Error");
    expect(parsed.error.message).toBe("test error");
    expect(typeof parsed.error.stack).toBe("string");
  });

  it("serializes Uint8Array as base64", () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const result = safeJsonStringify({ data });
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.data.type).toBe("Uint8Array");
    expect(Buffer.from(parsed.data.data, "base64").toString()).toBe("Hello");
  });

  it("handles nested objects with mixed special types", () => {
    const obj = {
      name: "test",
      big: BigInt(123),
      nested: {
        fn: function namedFn() {},
        buf: new Uint8Array([1, 2]),
      },
    };
    const result = safeJsonStringify(obj);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.big).toBe("123");
    expect(parsed.nested.fn).toBe("[Function]");
    expect(parsed.nested.buf.type).toBe("Uint8Array");
  });

  it("returns null for circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(safeJsonStringify(obj)).toBeNull();
  });

  it("handles undefined values (dropped by JSON.stringify)", () => {
    expect(safeJsonStringify({ a: undefined })).toBe("{}");
    expect(safeJsonStringify(undefined)).toBeNull();
  });

  it("handles empty objects and arrays", () => {
    expect(safeJsonStringify({})).toBe("{}");
    expect(safeJsonStringify([])).toBe("[]");
  });
});