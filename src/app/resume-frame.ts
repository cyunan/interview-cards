import { readingTarget } from "../content/reading-links";

// srcdoc is available on cold offline opens, including WebKit sandboxed frames.
export const resumeFrameShell = `<!doctype html><html lang="zh-CN" data-resume-frame>
  <head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; base-uri 'none'; form-action 'none'">
    <meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>简历原稿</title></head><body></body></html>`;

export function installFrameStyles(doc: Document, css: string): () => void {
  // Construct the sheet in the frame's realm. It can only load the image
  // types its own CSP permits, and needs no inline-style concession in the app.
  if (doc.defaultView?.CSSStyleSheet?.prototype.replaceSync) {
    const sheet = new doc.defaultView.CSSStyleSheet();
    sheet.replaceSync(css);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    return () => { doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(item => item !== sheet); };
  }
  const style = doc.createElement("style");
  style.textContent = css;
  doc.head.append(style);
  return () => style.remove();
}

const allowedElements = new Set("header main article section aside footer div span h1 h2 h3 h4 h5 h6 p ul ol li br hr blockquote em strong b i small code pre table thead tbody tr th td style img a template details summary".split(" "));
const commonAttributes = ["class", "role", "aria-label", "aria-hidden", "title", "data-interview-topic", "data-topic"];
const rasterImage = /^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/]+=*$/i;

/** Build only the printed markup and its inert interview annotations inside the restricted frame. */
export function fillResumeFrame(doc: Document, html: string): boolean {
  if (!doc.documentElement.hasAttribute("data-resume-frame")) return false;
  const source = doc.createElement("template");
  source.innerHTML = html;
  const fragment = doc.createDocumentFragment();
  function copy(parent: ParentNode, output: ParentNode, inTemplate: boolean) {
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        output.append(doc.createTextNode(node.textContent ?? ""));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const from = node as HTMLElement;
      const tag = from.localName;
      if (from.namespaceURI !== "http://www.w3.org/1999/xhtml" || !allowedElements.has(tag)) continue;
      if (tag === "template" && (inTemplate || from.id !== "resume-interview-topics")) continue;
      if (tag === "style") {
        if (!inTemplate) installFrameStyles(doc, from.textContent ?? "");
        continue;
      }
      const to = doc.createElement(tag);
      if (from.hasAttribute("style")) to.style.cssText = from.style.cssText;
      for (const key of commonAttributes) {
        const value = from.getAttribute(key);
        if (value !== null) to.setAttribute(key, value);
      }
      if (tag === "img") {
        const src = from.getAttribute("src") ?? "";
        if (!rasterImage.test(src)) continue;
        to.setAttribute("src", src);
        to.setAttribute("alt", from.getAttribute("alt") ?? "");
      } else if (tag === "a" && inTemplate) {
        const href = from.getAttribute("href") ?? "";
        if (readingTarget(href)) to.setAttribute("href", href);
      } else if (tag === "template") {
        to.id = "resume-interview-topics";
        copy((from as HTMLTemplateElement).content, (to as HTMLTemplateElement).content, true);
      }
      if (tag !== "template") copy(from, to, inTemplate);
      output.append(to);
    }
  }
  copy(source.content, fragment, false);
  if (!fragment.querySelector("h1,h2")) return false;
  doc.body.replaceChildren(fragment);
  return true;
}
