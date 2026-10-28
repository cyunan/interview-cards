import os from "node:os";
import path from "node:path";
export const PREVIEW_VAULT = path.join(os.tmpdir(), "interview-cards-local-e2e");
export const PREVIEW_NOTE = [
  "---", "site_doc_id: imaginary-reference", "---", "# Imaginary reference",
  "%%card-id: imaginary-live-001; priority: P1; decks: full%%",
  "### Imaginary live question?", "", "> [!summary] Answer", "> Imaginary live answer version one.", "",
  "#### 深入理解", "", "| Part | Role |", "| --- | --- |", "| Orb | Spin |", "",
  "![[orb.png]]", "",
  "~~~mermaid", "flowchart LR", " A[Orb] --> B[Spin]", "~~~",
].join("\n");
