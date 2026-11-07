// 공용 IndexedDB 연결 모듈.
// pdfStore·drawingStore가 공유하는 단일 'clue' DB 연결을 캐시한다.
//
// 기존 문제: 두 스토어가 각자 매 작업마다 open→close를 반복하면서 v1→v2
// 업그레이드 시점에 서로/다른 탭의 구버전 연결과 경쟁 → open이 'blocked'로
// 조용히 대기하거나 실패하고, 각 스토어의 catch가 이를 삼켜 저장이 소리 없이
// 실패했다. 이 모듈로 통합해 단일 연결을 캐시하고, 다른 탭이 상위 버전으로
// 열려 하면 onversionchange에서 연결을 닫아 blocked를 예방한다.
//
// v3 사유(실브라우저 전용 버그): 초기 v2 DB가 drawings 스토어 없이(즉 pdfs만)
// 생성된 브라우저에서는, DB가 이미 v2라 onupgradeneeded가 다시 발화하지 않아
// drawings 스토어가 영영 생성되지 않았다. 그 결과 transaction('drawings')가
// NotFoundError("One of the specified object stores was not found")를 던지고
// catch가 이를 삼켜 필기 저장/복원이 조용히 실패했다(fake-indexeddb는 항상
// 새 DB라 재현 안 됨). 버전을 3으로 올려 onupgradeneeded를 재발화 → 아래
// idempotent 생성 로직(contains 가드)이 누락된 스토어만 안전하게 보강한다.
// 기존 데이터는 스토어를 재생성하지 않으므로 그대로 보존된다.

export const DB_NAME = 'clue';
export const DB_VERSION = 3;
export const PDF_STORE = 'pdfs';
export const DRAWINGS_STORE = 'drawings';

// 캐시된 단일 연결 promise (모듈 레벨).
let dbPromise = null;

function openDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined' || !indexedDB) {
            reject(new Error('IndexedDB unsupported'));
            return;
        }
        let req;
        try {
            req = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (e) {
            reject(e);
            return;
        }
        req.onupgradeneeded = () => {
            const db = req.result;
            // 공유 DB의 모든 스토어를 idempotent하게 생성.
            // v1(pdfs만) → v2 업그레이드 시 기존 데이터는 보존되고 drawings만 추가.
            if (!db.objectStoreNames.contains(PDF_STORE)) db.createObjectStore(PDF_STORE);
            if (!db.objectStoreNames.contains(DRAWINGS_STORE)) db.createObjectStore(DRAWINGS_STORE);
        };
        req.onblocked = () => {
            // 다른 탭이 구버전 연결을 잡고 있어 업그레이드가 막힘.
            console.warn('[idb] DB 업그레이드가 다른 탭에 의해 막혔습니다. 같은 사이트의 다른 탭을 닫아주세요.');
        };
        req.onsuccess = () => {
            const db = req.result;
            // 다른 탭이 상위 버전으로 열려 하면 이 연결을 닫아 그쪽의 blocked를 예방.
            db.onversionchange = () => {
                db.close();
                dbPromise = null;
            };
            resolve(db);
        };
        req.onerror = () => reject(req.error);
    });
}

// 캐시된 단일 연결 promise 반환. 실패 시 캐시를 비워 다음 호출에서 재시도.
export function getDB() {
    if (!dbPromise) {
        dbPromise = openDb().catch((err) => {
            dbPromise = null;
            throw err;
        });
    }
    return dbPromise;
}

export async function idbPut(storeName, value, key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export async function idbGet(storeName, key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const rq = tx.objectStore(storeName).get(key);
        rq.onsuccess = () => resolve(rq.result ?? null);
        rq.onerror = () => reject(rq.error);
    });
}

export async function idbDelete(storeName, key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}
