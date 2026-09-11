import type { CardV2 } from "../content/types";
import type { CardProgress } from "../study/scheduler";

export interface RouteCheckpoint {
  cardId: string;
}

export interface KnowledgeRouteStep {
  id: string;
  title: string;
  purpose: string;
  cardIds: string[];
  transition: string;
  checkpoint?: RouteCheckpoint;
}

export interface KnowledgeRoute {
  id: string;
  title: string;
  summary: string;
  level: string;
  estimatedMinutes: number;
  steps: KnowledgeRouteStep[];
}

export interface RouteProgressSummary {
  completedSteps: number;
  nextStepIndex: number;
  reviewedCards: number;
  totalCards: number;
}

/**
 * Routes describe relationships between cards. They intentionally contain no
 * answer text, so the encrypted card payload remains the single content source.
 */
export const KNOWLEDGE_ROUTES: KnowledgeRoute[] = [
  {
    id: "android-page-rendering",
    title: "Android 页面是怎样跑起来的？",
    summary: "从 Activity 入口一路走到 UI 线程、VSYNC 和 Compose 状态，建立一条能口述的首帧链路。",
    level: "基础到进阶",
    estimatedMinutes: 35,
    steps: [
      {
        id: "runtime-entry",
        title: "先画边界：谁负责页面，谁负责像素？",
        purpose: "把 Activity、Window、View 从“一个页面”里拆成三层职责。",
        cardIds: ["android-activity-002", "android-activity-003"],
        transition: "知道页面由谁承载后，再追问这些对象由哪个线程修改，以及消息如何送到那里。",
        checkpoint: {
          cardId: "android-activity-002",
        },
      },
      {
        id: "ui-owner",
        title: "再看执行者：UI 线程如何接住更新？",
        purpose: "理解 Handler、Looper 和 View 线程封闭之间的因果关系。",
        cardIds: ["android-android-001", "android-android-004", "android-android-006"],
        transition: "任务已经排到 UI 线程，并不等于屏幕马上变化；下一步要看一帧什么时候真正开始。",
        checkpoint: {
          cardId: "android-android-004",
        },
      },
      {
        id: "frame-clock",
        title: "把消息接到帧：VSYNC 怎样变成一次遍历？",
        purpose: "用 Choreographer 解释输入、动画、布局和绘制为什么按帧组织。",
        cardIds: ["android-android-003"],
        transition: "一帧开始只是调度入口，真正的流畅性还取决于这一帧内的工作量和提交时机。",
        checkpoint: {
          cardId: "android-android-003",
        },
      },
      {
        id: "declarative-state",
        title: "最后看 Compose：状态怎样重新进入这条链？",
        purpose: "把 View 的命令式更新和 Compose 的状态驱动重组放到同一条渲染链路里比较。",
        cardIds: ["android-compose-007", "android-compose-004", "android-compose-008"],
        transition: "到这里可以从“谁调用 setText”升级到“状态变化如何产生最小 UI 工作”，再进入性能排查。",
        checkpoint: {
          cardId: "android-compose-007",
        },
      },
    ],
  },
  {
    id: "async-state-delivery",
    title: "异步结果怎样安全回到页面？",
    summary: "从线程与协程开始，经过生命周期、ViewModel、Flow，最后落到一次不会污染新页面的状态交付。",
    level: "进阶",
    estimatedMinutes: 40,
    steps: [
      {
        id: "execution-model",
        title: "执行模型：线程、协程与调度器",
        purpose: "先分清并发单位、执行线程和调度策略。",
        cardIds: ["kotlin-kotlin-001", "kotlin-kotlin-009", "kotlin-kotlin-011"],
        transition: "有了执行模型，才能判断取消、异常和结果交付究竟由谁负责。",
      },
      {
        id: "lifecycle-owner",
        title: "生命周期：结果应该交给谁？",
        purpose: "把页面 View 的短寿命和 ViewModel 的状态寿命分开。",
        cardIds: ["android-lifecycle-001", "android-viewmodel-001", "android-viewmodel-014"],
        transition: "状态 owner 稳定后，再决定页面在可见期间如何收集，以及旧请求如何退出。",
      },
      {
        id: "state-stream",
        title: "状态流：最新状态和一次性事件怎么分？",
        purpose: "用 Flow、StateFlow 和 SharedFlow 解释状态重放与事件消费。",
        cardIds: ["kotlin-kotlin-020", "kotlin-kotlin-028", "kotlin-kotlin-035"],
        transition: "最后把请求编号、取消和页面重建放进一次完整交付链路。",
      },
      {
        id: "delivery-boundary",
        title: "交付边界：旧结果为什么不能覆盖新页面？",
        purpose: "把线程安全提升到请求版本、生命周期和数据所有权。",
        cardIds: ["android-fragment-005", "android-fragment-017", "android-android-014"],
        transition: "能解释旧结果淘汰后，再进入性能路线看队列和帧预算。",
      },
    ],
  },
  {
    id: "performance-diagnosis",
    title: "性能问题怎样从现象定位到根因？",
    summary: "不背优化清单，按指标、分段、证据和回归验证走一遍性能排查。",
    level: "进阶到高级",
    estimatedMinutes: 45,
    steps: [
      {
        id: "define-metric",
        title: "先定义快：平均值之外看什么？",
        purpose: "建立首帧、P95/P99、掉帧和用户路径的测量口径。",
        cardIds: ["android-performance-002", "android-performance-016"],
        transition: "指标明确后，再把启动、帧和内存问题分开测量。",
      },
      {
        id: "startup-and-frame",
        title: "启动与帧：慢在哪里就量哪里",
        purpose: "区分执行慢、排队慢、依赖慢，以及测量、布局、绘制的不同证据。",
        cardIds: ["android-performance-001", "android-performance-003", "android-performance-004", "android-performance-009"],
        transition: "如果主线程不忙但页面仍不稳，就继续看内存、GC 和后台任务积压。",
      },
      {
        id: "memory-and-queue",
        title: "内存与队列：看似后台的问题怎样拖住 UI？",
        purpose: "区分泄漏、缓存膨胀、GC 抖动和线程池积压。",
        cardIds: ["android-performance-012", "android-performance-013", "android-performance-014", "android-anr-002"],
        transition: "找到候选根因后，必须用同一用户路径复测，确认优化没有把问题挪到别处。",
      },
      {
        id: "production-proof",
        title: "线上证明：没有完整堆栈也能继续排查",
        purpose: "把 Release 符号化、埋点和前后对照纳入闭环。",
        cardIds: ["android-performance-015", "android-anr-001", "android-android-017"],
        transition: "完成这条路线后，可以把同样的证据链用到网络耗时和弱网治理。",
      },
    ],
  },
  {
    id: "network-request-lifecycle",
    title: "一次网络请求到底经历了什么？",
    summary: "从 DNS、TCP、TLS 到 OkHttp、Retrofit 和业务错误，把网络题串成请求的完整生命周期。",
    level: "基础到进阶",
    estimatedMinutes: 50,
    steps: [
      {
        id: "name-to-connection",
        title: "从域名到连接：DNS、TCP、TLS",
        purpose: "先把网络耗时拆成名字解析、建连和安全握手。",
        cardIds: ["network-6db9761a-001", "network-coding-v3-037", "network-coding-v3-013"],
        transition: "连接建立后，请求还要经过客户端的调度、拦截和响应体生命周期。",
      },
      {
        id: "client-pipeline",
        title: "客户端管线：OkHttp 怎样决定请求路径",
        purpose: "按拦截器、连接复用、缓存和 Dispatcher 解释客户端行为。",
        cardIds: ["framework-okhttp-005", "framework-okhttp-006", "framework-okhttp-007", "framework-okhttp-015"],
        transition: "OkHttp 负责传输，但接口描述和数据转换属于 Retrofit。",
      },
      {
        id: "api-adapter",
        title: "接口适配：Retrofit 如何接入协程",
        purpose: "理解动态代理、Converter、CallAdapter 和取消语义的分工。",
        cardIds: ["framework-retrofit-001", "framework-retrofit-003", "framework-retrofit-008", "framework-retrofit-010"],
        transition: "最后把传输错误、解析错误和业务错误分层，才能谈重试和降级。",
      },
      {
        id: "failure-contract",
        title: "失败契约：什么能重试，什么不能？",
        purpose: "按错误层次、幂等性、超时和取消设计恢复策略。",
        cardIds: ["framework-okhttp-009", "framework-okhttp-022", "framework-okhttp-023"],
        transition: "请求链路闭环后，再按项目真实场景选择缓存、并发和观测策略。",
      },
    ],
  },
  {
    id: "architecture-evolution",
    title: "架构为什么要演进，而不是换名词？",
    summary: "从 MVC 的边界问题到 MVVM、MVI 和状态机，按状态 owner 与副作用治理理解架构选择。",
    level: "进阶到高级",
    estimatedMinutes: 45,
    steps: [
      {
        id: "boundary-problem",
        title: "先看问题：页面为什么会失控？",
        purpose: "识别视图、状态、导航和副作用混在一起时的具体代价。",
        cardIds: ["android-mvc-mvp-mvvm-mvi-001", "android-activity-022"],
        transition: "问题边界清楚后，再比较不同架构把 owner 放在哪里。",
      },
      {
        id: "state-owner",
        title: "状态 owner：ViewModel、Repository 与 UI",
        purpose: "把状态寿命、数据来源和渲染订阅分开。",
        cardIds: ["android-viewmodel-001", "android-viewmodel-005", "android-room-compose-001", "android-room-compose-003"],
        transition: "状态 owner 确定后，才能讨论事件、状态机和不可变更新。",
      },
      {
        id: "explicit-state",
        title: "显式状态：MVI 与业务状态机",
        purpose: "用事件、状态和副作用解释何时值得引入更强约束。",
        cardIds: ["design-fsm-001", "kotlin-kotlin-019", "kotlin-kotlin-035"],
        transition: "最后回到真实项目，说明选型依据和迁移边界，而不是背模式定义。",
      },
      {
        id: "project-tradeoff",
        title: "工程落地：架构约束怎样服务变化",
        purpose: "把模块边界、测试成本、迁移策略和团队协作纳入回答。",
        cardIds: ["android-mvc-mvp-mvvm-mvi-015", "android-mvc-mvp-mvvm-mvi-016"],
        transition: "完成后可把这套“问题—约束—取舍—验证”框架迁移到跨端路线。",
      },
    ],
  },
  {
    id: "cross-platform-boundaries",
    title: "跨端共享的边界怎样划？",
    summary: "从 KMP 的 source set 到平台能力注入，回答哪些代码该共享、哪些差异应该保留。",
    level: "进阶",
    estimatedMinutes: 35,
    steps: [
      {
        id: "shared-shape",
        title: "先定共享形态：共享什么，不共享什么？",
        purpose: "把业务规则、数据访问和 UI 共享拆开讨论。",
        cardIds: ["extended-kotlin-multiplatform-kmp-001", "extended-kotlin-multiplatform-kmp-004", "extended-kotlin-multiplatform-kmp-005"],
        transition: "确定共享形态后，再进入 source set 与 expect/actual 的具体边界。",
      },
      {
        id: "platform-boundary",
        title: "平台边界：expect/actual 解决哪类差异？",
        purpose: "用依赖倒置而不是到处判断平台来组织差异实现。",
        cardIds: ["extended-kotlin-multiplatform-kmp-002", "extended-kotlin-multiplatform-kmp-003"],
        transition: "平台能力接入后，还要看网络、序列化和调度器怎样落在各平台。",
      },
      {
        id: "runtime-contract",
        title: "运行时契约：网络与协程如何跨平台？",
        purpose: "理解 common API、平台 engine 和 Main 调度的组合。",
        cardIds: ["extended-kotlin-multiplatform-kmp-007", "extended-kotlin-multiplatform-kmp-009"],
        transition: "最后用项目约束验证共享边界，而不是为了复用率牺牲平台体验。",
      },
    ],
  },
];

