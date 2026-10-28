import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { ReferenceDocument, ReferenceImage } from "./payload";
import { normalizeObsidianMarkdown } from "./markdown";

export interface ReferenceDocumentManifestEntry {
  id: string;
  title: string;
  sourcePath: string;
  heading?: string;
  reason: string;
}

/**
 * These are references to the private vault. Markdown and any local image
 * bytes are read only during the local encrypted build; the resulting payload
 * stays inside the encrypted envelope and is never committed as plaintext.
 */
export const REFERENCE_DOCUMENT_MANIFEST: readonly ReferenceDocumentManifestEntry[] = [
  {
    id: "android-startup",
    title: "应用启动：冷启动与热启动",
    sourcePath: "02-Android/Framework/应用启动-冷启动&热启动.md",
    reason: "把页面入口、进程准备、首帧和首次可交互拆成一条时间线。",
  },
  {
    id: "android-handler",
    title: "Handler：Android 消息驱动机制",
    sourcePath: "02-Android/Framework/Handler机制-Android 消息驱动机制.md",
    reason: "解释任务如何进入 Looper、MessageQueue，以及排队与唤醒的区别。",
  },
  {
    id: "android-compose-rendering",
    title: "Compose：渲染过程与原理",
    sourcePath: "02-Android/JetPack/compose/Compose-渲染过程与原理.md",
    reason: "把状态读取、组合、布局和绘制放回同一条帧链路。",
  },
  {
    id: "android-lifecycle",
    title: "Lifecycle：状态机与生命周期事件分发",
    sourcePath: "02-Android/JetPack/Lifecycle-生命周期感知.md",
    reason: "说明页面可见性、观察者和资源启停的边界。",
  },
  {
    id: "android-viewmodel",
    title: "ViewModel：作用域状态与实例保留",
    sourcePath: "02-Android/JetPack/ViewModel-架构组件.md",
    reason: "解释配置变化后状态为什么能留下，以及页面和状态 owner 如何分开。",
  },
  {
    id: "android-leakcanary",
    title: "LeakCanary：内存泄漏检测",
    sourcePath: "02-Android/LeakCanary-内存泄漏检测.md",
    reason: "从对象生命周期、GC Root 和引用链解释如何确认泄漏。",
  },
  {
    id: "android-mat",
    title: "MAT：堆转储分析",
    sourcePath: "02-Android/MAT-堆转储分析.md",
    reason: "把堆快照中的 Histogram、Dominator Tree 和 GC Root 路径连起来。",
  },
  {
    id: "kotlin-thread-pool",
    title: "线程池：ThreadPoolExecutor 全景",
    sourcePath: "01-Kotlin/并发编程/04_线程池与任务调度/线程池.md",
    reason: "从队列、线程数和拒绝策略解释后台积压怎样反过来影响 UI。",
  },
  {
    id: "okhttp-overview",
    title: "OkHttp：全面技术文档",
    sourcePath: "03-开源框架/OkHttp-全面技术文档.md",
    reason: "补齐连接复用、缓存、拦截器和 Dispatcher 在请求链中的职责。",
  },
  {
    id: "retrofit-overview",
    title: "Retrofit：原理与使用",
    sourcePath: "03-开源框架/Retrofit-原理与使用.md",
    reason: "解释接口代理、Converter、CallAdapter 和 OkHttp 的分层。",
  },
  {
    id: "coil-overview",
    title: "Coil：原理与使用",
    sourcePath: "03-开源框架/Coil-原理与使用.md",
    reason: "沿 Fetcher、Decoder、缓存和 Compose 图片更新定位列表卡顿。",
  },
  {
    id: "glide-overview",
    title: "Glide：原理与使用",
    sourcePath: "03-开源框架/Glide-原理与使用.md",
    reason: "对照 RequestManager、Engine、缓存和生命周期绑定的图片链路。",
  },
  {
    id: "http-map",
    title: "HTTP：总览地图",
    sourcePath: "06-计算机网络/HTTP/00_HTTP_总览地图.md",
    reason: "按报文、语义、缓存、连接和版本建立网络问题的全局坐标。",
  },
  {
    id: "http-tls",
    title: "TLS 与 HTTPS",
    sourcePath: "06-计算机网络/HTTP/06_HTTPS与安全/TLS与HTTPS.md",
    reason: "把 DNS、TCP、TLS 和应用请求的耗时与安全边界分开。",
  },
  {
    id: "http-okhttp-client",
    title: "OkHttp 核心与拦截器",
    sourcePath: "06-计算机网络/HTTP/07_客户端与Android/OkHttp核心与拦截器.md",
    reason: "用客户端侧视角串起拦截器、连接和响应体的生命周期。",
  },
  {
    id: "http-retrofit-coroutines",
    title: "Retrofit 与协程",
    sourcePath: "06-计算机网络/HTTP/07_客户端与Android/Retrofit与协程.md",
    reason: "定位挂起、取消、转换和页面状态交付之间的边界。",
  },
  {
    id: "http-retry",
    title: "错误处理与重试策略",
    sourcePath: "06-计算机网络/HTTP/03_状态码与错误/错误处理与重试策略.md",
    reason: "从错误确定性、幂等性和剩余超时预算判断能否重试。",
  },
  {
    id: "android-architecture",
    title: "Android 常见架构模式",
    sourcePath: "02-Android/架构模式.md",
    reason: "从职责边界和状态流比较 MVC、MVP、MVVM 与 MVI，而不是背名词。",
  },
  {
    id: "state-machine",
    title: "状态机模式",
    sourcePath: "05-设计模式/状态机模式.md",
    reason: "用合法状态转移、非法操作和幂等约束解释复杂业务流程。",
  },
  {
    id: "kmp-interview-map",
    title: "Kotlin Multiplatform 面试清单",
    sourcePath: "09-面试题整理/08-算法与综合/Kotlin-Multiplatform-面试题清单.md",
    reason: "为跨端路线提供共享边界、source set 和平台实现的统一术语。",
  },
  {
    id: "cross-platform-overview",
    title: "跨端与扩展技术总览",
    sourcePath: "08-跨端与扩展技术/08-跨端与扩展技术.md",
    reason: "把跨端技术放回共享规则、平台能力和工程交付的边界上。",
  },
];

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

