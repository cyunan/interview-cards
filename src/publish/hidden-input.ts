export async function readHiddenLine(prompt: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("发布密码必须在交互终端中输入");
  }

  output.write(prompt);
  input.setEncoding("utf8");
  input.setRawMode(true);
  input.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };
    const finish = () => {
      cleanup();
      output.write("\n");
      resolve(value);
    };
    const cancel = () => {
      cleanup();
      output.write("\n");
      reject(new Error("已取消发布"));
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
    input.on("data", onData);
  });
}
