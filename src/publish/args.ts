export function parseVaultArgument(args: string[]): string {
  let vault: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--password" || argument.startsWith("--password=")) {
      throw new Error("密码不能通过命令行参数传入");
    }
    if (argument !== "--vault") {
      throw new Error(`未知参数 ${argument}`);
    }
    if (vault !== undefined) {
      throw new Error("--vault 只能提供一次");
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("缺少 --vault <path>");
    }
    vault = value;
    index += 1;
  }
  if (!vault) {
    throw new Error("缺少 --vault <path>");
  }
  return vault;
}
