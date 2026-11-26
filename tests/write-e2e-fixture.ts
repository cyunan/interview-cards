import { writeFile } from "node:fs/promises";

import { encryptEnvelope } from "../src/crypto/envelope";
import { E2E_PASSWORD, E2E_RESUME_BANK } from "./fixture-payload";

const envelope = await encryptEnvelope(E2E_RESUME_BANK, E2E_PASSWORD, E2E_RESUME_BANK.buildId);
await writeFile(
  new URL("../dist/cards.enc.json", import.meta.url),
  `${JSON.stringify(envelope, null, 2)}\n`,
  "utf8",
);
