const documentPrefix = "https://interview-cards.invalid/document/";

export function readingHref(id: string, heading?: string): string {
  return documentPrefix + id + (heading ? "#" + encodeURIComponent(heading) : "");
}

export function readingTarget(href: string): { id: string; heading?: string } | undefined {
  if (!href.startsWith(documentPrefix)) return;
  try {
    const url = new URL(href);
    const id = url.pathname.slice("/document/".length);
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) return;
    return { id, heading: url.hash ? decodeURIComponent(url.hash.slice(1)) : undefined };
  } catch {
    return;
  }
}
