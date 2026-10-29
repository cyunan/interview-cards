interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

// Explicit folded Obsidian callouts become native disclosures; plain callouts stay quotations.
// Raw HTML stays disabled and all generated markup still passes sanitization.
export function remarkFoldedCallouts() {
  return (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      for (const child of node.children ?? []) walk(child);
      if (node.type !== "blockquote") return;
      const paragraph = node.children?.[0];
      const first = paragraph?.children?.[0];
      if (paragraph?.type !== "paragraph" || first?.type !== "text") return;
      const marker = /^\[!(?:success|note|tip|warning|info|abstract|summary)\]([+-])?(?:[ \t]+([^\n]*))?(?:\n|$)/i.exec(first.value ?? "");
      if (!marker) return;
      first.value = first.value!.slice(marker[0].length);
      if (!first.value) paragraph!.children!.shift();
      if (!paragraph!.children!.length) node.children!.shift();
      if (!marker[1]) {
        if (marker[2]?.trim()) node.children!.unshift({
          type: "paragraph", children: [{ type: "strong", children: [{ type: "text", value: marker[2].trim() }] }],
        });
        return;
      }
      node.data = { hName: "details", hProperties: { open: marker[1] === "+" } };
      node.children!.unshift({
        type: "paragraph", data: { hName: "summary" },
        children: [{ type: "text", value: marker[2]?.trim() || "展开说明" }],
      });
    };
    walk(tree);
  };
}
