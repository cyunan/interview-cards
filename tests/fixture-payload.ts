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
      detailMd: `${Array.from(
        { length: 32 },
        (_, index) => `- 虚构校验步骤 ${index + 1}：记录测试相位与状态边界。`,
      ).join("\n")}\n\n\`\`\`mermaid\nflowchart LR\n  A[开始] --> B[结束]\n\`\`\``,
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

const editionDocument = {
  id: "fictional-edition", title: "Sample résumé", sourcePath: "00-个人资料/完整版/示例简历.md",
  reason: "Fictional edition", markdown: "# Sample résumé\n\nA sample for the reader.",
};
const sourceDocument = {
  id: "fictional-handbook", title: "Sample field guide", sourcePath: "01-Imaginary/Field guide.md",
  reason: "Fictional chapter", markdown: "# Sample field guide\n\n## Bench notes\n\nA spare moonstone restores the beacon.",
};
export const E2E_RESUME_BANK = {
  ...E2E_PAYLOAD, schema: "cards-v3", cards: E2E_PAYLOAD.cards.map(card => ({ ...card, legacyIds: [] })),
  documents: [editionDocument, sourceDocument], routes: [],
  resumeEdition: {
    documentId: editionDocument.id,
    html: `<!doctype html><html><head><title>Sample résumé</title>
      <style>.sample-tools { background-color: rgb(239, 245, 249); }</style></head><body>
      <main><h1>Lunar beacon workshop</h1>
      <p class="sample-tools"><span data-interview-topic="lamp">Prism</span> / <span data-interview-topic="dial">Moon dial</span></p>
      <template id="resume-interview-topics">
        <section data-topic="lamp"><h2>How does the prism glow?</h2><p>Turn the light toward the bench.</p>
          <a href="https://interview-cards.invalid/document/fictional-handbook#Bench%20notes">Open the field guide</a>
        </section>
        <section data-topic="dial"><h2>How do crews read the moon dial?</h2><p>Compare the two notches.</p>
          <details><summary>What if one notch fades?</summary><p>Read the spare moonstone.</p></details>
          <a href="https://interview-cards.invalid/document/fictional-handbook#Bench%20notes">Open the field guide</a>
        </section>
      </template></main></body></html>`,
  },
};
