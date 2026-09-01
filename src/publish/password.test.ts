import { describe, expect, it } from "vitest";

import { validatePublicationPasswords } from "./password";

describe("validatePublicationPasswords", () => {
  it("accepts matching strong Unicode passphrases", () => {
    expect(
      validatePublicationPasswords(
        "correct horse 电池订书钉🔐",
        "correct horse 电池订书钉🔐",
      ),
    ).toBe("correct horse 电池订书钉🔐");
  });

  it("rejects short or mismatched passphrases", () => {
    expect(() => validatePublicationPasswords("短密码", "短密码")).toThrow(
      "至少 16 个字符",
    );
    expect(() =>
      validatePublicationPasswords(
        "这是一个足够长而且仅用于发布的密码-1",
        "这是一个足够长而且仅用于发布的密码-2",
      ),
    ).toThrow("两次输入不一致");
  });
});
