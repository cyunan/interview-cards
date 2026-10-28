/** Preserve line positions while hiding fenced examples from structure readers. */
export function structuralLines(lines: string[]): string[] {
  let fence: { char: string; length: number } | undefined;
  return lines.map((line) => {
    const match = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (match) {
      if (!fence) fence = { char: match[1][0], length: match[1].length };
      else if (match[1][0] === fence.char && match[1].length >= fence.length && /^\s{0,3}(?:\x60+|~+)\s*$/.test(line)) fence = undefined;
      return "";
    }
    return fence ? "" : line;
  });
}
