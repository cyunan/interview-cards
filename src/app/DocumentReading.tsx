import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type Ref } from "react";
import type { ReferenceDocument } from "../content/payload";
import { readingTarget } from "../content/reading-links";
import { structuralLines } from "../content/structure";
import { ResumeInterview } from "./ResumeInterview";
import { fillResumeFrame, resumeFrameShell } from "./resume-frame";
import { Markdown } from "./Markdown";
import { documentTitle, headingKey, isResumeProject, plainText, resumeVersion } from "./reading-data";

interface DocumentReadingBase {
  document: ReferenceDocument;
  heading?: string;
  resumeHtml?: string;
  interviewEntry?: string;
  onInterviewEntryChange?(entry?: string): void;
  onReturnToInterview?(): void;
  questionLinks: ReadonlyMap<string, string>;
  onOpenQuestion(id: string): void;
  onOpen(id: string, heading?: string): void;
}

type DocumentReadingProps = DocumentReadingBase & (
  | { library: { breadcrumb: string; onChoose(): void; titleRef: Ref<HTMLHeadingElement> }; returnLabel?: never; onBack?: never }
  | { library?: never; returnLabel: string; onBack(): void }
);

export function DocumentReading(props: DocumentReadingProps) {
  // An edition, revision or deep link opens with its own presentation and scroll target.
  const key = props.resumeHtml ? JSON.stringify([props.document.id, props.heading]) : undefined;
  return <ReadingContent key={key} {...props} />;
}

