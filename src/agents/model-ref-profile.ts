export function splitTrailingAuthProfile(raw: string): {
  model: string;
  profile?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { model: "" };
  }

  const lastSlash = trimmed.lastIndexOf("/");
  const profileDelimiter = trimmed.indexOf("@", lastSlash + 1);
  if (profileDelimiter <= 0) {
    return { model: trimmed };
  }

  const model = trimmed.slice(0, profileDelimiter).trim();
  const profile = trimmed.slice(profileDelimiter + 1).trim();
  if (!model || !profile) {
    return { model: trimmed };
  }

  // Purely numeric suffixes (e.g. @20251001) are version strings used by
  // LiteLLM / Vertex AI model naming conventions, not auth-profile names.
  // Keep them as part of the model ID to avoid silent truncation.
  if (/^\d+$/.test(profile)) {
    return { model: trimmed };
  }

  return { model, profile };
}
