import { useRef, useState, type ChangeEvent } from "react";

import type { CardV2 } from "../content/types";
import type { DailyLimit, ProgressStore } from "../storage/progress";
import { toLocalDateKey } from "../study/scheduler";

interface SettingsScreenProps {
  cards: ReadonlyArray<Pick<CardV2, "id" | "legacyIds">>;
  dailyLimit: DailyLimit;
  store: ProgressStore;
  now(): Date;
  onDailyLimit(limit: DailyLimit): void;
  onProgressChanged(): Promise<void>;
  onLock(): void;
}

const DAILY_LIMITS: DailyLimit[] = [10, 20, 30, 50];

export function SettingsScreen({
  cards,
  dailyLimit,
  store,
  now,
  onDailyLimit,
  onProgressChanged,
  onLock,
}: SettingsScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>();

  async function changeLimit(value: number): Promise<void> {
    if (!DAILY_LIMITS.includes(value as DailyLimit)) {
      return;
    }
    const limit = value as DailyLimit;
    await store.setDailyLimit(limit);
    onDailyLimit(limit);
    setStatus(`每日张数已改为 ${limit}`);
  }

  async function exportProgress(): Promise<void> {
    const json = await store.exportJson(now().toISOString());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `interview-cards-progress-${toLocalDateKey(now())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("进度文件已导出");
  }

  async function importProgress(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      await store.importJson(await file.text());
      await store.migrateLegacyIds(cards);
      await onProgressChanged();
      setStatus("进度已合并导入");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "进度导入失败");
    }
  }

  async function clearProgress(): Promise<void> {
    if (!window.confirm("确定清空这台设备上的全部学习进度吗？此操作无法撤销。")) {
      return;
    }
    await store.clear();
    await onProgressChanged();
    setStatus("本机学习进度已清空");
  }

  return (
    <main className="screen settings-screen">
      <section className="page-title">
        <p className="eyebrow">LOCAL SETTINGS</p>
        <h1>设置</h1>
        <p>所有学习记录只保存在这台设备上。</p>
      </section>

      <section className="settings-card">
        <div>
          <h2>每日题量</h2>
          <p>队列默认由 60% 到期或薄弱题、40% 新题组成。</p>
        </div>
        <label className="limit-select">
          <span className="sr-only">每日题量</span>
          <select value={dailyLimit} onChange={(event) => void changeLimit(Number(event.target.value))}>
            {DAILY_LIMITS.map((limit) => <option key={limit} value={limit}>{limit} 张</option>)}
          </select>
        </label>
      </section>

      <section className="settings-card settings-stack">
        <div>
          <h2>进度备份</h2>
          <p>导出的 JSON 只含卡片 ID、等级、次数和复习日期，不含题目与回答。</p>
        </div>
        <div className="settings-actions">
          <button className="secondary-button" type="button" onClick={() => void exportProgress()}>导出进度</button>
          <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>合并导入</button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importProgress(event)}
          />
        </div>
      </section>

      <section className="settings-card settings-stack">
        <div>
          <h2>隐私与锁定</h2>
          <p>手动锁定会立即从内存中移除已解密题库；刷新或关闭应用也会重新锁定。</p>
        </div>
        <button className="secondary-button" type="button" onClick={onLock}>立即锁定</button>
      </section>

      <section className="danger-zone">
        <div>
          <h2>清空本机进度</h2>
          <p>不会删除加密题库，但所有掌握等级和复习日期都会丢失。</p>
        </div>
        <button className="danger-button" type="button" onClick={() => void clearProgress()}>清空进度</button>
      </section>

      {status ? <p className="settings-status" role="status">{status}</p> : null}
    </main>
  );
}
