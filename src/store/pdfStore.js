// 원본 PDF Blob 저장 모듈 (IndexedDB 계층).
// localStorage엔 용량상 불가한 원본 PDF(문서당 0.2~0.7MB)를 docId 단위로 보관.
// → 재진입·재시작 시 좌측 패널 원본 미리보기 복원의 핵심.
//
// 연결/스토어 생성은 공용 idb 모듈(src/store/idb.js)에 위임한다.
// (drawingStore와 단일 'clue' DB 연결을 공유 — blocked 업그레이드 예방.)
//
// IndexedDB 미지원·실패 시 조용히 skip: 미리보기만 포기하고 앱은 정상 동작.

import { PDF_STORE, idbGet, idbPut, idbDelete } from './idb';

export async function savePdf(docId, blob) {
    if (!docId || !blob) return false;
    try {
        await idbPut(PDF_STORE, blob, docId);
        return true;
    } catch {
        return false;
    }
}

export async function getPdf(docId) {
    if (!docId) return null;
    try {
        return (await idbGet(PDF_STORE, docId)) || null;
    } catch {
        return null;
    }
}

export async function deletePdf(docId) {
    if (!docId) return false;
    try {
        await idbDelete(PDF_STORE, docId);
        return true;
    } catch {
        return false;
    }
}
