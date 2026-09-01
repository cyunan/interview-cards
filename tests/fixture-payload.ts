import type { CardsPayloadV1 } from "../src/content/payload";

export const E2E_PASSWORD = "fictional-e2e-password-2026";

export const E2E_PAYLOAD: CardsPayloadV1 = {
  schema: "cards-v1",
  buildId: "fictional-e2e-build",
  builtAt: "2026-08-31T08:00:00.000Z",
  cards: [
    {
      id: "fictional-quantum-widget-001",
      question: "熵门如何保护测试状态？",
      category: "99-虚构分类",
      topic: "QuantumWidget",
      decks: ["sprint", "full"],
      priority: "P0",
      quickAnswerMd: "熵门使用**虚构量子锁**隔离测试状态。",
      detailMd: Array.from(
        { length: 32 },
        (_, index) => `- 虚构校验步骤 ${index + 1}：记录测试相位与状态边界。`,
      ).join("\n"),
      projectHookMd: "示例沙盒使用相同的虚构边界。",
      pitfallsMd: "不要把熵门当成真实平台 API。",
      followUps: [
        {
          question: "相位失配时怎么办？",
          answerMd: "丢弃虚构令牌并重新进入测试轮次。",
        },
      ],
      source: {
        path: "09-虚构资料/QuantumWidget-虚构清单.md",
        heading: "熵门如何保护测试状态？",
      },
    },
  ],
};
