import type { CardV2 } from "../content/types";

const topicCollator = new Intl.Collator("zh-CN", { numeric: true });
type TopicRange = readonly [first: number, last: number, name: string];

// The imported network and coroutine collections each have one source topic.
// Use stable card IDs to group their existing questions without moving the
// notes or relying on wording that can change when an answer is edited.
const coroutineRanges: readonly TopicRange[] = [
  [1, 11, "协程机制与调度"],
  [12, 19, "取消、异常与结构化并发"],
  [20, 27, "Flow 操作符与上下文"],
  [28, 33, "热流与 Channel"],
  [34, 36, "Android 协程实践"],
];

const networkRanges: readonly TopicRange[] = [
  [1, 10, "HTTP 基础与语义"],
  [11, 21, "HTTPS 与 TLS"],
  [22, 30, "HTTP 版本与缓存"],
  [31, 36, "TCP / UDP 基础"],
  [37, 45, "TCP 握手与连接管理"],
  [46, 55, "TCP 可靠传输与拥塞控制"],
  [56, 57, "TCP 握手与连接管理"],
  [58, 58, "TCP 可靠传输与拥塞控制"],
];

export function questionTopic(card: CardV2): string {
  const [prefix, suffix] = card.id.split(/-(?=\d{3}$)/);
  const number = Number(suffix);
  const ranges = prefix === "kotlin-kotlin" ? coroutineRanges : prefix === "network-coding-v3" ? networkRanges : [];
  const grouped = ranges.find(([first, last]) => number >= first && number <= last)?.[2];
  if (grouped) return grouped;

  if (card.id === "network-6db9761a-001") return "DNS";
  if (card.id === "network-6db9761a-005") return "WebSocket";
  return card.topic.replace(/\s*[·・]\s*面试题与答案\s*$/, "").trim() || "其他专题";
}

export function listQuestionTopics(cards: ReadonlyArray<{ topic: string }>) {
  const counts = new Map<string, number>();
  for (const { topic } of cards) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  return [...counts].sort(([left], [right]) => topicCollator.compare(left, right));
}
