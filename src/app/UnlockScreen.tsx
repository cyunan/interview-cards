import { useState, type FormEvent } from "react";

interface UnlockScreenProps {
  onUnlock(password: string, rememberDevice: boolean): Promise<void>;
}

export function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
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
      await onUnlock(password, rememberDevice);
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
          题目和回答只会在本机解密。默认关闭或锁定后需要重新输入密码，也可以选择记住此设备。
        </p>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="card-password">
            题库密码
          </label>
          <input
            id="card-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            autoFocus
          />
          <label className="remember-device">
            <input
              type="checkbox"
              aria-label="记住此设备"
              checked={rememberDevice}
              onChange={(event) => setRememberDevice(event.target.checked)}
              disabled={busy}
            />
            <span>
              <strong>记住此设备</strong>
              <small>刷新时免输密码；发布新版本后可能需要重新验证</small>
            </span>
          </label>
          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <button className="primary-button unlock-button" type="submit" disabled={busy || !password}>
            {busy ? "正在解锁…" : "解锁"}
          </button>
        </form>

        <div className="security-note">
          <span aria-hidden="true">◆</span>
          <p>密码不会上传或写入浏览器存储；勾选后仅保存本机不可导出的解锁密钥。</p>
        </div>
      </section>
    </main>
  );
}
