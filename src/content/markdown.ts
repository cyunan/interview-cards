function wikilinkDisplay(value: string): string {
  const unescaped = value.replace(/\\\|/g, "|");
  const separator = unescaped.lastIndexOf("|");
  if (separator >= 0) {
    return unescaped.slice(separator + 1).trim();
  }

  const target = unescaped.split("#", 1)[0].trim();
  return target.split("/").at(-1)?.trim() ?? target;
}

export function normalizeObsidianMarkdown(markdown: string): string {
  return markdown
    .replace(/\[\[([^\]]+)\]\]/g, (_, value: string) => wikilinkDisplay(value))
    .trim();
}
