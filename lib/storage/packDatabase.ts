export interface StoredPackRecord { stopId: string; version: string; contentVersion: string; bytes: number; codec: "opus" | "aac"; installedAt: number }
const databaseName = "positivxr-media";
const storeName = "packs";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "stopId" }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }

export async function getPackRecord(stopId: string) { const db = await openDatabase(); try { return await requestResult(db.transaction(storeName).objectStore(storeName).get(stopId)) as StoredPackRecord | undefined; } finally { db.close(); } }
export async function putPackRecord(record: StoredPackRecord) { const db = await openDatabase(); try { await requestResult(db.transaction(storeName, "readwrite").objectStore(storeName).put(record)); } finally { db.close(); } }
export async function deletePackRecord(stopId: string) { const db = await openDatabase(); try { await requestResult(db.transaction(storeName, "readwrite").objectStore(storeName).delete(stopId)); } finally { db.close(); } }
export async function clearPackRecords() { const db = await openDatabase(); try { await requestResult(db.transaction(storeName, "readwrite").objectStore(storeName).clear()); } finally { db.close(); } }
