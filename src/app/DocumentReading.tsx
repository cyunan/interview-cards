import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type Ref } from "react";
import type { ReferenceDocument } from "../content/payload";
import { readingTarget } from "../content/reading-links";
import { structuralLines } from "../content/structure";
import { Markdown } from "./Markdown";
import { documentTitle, headingKey, plainText } from "./reading-data";

interface DocumentReadingBase {
  document: ReferenceDocument;
  heading?: string;
  onOpen(id: string, heading?: string): void;
}

type DocumentReadingProps = DocumentReadingBase & (
  | { library: { breadcrumb: string; onChoose(): void; titleRef: Ref<HTMLHeadingElement> }; returnLabel?: never; onBack?: never }
  | { library?: never; returnLabel: string; onBack(): void }
);

export function DocumentReading({ document: note, heading, returnLabel, onBack, onOpen, library }: DocumentReadingProps) {
  const body = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const elements = useRef<HTMLElement[]>([]);
  const [titles, setTitles] = useState<{ name: string; level: number }[]>([]);
  const [contentsOpen, setContentsOpen] = useState(false);
  const contentsButton = useRef<HTMLButtonElement>(null);
  const contentsId = useId();
  const lines = note.markdown.split(/\r?\n/);
  const titleIndex = structuralLines(lines).findIndex(line => /^#\s+\S/.test(line));
  const title = titleIndex >= 0 ? plainText(lines[titleIndex].replace(/^#\s+/, "")) : documentTitle(note);
  let markdown = titleIndex >= 0 ? lines.filter((_, index) => index !== titleIndex).join("\n").trimStart() : note.markdown;

  // Keep the original linked scope as a disclosure and lead with the oral answer when both exist.
  if (library) {
    markdown = markdown.replace(
      /^(> \[!abstract\] 本文范围与关联阅读[^\n]*(?:\n>[^\n]*)*)\n+(?:---\s*\n+)?(> \[!summary\] (?:面试时可以这样说|30 秒口述)[^\n]*(?:\n>[^\n]*)*)/,
      (_, scope: string, answer: string) => answer + "\n\n" + scope.replace("[!abstract]", "[!abstract]-"),
    );
  }

  useLayoutEffect(() => {
    const headings = Array.from(body.current?.querySelectorAll<HTMLElement>("h2,h3,h4,h5,h6") ?? []);
    elements.current = headings;
    headings.forEach((element, index) => { element.id = "doc-heading-" + index; });
    setTitles(headings.map(element => ({ name: element.textContent ?? "", level: Number(element.tagName[1]) })));
    setContentsOpen(false);
    back.current?.focus({ preventScroll: true });
    if (heading) {
      const target = headings.find(element => headingKey(element.textContent ?? "") === headingKey(heading));
      if (target) {
        target.scrollIntoView?.({ block: "start" });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [note.id, heading]);

  useEffect(() => {
    if (!contentsOpen) return;
    const closeContents = (event: KeyboardEvent) => {
      const button = contentsButton.current;
      if (event.key !== "Escape" || event.defaultPrevented || !button?.getClientRects().length) return;
      event.preventDefault();
      setContentsOpen(false);
      button.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", closeContents, true);
    return () => window.removeEventListener("keydown", closeContents, true);
  }, [contentsOpen]);

  function followDocumentLink(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a");
    if (!anchor) return;
    const target = readingTarget(anchor.href);
    if (!target) return;
    event.preventDefault();
    if (target.id === note.id && target.heading) {
      elements.current.find(element => headingKey(element.textContent ?? "") === headingKey(target.heading!))
        ?.scrollIntoView?.({ block: "start" });
    } else onOpen(target.id, target.heading);
  }

  const bodyContent = <div ref={body} onClick={followDocumentLink}><Markdown images={note.images}>{markdown}</Markdown></div>;

  const firstLevel = Math.min(...titles.map(item => item.level));
  const topTitles = titles.map((item, index) => ({ ...item, index })).filter(item =>
    item.level === firstLevel || (heading && headingKey(item.name) === headingKey(heading))
  );

  function jumpFromContents(index: number) {
    setContentsOpen(false);
    contentsButton.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => elements.current[index]?.scrollIntoView?.({ block: "start" }));
  }

  const chapterNav = (className: string) => (
    <nav id={contentsId} className={className} aria-label="本文目录" hidden={!contentsOpen}>
      {topTitles.map(item => <a key={item.index} href={"#doc-heading-" + item.index} onClick={event => {
        event.preventDefault();
        jumpFromContents(item.index);
      }}>{item.name}</a>)}
    </nav>
  );

  if (library) {
    return (
      <main className="document-reader" aria-labelledby="reading-document-title">
        <div className="document-article-bar">
          <div className="document-article-actions">
            <span className="document-breadcrumb">{library.breadcrumb}</span>
            <button type="button" className="document-action document-choose" onClick={library.onChoose}>☰ 换一篇</button>
            {topTitles.length ? <button type="button" className="document-action" ref={contentsButton}
              aria-expanded={contentsOpen} aria-controls={contentsId} onClick={() => setContentsOpen(!contentsOpen)}>
              本文目录 <span aria-hidden="true">{contentsOpen ? "▴" : "▾"}</span>
            </button> : null}
          </div>
          {chapterNav("document-chapters")}
        </div>
        <article className="document-article">
          <h1 ref={library.titleRef} tabIndex={-1} id="reading-document-title">{title}</h1>
          {bodyContent}
          <details className="document-source"><summary>文件出处</summary><p>{note.sourcePath}</p></details>
        </article>
      </main>
    );
  }

  return (
    <main className="reading-reader" aria-labelledby="reading-document-title">
      <div className="reading-reader-bar">
        <div className="reading-reader-actions">
          <button ref={back} className="reading-button" type="button" onClick={onBack}>← {returnLabel}</button>
          <span>{note.sourcePath.split("/")[0]}</span>
          {topTitles.length > 0 ? <button ref={contentsButton} type="button" className="reading-button reading-overlay-toc"
            aria-expanded={contentsOpen} aria-controls={contentsId} onClick={() => setContentsOpen(!contentsOpen)}>
            本文目录 <span aria-hidden="true">{contentsOpen ? "▴" : "▾"}</span>
          </button> : null}
        </div>
        {chapterNav("reading-overlay-chapters")}
      </div>
      <header className="reading-reader-title">
        <h1 id="reading-document-title">{title}</h1>
        <p>{note.sourcePath}</p>
      </header>
      <div className="reading-reader-grid">
        <article className="reading-paper">
          {bodyContent}
          <details className="reading-reader-source"><summary>文件出处</summary><p>{note.sourcePath}</p></details>
          <button className="reading-button reader-return" type="button" onClick={onBack}>← {returnLabel}</button>
        </article>
        {titles.length > 0 ? (
          <details className="reading-toc reading-paper" open>
            <summary>本文目录</summary>
            <nav aria-label="本文目录">
              {titles.map(({ name }, index) => (
                <a key={index} href={"#doc-heading-" + index} onClick={event => {
                  event.preventDefault();
                  elements.current[index]?.scrollIntoView?.({ block: "start" });
                }}>{name}</a>
              ))}
            </nav>
          </details>
        ) : null}
      </div>
    </main>
  );
}
