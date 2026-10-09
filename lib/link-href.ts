function blockedLinkScheme(value: string) {
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .toLowerCase();
  return normalized.startsWith("javascript:") || normalized.startsWith("data:");
}

export function markdownLinkHref(value: string) {
  return blockedLinkScheme(value) ? "" : value;
}

export function safeLinkHref(raw: string): string | null {
  if (!raw || hasUnsafeUrlChar(raw) || blockedLinkScheme(raw)) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.href;
    } catch {
      return null;
    }
  }
  return raw;
}

function hasUnsafeUrlChar(raw: string) {
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 32 || code === 127) return true;
    if ("<>\"'`".includes(raw[i])) return true;
  }
  return false;
}
