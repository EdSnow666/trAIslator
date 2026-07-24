/**
 * 职责: 使用 IndexedDB 保存所有成功的 AI 句法分析记录
 * 依赖内部: 无
 * 依赖外部: IndexedDB, crypto.randomUUID
 * 暴露: saveHistoryRecord | listHistoryRecords | countHistoryRecords
 */

const DATABASE_NAME = 'legal-syntax-lab-history';
const DATABASE_VERSION = 1;
const STORE_NAME = 'analyses';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => createStore(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createStore(database) {
  if (database.objectStoreNames.contains(STORE_NAME)) return;
  const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
  store.createIndex('createdAt', 'createdAt');
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore(mode, operation) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const result = await operation(transaction.objectStore(STORE_NAME));
    await transactionDone(transaction);
    return result;
  } finally {
    database.close();
  }
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveHistoryRecord({ source, analysis, promptSnapshot, model }) {
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source,
    analysis: structuredClone(analysis),
    promptSnapshot,
    model,
  };
  await useStore('readwrite', (store) => requestResult(store.put(record)));
  return record;
}

export async function listHistoryRecords() {
  const records = await useStore('readonly', (store) => requestResult(store.getAll()));
  return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function countHistoryRecords() {
  return useStore('readonly', (store) => requestResult(store.count()));
}
