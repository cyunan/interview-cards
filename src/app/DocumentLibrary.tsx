import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReferenceDocument } from "../content/payload";
import { structuralLines } from "../content/structure";
import { DocumentReading } from "./DocumentReading";
import { documentTitle, isResumeProject, plainText, resumeVersion } from "./reading-data";

type LibraryKind = "documents" | "resume";

interface DocumentLibraryProps {
  kind?: LibraryKind;
  documents: ReferenceDocument[];
  selected?: ReferenceDocument;
  resumeHtml?: string;
  heading?: string;
  interviewEntry?: string;
  onInterviewEntryChange?(entry?: string): void;
  onReturnToInterview?(): void;
  questionLinks: ReadonlyMap<string, string>;
  onOpenQuestion(id: string): void;
  onOpen(id: string, heading?: string): void;
}

const resumeGroups = ["投递简历", "项目经历", "项目材料", "自我介绍", "面试准备", "技术速记"];

function resumeFolders(note: ReferenceDocument) {
  const [, folder] = note.sourcePath.split("/");
  if (resumeVersion(note)) return { module: "投递简历", topic: "" };
  if (isResumeProject(note)) return { module: "项目经历", topic: "" };
  if (folder === "简历技术点") return { module: "技术速记", topic: "" };
  if (folder === "一页版" || folder === "完整版") {
    return { module: note.sourcePath.includes("/自我介绍") ? "自我介绍" : "面试准备", topic: "" };
  }
  if (/^\d+-/.test(folder)) return { module: "项目材料", topic: moduleName(folder) };
  if (folder.includes("项目经历")) return { module: "项目材料", topic: "项目综述" };
  return { module: "面试准备", topic: "" };
}

function entryTitle(note: ReferenceDocument, kind: LibraryKind) {
  if (kind === "resume") {
    const version = resumeVersion(note);
    if (version) return version + "简历";
    if (note.sourcePath.includes("/自我介绍")) return note.sourcePath.split("/")[1] + "自我介绍";
  }
  return documentTitle(note);
}

function documentFolders(note: ReferenceDocument, kind: LibraryKind) {
  if (kind === "resume") return resumeFolders(note);
  const [module, ...folders] = note.sourcePath.split("/").slice(0, -1);
  const folder = folders[0] === "JetPack" ? folders[1] ?? folders[0] : folders[0];
  return { module: module ?? "", topic: folder === "compose" ? "Compose" : folder ?? "" };
}

function moduleName(module: string) {
  return module.replace(/^\d{2}-/, "");
}

function searchText(value: string) { return value.normalize("NFKC").toLowerCase(); }

function matchingHeading(note: ReferenceDocument, words: string[]) {
  const lines = note.markdown.split(/\r?\n/);
  let current: string | undefined;
  let closest: string | undefined;
  for (const [index, line] of structuralLines(lines).entries()) {
    const heading = /^\s{0,3}#{2,6}\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      current = plainText(heading[1]);
      const headingText = searchText(current);
      if (words.every(word => headingText.includes(word))) return current;
    } else if (current && line && !closest && words.every(word => searchText(lines[index]).includes(word))) {
      closest = current;
    }
  }
  return closest;
}