const REFERENCE_IMAGE_URL_PREFIX = "https://interview-cards.invalid/reference-image/";
const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_EXTENSION_MIME: Record<string, ReferenceImage["mimeType"]> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

interface ImageReference {
  alt: string;
  target: string;
}

function cleanImageTarget(target: string): string {
  return target.trim().replace(/^<|>$/g, "").split("#", 1)[0].trim();
}

function imageAlt(target: string, explicitAlt?: string): string {
  if (explicitAlt?.trim()) return explicitAlt.trim();
  const cleanTarget = cleanImageTarget(target).replace(/\\/g, "/");
  return cleanTarget.split("/").at(-1) ?? cleanTarget;
}

function imageId(sourcePath: string, target: string): string {
  return createHash("sha256")
    .update(`${sourcePath}\u0000${target}`)
    .digest("hex")
    .slice(0, 24);
}

function imageUrl(id: string): string {
  return `${REFERENCE_IMAGE_URL_PREFIX}${id}`;
}

function isAllowedRemoteImage(target: string): boolean {
  try {
    const url = new URL(target);
    return url.protocol === "https:" && url.hostname === "cdn.nlark.com";
  } catch {
    return false;
  }
}

function collectImageReferences(markdown: string): ImageReference[] {
  const references: ImageReference[] = [];
  const seen = new Set<string>();
  const add = (target: string, alt?: string) => {
    const cleanTarget = cleanImageTarget(target);
    if (!cleanTarget || seen.has(cleanTarget)) return;
    seen.add(cleanTarget);
    references.push({ target: cleanTarget, alt: imageAlt(cleanTarget, alt) });
  };
  const obsidianPattern = /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
  for (const match of markdown.matchAll(obsidianPattern)) add(match[1], match[2]);
  const markdownPattern = /!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^)]*["'])?\)/g;
  for (const match of markdown.matchAll(markdownPattern)) add(match[2], match[1]);
  return references;
}

function replaceImageReferences(markdown: string, sourcePath: string, localImages: ReadonlyMap<string, string>): string {
  const replace = (target: string, alt?: string) => {
    const cleanTarget = cleanImageTarget(target);
    if (cleanTarget.startsWith(REFERENCE_IMAGE_URL_PREFIX)) return `![${imageAlt(cleanTarget, alt)}](${cleanTarget})`;
    const displayAlt = imageAlt(cleanTarget, alt);
    const localId = localImages.get(cleanTarget);
    if (localId) return `![${displayAlt}](${imageUrl(localId)})`;
    if (isAllowedRemoteImage(cleanTarget)) return `![${displayAlt}](${cleanTarget})`;
    return `> 图片资源未随题库发布：${displayAlt}`;
  };
  const withObsidianImages = markdown.replace(
    /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g,
    (_, target: string, alt?: string) => replace(target, alt),
  );
  return withObsidianImages.replace(
    /!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^)]*["'])?\)/g,
    (_, alt: string, target: string) => replace(target, alt),
  );
}