export function resolveRouteCards(
  step: KnowledgeRouteStep,
  cards: ReadonlyArray<CardV2>,
): CardV2[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return step.cardIds.flatMap((id) => {
    const card = cardsById.get(id);
    return card ? [card] : [];
  });
}

export function getRouteProgress(
  route: KnowledgeRoute,
  cards: ReadonlyArray<CardV2>,
  progress: ReadonlyMap<string, CardProgress>,
): RouteProgressSummary {
  let completedSteps = 0;
  let reviewedCards = 0;
  let totalCards = 0;
  const completed = route.steps.map((step) => {
    const availableCards = resolveRouteCards(step, cards);
    totalCards += availableCards.length;
    const reviewed = availableCards.filter((card) => (progress.get(card.id)?.reviewCount ?? 0) > 0);
    reviewedCards += reviewed.length;
    const isComplete = availableCards.length > 0 && reviewed.length === availableCards.length;
    if (isComplete) completedSteps += 1;
    return isComplete;
  });
  const nextStepIndex = Math.max(0, completed.findIndex((done) => !done));
  return {
    completedSteps,
    nextStepIndex: nextStepIndex === 0 && completed.every(Boolean) ? route.steps.length - 1 : nextStepIndex,
    reviewedCards,
    totalCards,
  };
}
