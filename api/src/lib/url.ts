export type UrlCheck =
  | { ok: true; url: string }
  | { ok: false; error: "invalid_url" | "unsupported_scheme" };

const MAX_URL_LENGTH = 2048;

export function normalizeUrl(input: unknown): UrlCheck {
  if (typeof input !== "string") return { ok: false, error: "invalid_url" };

  const raw = input.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return { ok: false, error: "invalid_url" };

  let parsed: URL;
  try {
    // Throws on relative URLs, so "example.com" or "/page" are rejected here.
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "unsupported_scheme" };
  }
  if (!parsed.hostname) return { ok: false, error: "invalid_url" };

  // URL already converts the host to punycode, lowercases it and drops default ports.
  parsed.hash = "";

  return { ok: true, url: parsed.toString() };
}