export function normalizeReferenceMarkdown(
  markdown: string,
  sourcePath = "",
  localImages: ReadonlyMap<string, string> = new Map(),
): string {
  return normalizeObsidianMarkdown(replaceImageReferences(stripFrontmatter(markdown), sourcePath, localImages))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mimeTypeForTarget(target: string): ReferenceImage["mimeType"] | undefined {
  try {
    const extension = path.extname(new URL(target, "https://interview-cards.invalid").pathname).toLowerCase();
    return IMAGE_EXTENSION_MIME[extension];
  } catch {
    return undefined;
  }
}

function isInsideVault(vaultRoot: string, candidate: string): boolean {
  const relative = path.relative(vaultRoot, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function resolveLocalImage(vaultRoot: string, sourceFile: string, target: string): Promise<Uint8Array | undefined> {
  if (/^(?:https?:)?\/\//i.test(target) || target.startsWith("data:")) return undefined;
  let decodedTarget = target;
  try {
    decodedTarget = decodeURIComponent(target);
  } catch {
    // Use the original path when a malformed percent escape is present.
  }
  const candidates = [
    path.resolve(path.dirname(sourceFile), decodedTarget),
    path.resolve(vaultRoot, decodedTarget),
    path.resolve(vaultRoot, "image", decodedTarget),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index && isInsideVault(vaultRoot, candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      const bytes = new Uint8Array(await readFile(candidate));
      if (bytes.length > 0 && bytes.length <= MAX_REFERENCE_IMAGE_BYTES) return bytes;
    } catch {
      // Continue with the next vault-relative candidate.
    }
  }
  return undefined;
}

function sanitizeSvg(bytes: Uint8Array): Uint8Array {
  const source = Buffer.from(bytes).toString("utf8")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*(?:"(?:javascript:|data:text\/html)[^"]*"|'(?:javascript:|data:text\/html)[^']*')/gi, "");
  return Buffer.from(source, "utf8");
}

async function packageReferenceImages(vaultRoot: string, sourcePath: string, source: string): Promise<ReferenceImage[]> {
  const sourceFile = path.join(vaultRoot, sourcePath);
  const images: ReferenceImage[] = [];
  for (const reference of collectImageReferences(stripFrontmatter(source))) {
    const bytes = await resolveLocalImage(vaultRoot, sourceFile, reference.target);
    const mimeType = mimeTypeForTarget(reference.target);
    if (!bytes || !mimeType) continue;
    const safeBytes = mimeType === "image/svg+xml" ? sanitizeSvg(bytes) : bytes;
    images.push({
      id: imageId(sourcePath, reference.target),
      alt: reference.alt,
      mimeType,
      data: Buffer.from(safeBytes).toString("base64"),
    });
  }
  return images;
}

/**
 * Missing optional references are ignored so fixture vaults and older local
 * checkouts can still build a valid card bank. The real vault is checked by
 * the build output count before publishing.
 */
export async function compileReferenceDocuments(vaultRoot: string, manifest: readonly ReferenceDocumentManifestEntry[] = REFERENCE_DOCUMENT_MANIFEST): Promise<ReferenceDocument[]> {
  const results = await Promise.all(manifest.map(async (entry) => {
    try {
      const source = await readFile(path.join(vaultRoot, entry.sourcePath), "utf8");
      const images = await packageReferenceImages(vaultRoot, entry.sourcePath, source);
      const localImageIds = new Map(images.map((image) => {
        const target = collectImageReferences(stripFrontmatter(source)).find((reference) => image.id === imageId(entry.sourcePath, reference.target))?.target;
        return [target ?? image.id, image.id] as const;
      }));
      const markdown = normalizeReferenceMarkdown(source, entry.sourcePath, localImageIds);
      if (!markdown) return undefined;
      return {
        id: entry.id,
        title: entry.title,
        sourcePath: entry.sourcePath,
        ...(entry.heading ? { heading: entry.heading } : {}),
        reason: entry.reason,
        markdown,
        ...(images.length > 0 ? { images } : {}),
      } satisfies ReferenceDocument;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }));
  return results.filter((document): document is ReferenceDocument => Boolean(document));
}
