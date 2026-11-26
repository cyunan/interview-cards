// @vitest-environment jsdom
import { expect, it } from "vitest";
import { fillResumeFrame } from "./resume-frame";

it("keeps the printed layout and the inert source annotations inside the dedicated frame", () => {
  const doc = new DOMParser().parseFromString("<html data-resume-frame></html>", "text/html");
  const source = `<!doctype html><html><head><title>Example</title><style>.stack { display: flex; }</style></head>
    <body><h1>Demo</h1><div class="stack" role="group"><span data-interview-topic="stack">Tools</span></div>
    <img src="data:image/png;base64,cA==" alt="Example">
    <template id="resume-interview-topics"><section data-topic="stack">
      <a href="https://interview-cards.invalid/document/fictional-doc">Chapter</a>
    </section></template></body></html>`;
  expect(fillResumeFrame(doc, source)).toBe(true);
  expect(doc.querySelector("style")?.textContent).toBe(".stack { display: flex; }");
  expect(doc.querySelector(".stack [data-interview-topic]")?.textContent).toBe("Tools");
  expect(doc.querySelector("img")?.getAttribute("alt")).toBe("Example");
  expect(doc.body.querySelector("a")).toBeNull();
  expect(doc.querySelector("template")?.content.querySelector("a")?.getAttribute("href"))
    .toBe("https://interview-cards.invalid/document/fictional-doc");
});

it("leaves executable and network-bearing markup out of the isolated print view", () => {
  const doc = new DOMParser().parseFromString("<html data-resume-frame></html>", "text/html");
  fillResumeFrame(doc, `<h1>Demo</h1><link rel="stylesheet" href="/styles.css"><form></form><iframe></iframe>
    <a href="/external" target="_top">External</a><img src="/portrait.jpg"><script></script>
    <meta http-equiv="refresh" content="10"><p onclick="">Text</p>`);
  expect(doc.querySelector("script, form, iframe, link, meta, img, [onclick], a[href], [target]")).toBeNull();
  expect(doc.querySelector("p")?.textContent).toBe("Text");
  expect(fillResumeFrame(document, "<h1>Demo</h1>")).toBe(false);
});
