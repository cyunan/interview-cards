import { describe, expect, it } from "vitest";

import { parseVaultArgument } from "./args";

describe("parseVaultArgument", () => {
  it("accepts only an explicit vault path", () => {
    expect(parseVaultArgument(["--vault", "../private-vault"])).toBe(
      "../private-vault",
    );
  });

  it("rejects password arguments and unknown flags", () => {
    expect(() =>
      parseVaultArgument(["--vault", "../vault", "--password", "secret"]),
    ).toThrow("密码不能通过命令行参数传入");
    expect(() => parseVaultArgument(["--vault", "../vault", "--write"])).toThrow(
      "未知参数 --write",
    );
  });

  it("requires --vault", () => {
    expect(() => parseVaultArgument([])).toThrow("缺少 --vault <path>");
  });
});
