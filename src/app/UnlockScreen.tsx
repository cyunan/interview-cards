import { useState, type FormEvent } from "react";

interface UnlockScreenProps {
  onUnlock(password: string): Promise<void>;
}

export function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!password || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onUnlock(password);
      setPassword("");
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "解锁失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="unlock-shell">
      <section className="unlock-card" aria-labelledby="unlock-title">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">INTERVIEW CARDS</p>
        <h1 id="unlock-title">解锁题库</h1>
        <p className="unlock-intro">
          题目和回答只会在这台设备的内存中解密。关闭或锁定后，需要重新输入密码。
        </p>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="card-password">
            题库密码
          </label>
          <input
            id="card-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            autoFocus
          />
          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <button className="primary-button unlock-button" type="submit" disabled={busy || !password}>
            {busy ? "正在解锁…" : "解锁"}
          </button>
        </form>

        <div className="security-note">
          <span aria-hidden="true">◆</span>
          <p>密码不会上传，也不会写入浏览器存储。</p>
        </div>
      </section>
    </main>
  );
}
