import type { CardV2 } from "../content/types";
import type { CardProgress } from "../study/scheduler";

export interface RouteCheckpoint {
  cardId: string;
  followUpIndex?: number;
}

export interface KnowledgeRouteStep {
  id: string;
  title: string;
  shortTitle?: string;
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
  scenario?: string;
  outcomes?: string[];
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
    summary: "跟着一个商品详情页，从启动请求走到画面上屏，再用这条链路解释更新和掉帧。",
    level: "基础到进阶",
    estimatedMinutes: 70,
    scenario: "打开商品详情页，先显示加载中，数据返回后显示名称和图片，点击收藏改变图标颜色。最后把同一页面换成 Compose，比较哪些步骤变了、哪些仍由 Android 窗口与图形系统完成。这是教学场景，不代表项目经历。",
    outcomes: ["说清 Activity 回调、窗口接入和首帧显示的区别", "解释一次状态更新怎样进入帧调度并最终上屏", "按证据区分排队、布局绘制和渲染端的耗时"],
    steps: [
      {
        id: "runtime-entry",
        shortTitle: "页面启动",
        title: "页面入口：启动请求怎样交到主线程？",
        purpose: "先分清 Activity、Window、View，再跟踪系统请求如何进入应用执行。",
        cardIds: ["android-activity-002", "android-page-001"],
        transition: "Activity 开始执行，并不等于布局已经接入窗口。下一步看 setContentView 之后还缺什么。",
        checkpoint: {
          cardId: "android-page-001", followUpIndex: 1,
        },
      },
      {
        id: "window-attachment",
        shortTitle: "窗口接入",
        title: "窗口接入：布局什么时候成为可显示的页面？",
        purpose: "沿 setContentView、DecorView、ViewRootImpl 追到首帧，解释 onResume 与上屏的时间差。",
        cardIds: ["android-page-002", "android-page-003", "android-page-004"],
        transition: "树接入窗口以后，数据加载完成了。谁可以改这棵树，后台结果又该怎样交回来？",
        checkpoint: { cardId: "android-page-004", followUpIndex: 1 },
      },
      {
        id: "ui-owner",
        shortTitle: "主线程",
        title: "再看执行者：UI 线程如何接住更新？",
        purpose: "理解 Handler、Looper 和 View 线程封闭之间的因果关系。",
        cardIds: ["android-android-001", "android-android-006", "android-android-004"],
        transition: "任务已经排到 UI 线程，并不等于屏幕马上变化；下一步要看一帧什么时候真正开始。",
        checkpoint: {
          cardId: "android-android-004", followUpIndex: 3,
        },
      },
      {
        id: "frame-clock",
        shortTitle: "帧调度",
        title: "把消息接到帧：VSYNC 怎样变成一次遍历？",
        purpose: "用 Choreographer 解释输入、动画、布局和绘制为什么按帧组织。",
        cardIds: ["android-page-005", "android-android-003", "android-page-006"],
        transition: "一帧开始只是调度入口，真正的流畅性还取决于这一帧内的工作量和提交时机。",
        checkpoint: {
          cardId: "android-page-006", followUpIndex: 1,
        },
      },
      {
        id: "draw-to-display",
        shortTitle: "绘制上屏",
        title: "绘制上屏：画完为什么不等于看见？",
        purpose: "把测量、布局、绘制、RenderThread、GPU 和系统合成放在各自的位置上。",
        cardIds: ["android-page-007", "android-page-008", "android-page-009"],
        transition: "传统 View 的链路走通后，再把同一商品页换成 Compose：变化从哪开始，最后又在哪里汇合？",
        checkpoint: { cardId: "android-page-009", followUpIndex: 1 },
      },
      {
        id: "declarative-state",
        shortTitle: "Compose",
        title: "Compose 接入：状态在哪读，更新从哪开始？",
        purpose: "把 View 的命令式更新和 Compose 的状态驱动重组放到同一条渲染链路里比较。",
        cardIds: ["android-compose-001", "android-compose-003", "android-compose-013", "android-page-010"],
        transition: "到这里可以从“谁调用 setText”升级到“状态变化如何产生最小 UI 工作”，再进入性能排查。",
        checkpoint: {
          cardId: "android-page-010", followUpIndex: 1,
        },
      },
      {
        id: "diagnose-frame",
        shortTitle: "综合排查",
        title: "综合排查：沿执行链找到断点和慢点",
        purpose: "用“post 成功但页面没变”和“主线程不忙却掉帧”检验前面六段能否连起来。",
        cardIds: ["android-page-011", "android-page-012"],
        transition: "先复述整条链，再到性能路线深入指标、采样和回归验证。",
        checkpoint: { cardId: "android-page-012", followUpIndex: 1 },
      },
    ],
  },
  {
    id: "async-state-delivery",
    title: "异步结果怎样安全回到页面？",
    summary: "跟着一次连续搜索，解释旧请求、页面重建和后台返回时，结果究竟该交给谁。",
    level: "进阶",
    estimatedMinutes: 55,
    scenario: "先搜索 A，再搜索 B，让 A 最后返回；等待时旋转屏幕，再退到后台一段时间后返回。逐步检查列表、加载提示和错误是否仍对应当前搜索。这是教学场景，不代表项目经历。",
    outcomes: ["区分调度线程、任务寿命和结果归属", "解释停止收集、停止生产与保留缓存的区别", "设计并验证不会被旧请求覆盖的状态交付"],
    steps: [
      {
        id: "execution-model",
        title: "执行模型：线程、协程与调度器",
        purpose: "解释为什么 launch 和 suspend 不能自动移走耗时工作，以及结果如何回到调用方。",
        cardIds: ["kotlin-kotlin-001", "kotlin-kotlin-009", "kotlin-kotlin-011"],
        transition: "执行位置明确后，再问旋转屏幕时任务和控件是否应该一起结束。",
        checkpoint: { cardId: "kotlin-kotlin-011", followUpIndex: 0 },
      },
      {
        id: "lifecycle-owner",
        title: "生命周期：结果应该交给谁？",
        purpose: "把页面 View 的短寿命和 ViewModel 的状态寿命分开。",
        cardIds: ["android-lifecycle-001", "android-viewmodel-001", "android-viewmodel-014", "kotlin-kotlin-034"],
        transition: "页面可以重新接收状态了，但连续搜索时，旧请求应该怎样退出？",
        checkpoint: { cardId: "kotlin-kotlin-034", followUpIndex: 0 },
      },
      {
        id: "cancel-request",
        title: "取消旧请求：谁真正停止了工作？",
        purpose: "沿 Job、挂起等待和底层回调检查取消，区分结束等待与停止外部工作。",
        cardIds: ["kotlin-kotlin-012"],
        transition: "取消单个请求之后，再看页面没有订阅者时，共享上游和缓存会怎样变化。",
        checkpoint: { cardId: "kotlin-kotlin-012", followUpIndex: 0 },
      },
      {
        id: "state-stream",
        title: "后台返回：谁停了，谁还保留着数据？",
        purpose: "分别追踪 UI 收集器、共享上游和缓存，解释回来先看到旧状态的原因。",
        cardIds: ["kotlin-kotlin-028", "kotlin-kotlin-029"],
        transition: "状态能够重放后，下一步判断哪些信息应该保留、哪些允许错过。",
        checkpoint: { cardId: "kotlin-kotlin-029", followUpIndex: 0 },
      },
      {
        id: "state-or-event",
        title: "状态与提示：回来后还需要知道什么？",
        purpose: "用失败重试、短暂提示和导航解释重建后的显示与处理规则。",
        cardIds: ["kotlin-kotlin-035"],
        transition: "最后把任务取消、当前状态和 View 收集拼成可验证的搜索流程。",
        checkpoint: { cardId: "kotlin-kotlin-035", followUpIndex: 0 },
      },
      {
        id: "delivery-boundary",
        title: "交付边界：旧结果为什么不能覆盖新页面？",
        purpose: "把线程安全提升到请求版本、生命周期和数据所有权。",
        cardIds: ["android-fragment-005", "android-fragment-017"],
        transition: "按 A/B 乱序、旋转和后台返回复述并验证这条链路，再进入性能路线。",
        checkpoint: { cardId: "android-fragment-017", followUpIndex: 0 },
      },
    ],
  },
  {
    id: "performance-diagnosis",
    title: "性能问题怎样从现象定位到根因？",
    summary: "从商品页打开慢、滑动抖动和反复进入后变卡，练习怎样用证据缩小问题范围。",
    level: "进阶到高级",
    estimatedMinutes: 65,
    scenario: "商品页先出现骨架屏，价格稍后才可用；滑动图片列表偶尔抖动，反复进入退出后内存上涨。分别定义完成点，记录时间线，提出能被验证或推翻的解释。这些现象不预设同一个根因，数据均为教学示例。",
    outcomes: ["区分局部函数耗时、端到端等待和整帧完成", "根据执行、排队与依赖证据选择下一步检查", "用对照实验和线上分组判断收益与代价"],
    steps: [
      {
        id: "define-metric",
        title: "先定义快：平均值之外看什么？",
        purpose: "建立首帧、P95/P99、掉帧和用户路径的测量口径。",
        shortTitle: "定义体验",
        cardIds: ["android-performance-002"],
        transition: "完成点明确后，把总耗时拆开，找出用户究竟在等哪一段。",
        checkpoint: { cardId: "android-performance-002", followUpIndex: 1 },
      },
      {
        id: "startup-and-frame",
        title: "拆开等待：800ms 究竟耗在哪里？",
        shortTitle: "拆开等待",
        purpose: "把提交、开始、依赖就绪与结果交付对齐，避免把墙钟时间全算成 CPU 工作。",
        cardIds: ["android-performance-001", "android-performance-003"],
        transition: "知道等待发生在哪里之后，用启动链路练习怎样调整依赖。",
        checkpoint: { cardId: "android-performance-003", followUpIndex: 2 },
      },
      {
        id: "startup-dependencies",
        title: "启动依赖：哪些工作必须在首屏之前？",
        shortTitle: "启动依赖",
        purpose: "同时检查首帧、内容可用和首次点击，验证异步初始化的收益与正确性。",
        cardIds: ["android-performance-004", "android-performance-005"],
        transition: "页面能打开后，再沿一帧时间线解释滑动抖动。",
        checkpoint: { cardId: "android-performance-004", followUpIndex: 2 },
      },
      {
        id: "frame-evidence",
        title: "慢帧证据：从迟到的一帧找起",
        shortTitle: "帧时间线",
        purpose: "先确定迟到环节，再区分布局绘制、Compose、图片与列表处理。",
        cardIds: ["android-performance-008", "android-performance-009", "android-performance-010", "android-performance-011"],
        transition: "如果随使用时间逐渐恶化，继续检查存活对象、分配与任务积压。",
        checkpoint: { cardId: "android-performance-008", followUpIndex: 2 },
      },
      {
        id: "memory-and-queue",
        title: "内存与队列：看似后台的问题怎样拖住 UI？",
        purpose: "区分泄漏、缓存膨胀、GC 抖动和线程池积压。",
        shortTitle: "资源趋势",
        cardIds: ["android-performance-012", "android-performance-013", "android-performance-014"],
        transition: "找到候选根因后，必须用同一用户路径复测，确认优化没有把问题挪到别处。",
        checkpoint: { cardId: "android-performance-012", followUpIndex: 2 },
      },
      {
        id: "production-proof",
        title: "线上证明：没有完整堆栈也能继续排查",
        purpose: "把 Release 符号化、埋点和前后对照纳入闭环。",
        shortTitle: "回归验证",
        cardIds: ["android-performance-015", "android-performance-016"],
        transition: "完成这条路线后，可以把同样的证据链用到网络耗时和弱网治理。",
        checkpoint: { cardId: "android-performance-016", followUpIndex: 2 },
      },
    ],
  },
  {
    id: "network-request-lifecycle",
    title: "一次网络请求到底经历了什么？",
    summary: "跟着商品加载与一次订单提交，区分连接、网络交换和业务结果，判断慢在哪里、失败后能做什么。",
    level: "基础到进阶",
    estimatedMinutes: 50,
    scenario: "首次打开商品页，再次打开观察缓存与连接复用；随后提交订单，模拟服务端已处理但响应丢失。把两种用户操作放在同一条请求链中，比较观测和恢复策略。这是教学场景，不代表项目经历。",
    outcomes: ["区分业务操作、Call、网络交换和连接的计数口径", "沿传输、转换和协程恢复解释结果如何交回页面", "根据结果确定性、幂等协议和剩余预算判断能否重试"],
    steps: [
      {
        id: "name-to-connection",
        shortTitle: "连接准备",
        title: "从域名到连接：DNS、TCP、TLS",
        purpose: "先把网络耗时拆成名字解析、建连和安全握手。",
        cardIds: ["network-6db9761a-001", "network-coding-v3-037", "network-coding-v3-013"],
        transition: "连接建立后，请求还要经过客户端的调度、拦截和响应体生命周期。",
        checkpoint: { cardId: "network-6db9761a-001", followUpIndex: 0 },
      },
      {
        id: "client-pipeline",
        shortTitle: "请求交换",
        title: "客户端管线：OkHttp 怎样决定请求路径",
        purpose: "按拦截器、连接复用、缓存和 Dispatcher 解释客户端行为。",
        cardIds: ["framework-okhttp-005", "framework-okhttp-006", "framework-okhttp-007", "framework-okhttp-015"],
        transition: "OkHttp 负责传输，但接口描述和数据转换属于 Retrofit。",
        checkpoint: { cardId: "framework-okhttp-005", followUpIndex: 0 },
      },
      {
        id: "api-adapter",
        shortTitle: "结果交付",
        title: "接口适配：Retrofit 如何接入协程",
        purpose: "理解动态代理、Converter、CallAdapter 和取消语义的分工。",
        cardIds: ["framework-retrofit-001", "framework-retrofit-003", "framework-retrofit-008", "framework-retrofit-010"],
        transition: "最后把传输错误、解析错误和业务错误分层，才能谈重试和降级。",
        checkpoint: { cardId: "framework-retrofit-010", followUpIndex: 0 },
      },
      {
        id: "failure-contract",
        shortTitle: "失败恢复",
        title: "失败契约：什么能重试，什么不能？",
        purpose: "按错误层次、幂等性、超时和取消设计恢复策略。",
        cardIds: ["framework-okhttp-009", "framework-okhttp-022", "framework-okhttp-023"],
        transition: "请求链路闭环后，再按项目真实场景选择缓存、并发和观测策略。",
        checkpoint: { cardId: "framework-okhttp-022", followUpIndex: 0 },
      },
    ],
  },
  {
    id: "architecture-evolution",
    title: "架构为什么要演进，而不是换名词？",
    summary: "用编辑商品、保存与恢复的过程，判断数据由谁负责，哪些规则需要比页面回调更明确的约束。",
    level: "进阶到高级",
    estimatedMinutes: 45,
    scenario: "编辑商品名称，保存时旋转页面，再模拟重复点击、旧结果迟到和离线恢复。逐步检查草稿、已保存数据与提交状态分别由谁维护。这是教学场景，不代表项目经历。",
    outcomes: ["从具体失败说明为什么需要职责边界，而不是只比较模式名", "区分页面草稿、持久化事实和提交过程", "用一条可测试、可回退的业务路径验证架构调整"],
    steps: [
      {
        id: "boundary-problem",
        shortTitle: "找到边界",
        title: "先看问题：页面为什么会失控？",
        purpose: "识别视图、状态、导航和副作用混在一起时的具体代价。",
        cardIds: ["android-mvc-mvp-mvvm-mvi-001", "android-activity-022"],
        transition: "问题边界清楚后，再比较不同架构把 owner 放在哪里。",
        checkpoint: { cardId: "android-mvc-mvp-mvvm-mvi-001", followUpIndex: 0 },
      },
      {
        id: "state-owner",
        shortTitle: "数据归属",
        title: "状态 owner：ViewModel、Repository 与 UI",
        purpose: "把状态寿命、数据来源和渲染订阅分开。",
        cardIds: ["android-viewmodel-001", "android-viewmodel-005", "android-room-compose-001", "android-room-compose-003"],
        transition: "状态 owner 确定后，才能讨论事件、状态机和不可变更新。",
        checkpoint: { cardId: "android-room-compose-001", followUpIndex: 0 },
      },
      {
        id: "explicit-state",
        shortTitle: "提交规则",
        title: "显式状态：MVI 与业务状态机",
        purpose: "用事件、状态和副作用解释何时值得引入更强约束。",
        cardIds: ["design-fsm-001", "kotlin-kotlin-019", "kotlin-kotlin-035"],
        transition: "最后回到真实项目，说明选型依据和迁移边界，而不是背模式定义。",
        checkpoint: { cardId: "design-fsm-001", followUpIndex: 0 },
      },
      {
        id: "project-tradeoff",
        shortTitle: "渐进落地",
        title: "工程落地：架构约束怎样服务变化",
        purpose: "把模块边界、测试成本、迁移策略和团队协作纳入回答。",
        cardIds: ["android-mvc-mvp-mvvm-mvi-015", "android-mvc-mvp-mvvm-mvi-016"],
        transition: "完成后可把这套“问题—约束—取舍—验证”框架迁移到跨端路线。",
        checkpoint: { cardId: "android-mvc-mvp-mvvm-mvi-015", followUpIndex: 0 },
      },
    ],
  },
  {
    id: "cross-platform-boundaries",
    title: "跨端共享的边界怎样划？",
    summary: "用扫码后加载详情的过程，划分共享规则与平台实现，并验证两端是否遵守同一行为约定。",
    level: "进阶",
    estimatedMinutes: 35,
    scenario: "Android 与 iOS 扫码后加载商品详情，分别经历权限拒绝、用户关闭、等待中退出和重新进入。保持业务规则一致，同时检查相机、网络和生命周期差异。这是教学场景，不代表项目经历。",
    outcomes: ["根据行为和变化范围决定共享什么，而不是追求复用率", "解释 source set、平台接口与 expect/actual 的不同职责", "把共享逻辑测试与两端设备验收分开设计"],
    steps: [
      {
        id: "shared-shape",
        shortTitle: "共享范围",
        title: "先定共享形态：共享什么，不共享什么？",
        purpose: "把业务规则、数据访问和 UI 共享拆开讨论。",
        cardIds: ["extended-kotlin-multiplatform-kmp-001", "extended-kotlin-multiplatform-kmp-004", "extended-kotlin-multiplatform-kmp-005"],
        transition: "确定共享形态后，再进入 source set 与 expect/actual 的具体边界。",
        checkpoint: { cardId: "extended-kotlin-multiplatform-kmp-001", followUpIndex: 0 },
      },
      {
        id: "platform-boundary",
        shortTitle: "平台实现",
        title: "平台边界：expect/actual 解决哪类差异？",
        purpose: "用依赖倒置而不是到处判断平台来组织差异实现。",
        cardIds: ["extended-kotlin-multiplatform-kmp-002", "extended-kotlin-multiplatform-kmp-003"],
        transition: "平台能力接入后，还要看网络、序列化和调度器怎样落在各平台。",
        checkpoint: { cardId: "extended-kotlin-multiplatform-kmp-003", followUpIndex: 0 },
      },
      {
        id: "runtime-contract",
        shortTitle: "运行验收",
        title: "运行时契约：网络与协程如何跨平台？",
        purpose: "理解 common API、平台 engine 和 Main 调度的组合。",
        cardIds: ["extended-kotlin-multiplatform-kmp-007", "extended-kotlin-multiplatform-kmp-009"],
        transition: "最后用项目约束验证共享边界，而不是为了复用率牺牲平台体验。",
        checkpoint: { cardId: "extended-kotlin-multiplatform-kmp-009", followUpIndex: 0 },
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

export function resolveRouteCheckpoint(step: KnowledgeRouteStep, cards: ReadonlyArray<CardV2>) {
  const checkpoint = step.checkpoint;
  const card = cards.find((item) => item.id === checkpoint?.cardId);
  if (!card || !checkpoint) return undefined;
  if (checkpoint.followUpIndex !== undefined) return card.followUps[checkpoint.followUpIndex];
  return { question: card.question, answerMd: card.quickAnswerMd };
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
    totalCards += step.cardIds.length;
    const reviewed = availableCards.filter((card) => (progress.get(card.id)?.reviewCount ?? 0) > 0);
    reviewedCards += reviewed.length;
    const isComplete = step.cardIds.length > 0 && reviewed.length === step.cardIds.length;
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
