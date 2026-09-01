import { describe, expect, it } from "vitest";

import {
  formatWeakPublicationPasswordWarning,
  validatePublicationPasswords,
} from "./password";

describe("validatePublicationPasswords", () => {
  it("rejects a passphrase shorter than 8 Unicode code points", () => {
    expect(() => validatePublicationPasswords("abcdefg", "abcdefg")).toThrow(
      "至少 8 个 Unicode code point",
    );
  });

  it("counts an emoji as one code point and accepts 8 code points", () => {
    const warnings: string[] = [];
    const password = "abcdefg🔐";

    expect(
      validatePublicationPasswords(password, password, (length) => {
        warnings.push(formatWeakPublicationPasswordWarning(length));
      }),
    ).toBe(password);
    expect(warnings).toEqual([
      "警告：发布密码长度为 8 个 Unicode code point，低于建议的 16 个。",
    ]);
  });

  it("rejects 7 code points even when the UTF-16 length is 8", () => {
    const password = "abcdef😀";

    expect(() => validatePublicationPasswords(password, password)).toThrow(
      "至少 8 个 Unicode code point",
    );
  });

  it("does not warn for 16 or more Unicode code points", () => {
    const warnings: number[] = [];
    const password = "abcdefghijklmnop";

    expect(
      validatePublicationPasswords(password, password, (length) => {
        warnings.push(length);
      }),
    ).toBe(password);
    expect(warnings).toEqual([]);
  });

  it("rejects two non-matching passphrases", () => {
    expect(
      () =>
        validatePublicationPasswords(
          "fictional-publisher-passphrase-A",
          "fictional-publisher-passphrase-B",
        ),
    ).toThrow("两次输入不一致");
  });

  it("keeps weak-password warning output free of the passphrase", () => {
    const password = "fictional-weak-pass🔐";
    const warning = formatWeakPublicationPasswordWarning([...password].length);

    expect(warning).toContain(`${[...password].length}`);
    expect(warning).not.toContain(password);
    expect(warning).not.toMatch(/hash|sha|digest|[A-Za-z0-9+/]{20,}={0,2}/i);
  });
});
