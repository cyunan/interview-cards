export async function readHiddenLine(prompt: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("发布密码必须在交互终端中输入");
  }

  return new Promise<string>((resolve, reject) => {
    let value = "";
    let settled = false;
    let rawModeEnabled = false;
    let settle: (result?: string, failure?: unknown) => void;

    const onData = (chunk: string | Buffer) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cancel();
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        value += character;
      }
    };
    const onInputError = (error: unknown) => {
      settle(undefined, error);
    };
    const onInputEnd = () => {
      settle(undefined, new Error("输入流已结束"));
    };
    const onInputClose = () => {
      settle(undefined, new Error("输入流已关闭"));
    };
    const onOutputError = (error: unknown) => {
      settle(undefined, error);
    };
    const cleanup = () => {
      let firstError: unknown;
      const attempt = (action: () => void): boolean => {
        try {
          action();
          return true;
        } catch (error) {
          firstError ??= error;
          return false;
        }
      };

      attempt(() => input.off("data", onData));
      attempt(() => input.off("error", onInputError));
      attempt(() => input.off("end", onInputEnd));
      attempt(() => input.off("close", onInputClose));
      attempt(() => output.off("error", onOutputError));
      attempt(() => input.pause());
      if (rawModeEnabled && attempt(() => input.setRawMode(false))) {
        rawModeEnabled = false;
      }
      return firstError;
    };
    const finish = () => {
      settle(value);
    };
    const cancel = () => {
      settle(undefined, new Error("已取消发布"));
    };
    settle = (result, failure) => {
      if (settled) {
        return;
      }
      settled = true;

      let firstError = failure;
      try {
        output.write("\n");
      } catch (error) {
        firstError ??= error;
      }
      const cleanupError = cleanup();
      firstError ??= cleanupError;

      if (firstError !== undefined) {
        reject(firstError);
      } else {
        resolve(result ?? "");
      }
    };
    try {
      input.setEncoding("utf8");
      input.setRawMode(true);
      rawModeEnabled = true;
      input.on("data", onData);
      input.once("error", onInputError);
      input.once("end", onInputEnd);
      input.once("close", onInputClose);
      output.once("error", onOutputError);
      input.resume();
      if (!settled) {
        output.write(prompt);
      }
    } catch (error) {
      settle(undefined, error);
    }
  });
}
