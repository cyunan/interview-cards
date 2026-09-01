export async function readHiddenLine(prompt: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("发布密码必须在交互终端中输入");
  }

  return new Promise<string>((resolve, reject) => {
    let value = "";
    let rawModeEnabled = false;
    const cleanup = () => {
      input.off("data", onData);
      input.pause();
      if (rawModeEnabled) {
        rawModeEnabled = false;
        input.setRawMode(false);
      }
    };
    const finish = () => {
      try {
        cleanup();
        output.write("\n");
        resolve(value);
      } catch (error) {
        reject(error);
      }
    };
    const cancel = () => {
      try {
        cleanup();
        output.write("\n");
        reject(new Error("已取消发布"));
      } catch (error) {
        reject(error);
      }
    };
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
    try {
      input.setEncoding("utf8");
      input.setRawMode(true);
      rawModeEnabled = true;
      input.on("data", onData);
      input.resume();
      output.write(prompt);
    } catch (error) {
      try {
        cleanup();
      } catch {
        // Preserve the original setup error while making a best effort to restore the TTY.
      }
      reject(error);
    }
  });
}
