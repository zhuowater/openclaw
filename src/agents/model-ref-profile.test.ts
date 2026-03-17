import { describe, expect, it } from "vitest";
import { splitTrailingAuthProfile } from "./model-ref-profile.js";

describe("splitTrailingAuthProfile", () => {
  it("returns trimmed model when no profile suffix exists", () => {
    expect(splitTrailingAuthProfile(" openai/gpt-5 ")).toEqual({
      model: "openai/gpt-5",
    });
  });

  it("splits trailing @profile suffix", () => {
    expect(splitTrailingAuthProfile("openai/gpt-5@work")).toEqual({
      model: "openai/gpt-5",
      profile: "work",
    });
  });

  it("keeps @-prefixed path segments in model ids", () => {
    expect(splitTrailingAuthProfile("openai/@cf/openai/gpt-oss-20b")).toEqual({
      model: "openai/@cf/openai/gpt-oss-20b",
    });
  });

  it("supports trailing profile override after @-prefixed path segments", () => {
    expect(splitTrailingAuthProfile("openai/@cf/openai/gpt-oss-20b@cf:default")).toEqual({
      model: "openai/@cf/openai/gpt-oss-20b",
      profile: "cf:default",
    });
  });

  it("keeps openrouter preset paths without profile override", () => {
    expect(splitTrailingAuthProfile("openrouter/@preset/kimi-2-5")).toEqual({
      model: "openrouter/@preset/kimi-2-5",
    });
  });

  it("supports openrouter preset profile overrides", () => {
    expect(splitTrailingAuthProfile("openrouter/@preset/kimi-2-5@work")).toEqual({
      model: "openrouter/@preset/kimi-2-5",
      profile: "work",
    });
  });

  it("does not split when suffix after @ contains slash", () => {
    expect(splitTrailingAuthProfile("provider/foo@bar/baz")).toEqual({
      model: "provider/foo@bar/baz",
    });
  });

  it("uses first @ after last slash for email-based auth profiles", () => {
    expect(splitTrailingAuthProfile("flash@google-gemini-cli:test@gmail.com")).toEqual({
      model: "flash",
      profile: "google-gemini-cli:test@gmail.com",
    });
  });

  it("does not split numeric version suffixes (LiteLLM/Vertex AI @YYYYMMDD style)", () => {
    expect(splitTrailingAuthProfile("my-litellm/vertex-ai_claude-haiku-4-5@20251001")).toEqual({
      model: "my-litellm/vertex-ai_claude-haiku-4-5@20251001",
    });
  });

  it("does not split short numeric version suffixes", () => {
    expect(splitTrailingAuthProfile("provider/model@20240101")).toEqual({
      model: "provider/model@20240101",
    });
  });

  it("still splits non-numeric named auth profiles that follow a model with underscores", () => {
    expect(splitTrailingAuthProfile("my-litellm/vertex-ai_claude-haiku-4-5@prod")).toEqual({
      model: "my-litellm/vertex-ai_claude-haiku-4-5",
      profile: "prod",
    });
  });
});