export function DocumentLibrary({ kind = "documents", documents, selected, resumeHtml, heading, interviewEntry, onInterviewEntryChange, onReturnToInterview, questionLinks, onOpenQuestion, onOpen }: DocumentLibraryProps) {
  const [query, setQuery] = useState("");
  const [choosing, setChoosing] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const readerTitle = useRef<HTMLHeadingElement>(null);
  const restoreReaderFocus = useRef(false);
  const previousScroll = useRef(0);
  const resume = kind === "resume";
  const title = resume ? "简历" : "技术文档";
  const directoryTitle = resume ? "简历目录" : "文档目录";
  const subject = resume ? "资料" : "文档";
  const active = selected && documentFolders(selected, kind);
  const breadcrumb = active && [resume ? "简历" : "", moduleName(active.module), active.topic].filter(Boolean).join(" / ");
  const modules = useMemo(() => {
    const groups = new Map<string, Map<string, ReferenceDocument[]>>();
    for (const note of documents) {
      const { module, topic } = documentFolders(note, kind);
      if (!groups.has(module)) groups.set(module, new Map());
      const topics = groups.get(module)!;
      if (!topics.has(topic)) topics.set(topic, []);
      topics.get(topic)!.push(note);
    }
    return [...groups].sort(([a], [b]) => resume
      ? resumeGroups.indexOf(a) - resumeGroups.indexOf(b)
      : a.localeCompare(b)).map(([module, topics]) => ({
      module,
      topics: [...topics].sort(([a], [b]) => {
        if (!a || b === "Compose") return 1;
        if (!b || a === "Compose") return -1;
        return a.localeCompare(b, "zh-CN");
      }),
    }));
  }, [documents, kind, resume]);
  const words = useMemo(() => searchText(query.trim()).split(/\s+/).filter(Boolean), [query]);
  const results = useMemo(() => {
    if (!words.length) return [];
    return documents.flatMap(note => {
      const displayTitle = entryTitle(note, kind);
      const title = searchText(displayTitle);
      if (!words.every(word => searchText(displayTitle + " " + note.sourcePath + " " + note.markdown).includes(word))) return [];
      const match = matchingHeading(note, words);
      return [{ note, heading: match, rank: words.every(word => title.includes(word)) ? 2 : match ? 1 : 0 }];
    }).sort((a, b) => b.rank - a.rank);
  }, [documents, kind, words]);

  useLayoutEffect(() => {
    if (choosing) {
      search.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else if (restoreReaderFocus.current) {
      restoreReaderFocus.current = false;
      readerTitle.current?.focus({ preventScroll: true });
    }
  }, [choosing, selected]);

  function closeLibrary() {
    restoreReaderFocus.current = true;
    setChoosing(false);
    requestAnimationFrame(() => window.scrollTo(0, previousScroll.current));
  }

  function openLibrary() {
    previousScroll.current = window.scrollY;
    setChoosing(true);
  }

  function noteButton(note: ReferenceDocument, match?: string) {
    return <li key={note.id}>
      <button type="button" className="document-note" aria-current={note.id === selected?.id ? "page" : undefined}
        onClick={() => {
          restoreReaderFocus.current = choosing;
          setChoosing(false);
          onOpen(note.id, match);
        }}>
        {entryTitle(note, kind)}
        {match ? <small>跳到 · {match}</small> : null}
      </button>
    </li>;
  }

  if (!selected) return <main className="reading-body"><h1>{title}</h1><p>{resume ? "暂无简历资料。" : "文档库暂无内容。"}</p></main>;

  return (
    <div className="document-library" data-choosing={choosing} onKeyDown={event => {
      if (event.key === "Escape" && choosing) { event.preventDefault(); closeLibrary(); }
    }}>
      <aside className="document-directory" aria-labelledby="document-directory-title">
        <div className="document-directory-inner">
          <div className="document-directory-heading">
            <h2 id="document-directory-title">{directoryTitle}</h2>
            <span>{documents.length} 篇</span>
          </div>
          <button type="button" className="document-action document-close-library" onClick={closeLibrary}>← 返回正文</button>
          <input ref={search} className="document-search" type="search" aria-label={resume ? "搜索简历资料" : "搜索文档"} placeholder="搜索标题、小节或正文"
            value={query} onChange={event => setQuery(event.target.value)} />
          {words.length ? <nav aria-label={resume ? "简历搜索结果" : "文档搜索结果"}>
            <p className="document-search-status" role="status">{results.length ? `${results.length} 篇匹配${subject}` : `没有匹配的${subject}。`}</p>
            <ul>{results.map(result => noteButton(result.note, result.heading))}</ul>
          </nav> : <nav aria-label={resume ? "简历资料" : "技术文档"}>
            {modules.map(({ module, topics }) => resume && (module === "投递简历" || module === "项目经历")
              ? <section key={module} className="document-projects" aria-label={module}>
                <h3>{module}</h3>
                <ul>{topics.flatMap(([, notes]) => notes.map(note => noteButton(note)))}</ul>
              </section>
              : <details key={module} className="document-module" open={module === active?.module}>
                <summary>{moduleName(module) || "其他文档"}</summary>
                {topics.map(([topic, notes]) => topic
                  ? <details key={topic} className="document-topic" open={module === active?.module && topic === active?.topic}>
                    <summary>{topic}</summary><ul>{notes.map(note => noteButton(note))}</ul>
                  </details>
                  : <ul key={topic}>{notes.map(note => noteButton(note))}</ul>)}
              </details>)}
          </nav>}
        </div>
      </aside>
      <div className="document-library-content">
        <DocumentReading document={selected} resumeHtml={resumeHtml} interviewEntry={interviewEntry}
          onInterviewEntryChange={onInterviewEntryChange} onReturnToInterview={onReturnToInterview} heading={heading} onOpen={onOpen} questionLinks={questionLinks} onOpenQuestion={onOpenQuestion}
          library={{ breadcrumb: breadcrumb ?? "", onChoose: openLibrary, titleRef: readerTitle }} />
      </div>
    </div>
  );
}
