// 펜·형광펜 드로잉 영속화 모듈 (IndexedDB 계층).
// 문서별(docId) `{ [page]: dataURL }` 맵을 보관 → 워크벤치 재진입·재시작 후 필기 복원.
//
// 연결/스토어 생성은 공용 idb 모듈(src/store/idb.js)에 위임한다.
// (pdfStore와 단일 'clue' DB 연결을 공유 — blocked 업그레이드 예방.)
//
// 저장/복원/실패 시점을 콘솔에 남긴다(F12로 확인). 그 외 로그는 없음.
// IndexedDB 미지원·실패 시 조용히 skip: 필기 영속화만 포기하고 앱은 정상 동작.

import { DRAWINGS_STORE, idbGet, idbPut, idbDelete } from './idb';

// 문서 단위 드로잉 맵 저장. drawings: { [page]: dataURL }
export async function saveDrawings(docId, drawings) {
    if (!docId || !drawings) return false;
    try {
        await idbPut(DRAWINGS_STORE, drawings, docId);
        console.info(`[drawing] 저장됨 doc=${docId} pages=[${Object.keys(drawings).join(',')}]`);
        return true;
    } catch (e) {
        console.warn(`[drawing] 저장 실패 doc=${docId}: ${e?.message || e}`);
        return false;
    }
}

export async function getDrawings(docId) {
    if (!docId) return null;
    try {
        return (await idbGet(DRAWINGS_STORE, docId)) || null;
    } catch (e) {
        console.warn(`[drawing] 복원 실패 doc=${docId}: ${e?.message || e}`);
        return null;
    }
}

export async function deleteDrawings(docId) {
    if (!docId) return false;
    try {
        await idbDelete(DRAWINGS_STORE, docId);
        return true;
    } catch {
        return false;
    }
}