function ReadingContent({ document: note, heading, resumeHtml, interviewEntry, onInterviewEntryChange, onReturnToInterview, returnLabel, onBack, onOpen, questionLinks, onOpenQuestion, library }: DocumentReadingProps) {
  const project = isResumeProject(note);
  const body = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const initializedFrame = useRef<Document>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [presentation, setPresentation] = useState<"auto" | "text" | "original">("auto");
  const [unavailable, setUnavailable] = useState(false);
  const original = Boolean(resumeHtml && presentation !== "text" && !unavailable);
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

  function jumpToSection(target: HTMLElement | undefined) {
    if (!target) return;
    if (!frame.current || target.ownerDocument === document) {
      target.scrollIntoView?.({ block: "start" });
      return;
    }
    const bar = toolbar.current;
    const covered = bar ? (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight : 0;
    window.scrollBy(0, frame.current.getBoundingClientRect().top + target.getBoundingClientRect().top - covered - 8);
  }

  useLayoutEffect(() => {
    if (!original || !frameDocument || !frame.current) return;
    const iframe = frame.current;
    const fit = () => {
      const paper = frameDocument.body;
      const bottomMargin = parseFloat(frameDocument.defaultView?.getComputedStyle(paper).marginBottom ?? "") || 0;
      const height = Math.ceil(paper.getBoundingClientRect().bottom + (frameDocument.defaultView?.scrollY ?? 0) + bottomMargin);
      if (height > 0 && iframe.height !== String(height)) iframe.height = String(height);
    };
    fit();
    let pending = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(fit);
    });
    observer.observe(frameDocument.body);
    return () => { observer.disconnect(); cancelAnimationFrame(pending); };
  }, [original, frameDocument]);

  useLayoutEffect(() => {
    const content = original ? frameDocument?.body : body.current;
    const headings = Array.from(content?.querySelectorAll<HTMLElement>("h2,h3,h4,h5,h6") ?? []);
    elements.current = headings;
    if (!original) headings.forEach((element, index) => { element.id = "doc-heading-" + index; });
    setTitles(headings.map(element => ({ name: element.textContent ?? "", level: Number(element.tagName[1]) })));
    setContentsOpen(false);
    back.current?.focus({ preventScroll: true });
    if (heading && content) {
      const target = headings.find(element => headingKey(element.textContent ?? "") === headingKey(heading));
      if (target) {
        jumpToSection(target);
        return;
      }
      if (original && presentation === "auto") setPresentation("text");
    }
    window.scrollTo(0, 0);
  }, [note.id, heading, original, frameDocument, presentation]);

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
    if (anchor.dataset.questionId) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onOpenQuestion(anchor.dataset.questionId);
      return;
    }
    const target = readingTarget(anchor.href);
    if (!target) return;
    event.preventDefault();
    if (target.id === note.id && target.heading) {
      elements.current.find(element => headingKey(element.textContent ?? "") === headingKey(target.heading!))
        ?.scrollIntoView?.({ block: "start" });
    } else onOpen(target.id, target.heading);
  }

  const editionTitle = (resumeVersion(note) ?? "") + "简历";
  const bodyContent = original ? (
    <>
      {frameDocument?.querySelector<HTMLTemplateElement>("template#resume-interview-topics")?.content.querySelector("section[data-topic]") &&
        <p className="resume-interview-hint">点项目或技术点，查看面试回答与追问</p>}
      <iframe ref={frame} className="resume-html-frame" title={editionTitle + "原版"} srcDoc={resumeFrameShell}
        sandbox="allow-same-origin allow-modals" onError={() => setUnavailable(true)} onLoad={event => {
          const loaded = event.currentTarget.contentDocument;
          if (loaded && loaded === initializedFrame.current) return;
          if (loaded?.URL === "about:blank" && !loaded.documentElement.hasAttribute("data-resume-frame")) return;
          if (loaded && resumeHtml && fillResumeFrame(loaded, resumeHtml)) {
            initializedFrame.current = loaded;
            setFrameDocument(loaded);
          }
          else setUnavailable(true);
        }} />
      {frameDocument && <ResumeInterview frameDocument={frameDocument} entry={interviewEntry}
        onEntryChange={onInterviewEntryChange} onOpen={onOpen} />}
    </>
  ) : <div ref={body} onClick={followDocumentLink}>
    {unavailable ? <p role="status">原版暂时无法打开，已显示文字版。</p> : null}
    <Markdown images={note.images} questionLinks={project ? questionLinks : undefined}>{markdown}</Markdown>
  </div>;
  const interviewReturn = onReturnToInterview && <button type="button" className={library ? "document-action" : "reading-button"}
    onClick={onReturnToInterview}>← 返回简历问答</button>;
  const editionActions = resumeHtml && !unavailable ? <>
    <button type="button" className={library ? "document-action" : "reading-button"} onClick={() => {
      setFrameDocument(null);
      setPresentation(original ? "text" : "original");
    }}>{original ? "文字版" : "查看原版"}</button>
    {original && <button type="button" className={library ? "document-action" : "reading-button"} disabled={!frameDocument}
      onClick={() => frame.current?.contentWindow?.print()}>打印原稿</button>}
  </> : null;

  const firstLevel = Math.min(...titles.map(item => item.level));
  const topTitles = titles.map((item, index) => ({ ...item, index })).filter(item =>
    item.level === firstLevel || (heading && headingKey(item.name) === headingKey(heading))
  );

  function jumpFromContents(index: number) {
    setContentsOpen(false);
    contentsButton.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => jumpToSection(elements.current[index]));
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
        <div className="document-article-bar" ref={toolbar}>
          <div className={resumeHtml ? "document-article-actions document-edition-actions" : "document-article-actions"}>
            {interviewReturn}
            <span className="document-breadcrumb">{library.breadcrumb}</span>
            <button type="button" className="document-action document-choose" onClick={library.onChoose}>☰ 换一篇</button>
            {editionActions}
            {topTitles.length ? <button type="button" className="document-action" ref={contentsButton}
              aria-expanded={contentsOpen} aria-controls={contentsId} onClick={() => setContentsOpen(!contentsOpen)}>
              本文目录 <span aria-hidden="true">{contentsOpen ? "▴" : "▾"}</span>
            </button> : null}
          </div>
          {chapterNav("document-chapters")}
        </div>
        <article className={original ? "resume-original" : "document-article"} data-resume-project={project || undefined}>
          <h1 ref={library.titleRef} tabIndex={-1} id="reading-document-title">{original ? editionTitle : title}</h1>
          {bodyContent}
          {!original && <details className="document-source"><summary>文件出处</summary><p>{note.sourcePath}</p></details>}
        </article>
      </main>
    );
  }

  return (
    <main className="reading-reader" aria-labelledby="reading-document-title">
      <div className="reading-reader-bar" ref={toolbar}>
        <div className="reading-reader-actions">
          {interviewReturn}
          <button ref={back} className="reading-button" type="button" onClick={onBack}>← {returnLabel}</button>
          <span>{note.sourcePath.split("/")[0]}</span>
          {editionActions}
          {topTitles.length > 0 ? <button ref={contentsButton} type="button" className="reading-button reading-overlay-toc"
            aria-expanded={contentsOpen} aria-controls={contentsId} onClick={() => setContentsOpen(!contentsOpen)}>
            本文目录 <span aria-hidden="true">{contentsOpen ? "▴" : "▾"}</span>
          </button> : null}
        </div>
        {chapterNav("reading-overlay-chapters")}
      </div>
      <header className={original ? "resume-original" : "reading-reader-title"}>
        <h1 id="reading-document-title">{original ? editionTitle : title}</h1>
        {!original && <p>{note.sourcePath}</p>}
      </header>
      <div className="reading-reader-grid">
        <article className={original ? "resume-original" : "reading-paper"}>
          {bodyContent}
          {!original && <details className="reading-reader-source"><summary>文件出处</summary><p>{note.sourcePath}</p></details>}
          <button className="reading-button reader-return" type="button" onClick={onBack}>← {returnLabel}</button>
        </article>
        {titles.length > 0 ? (
          <details className="reading-toc reading-paper" open>
            <summary>本文目录</summary>
            <nav aria-label="本文目录">
              {titles.map(({ name }, index) => (
                <a key={index} href={"#doc-heading-" + index} onClick={event => {
                  event.preventDefault();
                  jumpToSection(elements.current[index]);
                }}>{name}</a>
              ))}
            </nav>
          </details>
        ) : null}
      </div>
    </main>
  );
}
