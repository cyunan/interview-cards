import { spawn } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const prompt = "PTY_PROMPT>";
const ptyPassword = "fictional-pty-secret";
const childSource = `
import { readHiddenLine } from "./src/publish/hidden-input.ts";

const originalSetRawMode = process.stdin.setRawMode.bind(process.stdin);
let firstRawModeCall = true;
process.stdin.setRawMode = (mode) => {
  if (mode && firstRawModeCall) {
    firstRawModeCall = false;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  return originalSetRawMode(mode);
};

const mode = process.env.PTY_TEST_MODE;
if (mode === "stdin-error" || mode === "stdin-end" || mode === "stdin-close") {
  setImmediate(() => {
    if (mode === "stdin-error") {
      process.stdin.emit("error", new Error("fictional stdin failure"));
    } else {
      process.stdin.emit(mode === "stdin-end" ? "end" : "close");
    }
  });
}
if (mode === "pause-error") {
  process.stdin.pause = () => {
    throw new Error("fictional pause failure");
  };
}

try {
  await readHiddenLine(${JSON.stringify(prompt)});
  process.stdout.write("\\nDONE\\n");
} catch (error) {
  process.stdout.write(
    "\\nCANCELLED:" + (error instanceof Error ? error.message : "unknown") + "\\n",
  );
} finally {
  process.stdout.write(
    "STATE:" + String(process.stdin.isRaw) + ":" + String(process.stdin.isTTY) + "\\n",
  );
  process.stdin.destroy();
}
`;

async function runPty(input: string, mode = "normal"): Promise<string> {
  const command = [
    process.execPath,
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    childSource,
  ];
  const ptyRelaySource = `
import os
import pty
import select
import sys
import termios

pid, master = pty.fork()
if pid == 0:
    os.execvpe(sys.argv[1], sys.argv[1:], os.environ)

while True:
    readable, _, _ = select.select([master, sys.stdin.buffer], [], [])
    if master in readable:
        try:
            data = os.read(master, 4096)
        except OSError:
            break
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
    if sys.stdin.buffer in readable:
        data = sys.stdin.buffer.read1(4096)
        if not data:
            break
        os.write(master, data)

_, status = os.waitpid(pid, 0)
try:
    attrs = termios.tcgetattr(master)
    echo = bool(attrs[3] & termios.ECHO)
    icanon = bool(attrs[3] & termios.ICANON)
    sys.stdout.write("TERMIOS:" + str(echo).lower() + ":" + str(icanon).lower() + "\\n")
    sys.stdout.flush()
except OSError:
    pass
if os.WIFEXITED(status):
    sys.exit(os.WEXITSTATUS(status))
if os.WIFSIGNALED(status):
    sys.exit(128 + os.WTERMSIG(status))
sys.exit(1)
`;
  const child = spawn("python3", ["-c", ptyRelaySource, ...command], {
    cwd: path.resolve("."),
    env: { ...process.env, PTY_TEST_MODE: mode },
    stdio: ["pipe", "pipe", "pipe"],
  });

  return new Promise<string>((resolve, reject) => {
    let output = "";
    let sent = false;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`PTY test timed out; output was ${JSON.stringify(output)}`));
    }, 5_000);
    const onOutput = (chunk: Buffer | string) => {
      output += String(chunk);
      if (!sent && output.includes(prompt)) {
        sent = true;
        if (input) {
          child.stdin.write(input);
        }
      }
    };
    child.stdout.on("data", onOutput);
    child.stderr.on("data", onOutput);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`PTY test exited with ${code}; output was ${JSON.stringify(output)}`));
        return;
      }
      resolve(output);
    });
  });
}

describe("readHiddenLine in a real PTY", () => {
  it("does not echo input sent immediately after the prompt and restores TTY state", async () => {
    const output = await runPty(`${ptyPassword}\n`);

    expect(output).toContain("DONE");
    expect(output).toContain("STATE:false:true");
    expect(output).toContain("TERMIOS:true:true");
    expect(output).not.toContain(ptyPassword);
  });

  it("restores TTY state when Ctrl-C cancels hidden input", async () => {
    const output = await runPty("\u0003");

    expect(output).toContain("CANCELLED:已取消发布");
    expect(output).toContain("STATE:false:true");
    expect(output).toContain("TERMIOS:true:true");
  });

  it.each([
    { mode: "stdin-error", error: "fictional stdin failure" },
    { mode: "stdin-end", error: "输入流已结束" },
    { mode: "stdin-close", error: "输入流已关闭" },
  ])(
    "settles and restores TTY state on $mode",
    async ({ mode, error }) => {
      const output = await runPty("", mode);

      expect(output).toContain(`CANCELLED:${error}`);
      expect(output).toContain("STATE:false:true");
      expect(output).toContain("TERMIOS:true:true");
    },
  );

  it("settles and restores TTY state when pause throws", async () => {
    const output = await runPty("\n", "pause-error");

    expect(output).toContain("CANCELLED:fictional pause failure");
    expect(output).toContain("STATE:false:true");
    expect(output).toContain("TERMIOS:true:true");
  });
});
