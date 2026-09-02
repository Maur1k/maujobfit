/**
 * Untrusted URLs reach this app from two places: job postings the user pastes,
 * and links extracted from an imported PDF by the AI parser. Both end up in an
 * `href`, where a `javascript:` / `data:` scheme would execute in the page.
 *
 * `safeExternalUrl` returns the value only when it is a plain http(s) URL.
 */
const MAX_URL_LENGTH = 2048;

export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}
