import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const RECORD_ID = "current" as const;

export interface RememberedUnlockRecord {
  buildId: string;
  salt: string;
  key: CryptoKey;
  savedAt: string;
}

interface StoredRememberedUnlockRecord extends RememberedUnlockRecord {
  id: typeof RECORD_ID;
}

interface RememberedUnlockDatabase extends DBSchema {
  keys: {
    key: string;
    value: StoredRememberedUnlockRecord;
  };
}

export interface RememberedUnlockStore {
  get(): Promise<RememberedUnlockRecord | undefined>;
  put(record: RememberedUnlockRecord): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

class IndexedDbRememberedUnlockStore implements RememberedUnlockStore {
  constructor(private readonly database: IDBPDatabase<RememberedUnlockDatabase>) {}

  async get(): Promise<RememberedUnlockRecord | undefined> {
    const record = await this.database.get("keys", RECORD_ID);
    if (!record) return undefined;
    const { id: _id, ...remembered } = record;
    return remembered;
  }

  async put(record: RememberedUnlockRecord): Promise<void> {
    if (!record.buildId || !record.salt || !record.savedAt || !record.key) {
      throw new Error("本机解锁记录无效");
    }
    await this.database.put("keys", { ...record, id: RECORD_ID });
  }

  async clear(): Promise<void> {
    await this.database.delete("keys", RECORD_ID);
  }

  close(): void {
    this.database.close();
  }
}

export async function createRememberedUnlockStore(
  databaseName = "interview-cards-unlock",
): Promise<RememberedUnlockStore> {
  const database = await openDB<RememberedUnlockDatabase>(databaseName, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys", { keyPath: "id" });
      }
    },
  });
  return new IndexedDbRememberedUnlockStore(database);
}
