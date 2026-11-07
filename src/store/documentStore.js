// 문서 생애주기 저장 모듈 (localStorage 계층).
// 원칙(REAL_PRODUCT_PLAN §2): 페이지는 localStorage를 직접 만지지 않고 이 모듈만 통한다.
// → 추후 서버 DB 전환 시 이 모듈만 교체.
//
// 문서 레코드 스키마 (localStorage 키 `clue_documents`):
// { docId, fileName, uploadedAt, pages, ocrUsed,
//   status: 'reviewing' | 'saved' | 'completed',
//   analysis: { reconstructedPages, acidResults, quiz, reductionRate },  // 트림본
//   review: { quizAnswered: bool, quizCorrect, quizSelectedIdx, lastViewedAt },  // (구 verifiedRiskIds 필드 폐기 — 읽기 무시)
//   deadline: null | 'YYYY-MM-DD',
//   deadlineSource: 'auto' | 'manual' | null,  // 'auto'=휴리스틱 추정("추정" 라벨), 'manual'=사용자 수정(라벨 없음)
//   completedAt?: number }

import { syncPush } from './syncLayer';

const KEY = 'clue_documents';

// localStorage 접근 방어(SSR·프라이빗 모드·미지원 환경).
function getLS() {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null;
    }
}

function readAll() {
    const ls = getLS();
    if (!ls) return [];
    try {
        const raw = ls.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // JSON 파싱 실패 → 빈 목록으로 안전 복구
        return [];
    }
}

function writeAll(docs) {
    const ls = getLS();
    if (!ls) return false;
    try {
        ls.setItem(KEY, JSON.stringify(docs));
        return true;
    } catch {
        // QuotaExceededError 등 용량 초과 → 조용히 실패
        return false;
    }
}

// 최신 업로드 우선 정렬로 반환.
export function listDocuments() {
    return readAll()
        .slice()
        .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
}

export function getDocument(docId) {
    if (!docId) return null;
    return readAll().find(d => d.docId === docId) || null;
}

// 신규 등록 또는 기존 레코드 병합 업데이트.
export function upsertDocument(doc) {
    if (!doc || !doc.docId) return false;
    const docs = readAll();
    const idx = docs.findIndex(d => d.docId === doc.docId);
    if (idx >= 0) docs[idx] = { ...docs[idx], ...doc };
    else docs.push(doc);
    const ok = writeAll(docs);
    if (ok) syncPush('documents', 'put', doc.docId);
    return ok;
}

export function updateStatus(docId, status) {
    if (!docId) return false;
    const docs = readAll();
    const idx = docs.findIndex(d => d.docId === docId);
    if (idx < 0) return false;
    const next = { ...docs[idx], status };
    if (status === 'completed') next.completedAt = Date.now();
    docs[idx] = next;
    const ok = writeAll(docs);
    if (ok) syncPush('documents', 'put', docId);
    return ok;
}

export function updateReview(docId, review) {
    if (!docId || !review) return false;
    const docs = readAll();
    const idx = docs.findIndex(d => d.docId === docId);
    if (idx < 0) return false;
    docs[idx] = { ...docs[idx], review: { ...(docs[idx].review || {}), ...review } };
    const ok = writeAll(docs);
    if (ok) syncPush('documents', 'put', docId);
    return ok;
}

// 마감일 수동 수정/삭제(사용자 결정③: 추정 라벨 + 수동 수정).
// deadline: 'YYYY-MM-DD' 또는 null(삭제). source: 'manual'(기본)|'auto'.
// deadline이 없으면(null/빈값) deadlineSource도 null로 함께 정리.
export function updateDeadline(docId, deadline, source = 'manual') {
    if (!docId) return false;
    const docs = readAll();
    const idx = docs.findIndex(d => d.docId === docId);
    if (idx < 0) return false;
    const has = typeof deadline === 'string' && deadline.trim();
    docs[idx] = {
        ...docs[idx],
        deadline: has ? deadline : null,
        deadlineSource: has ? source : null,
    };
    const ok = writeAll(docs);
    if (ok) syncPush('documents', 'put', docId);
    return ok;
}

export function deleteDocument(docId) {
    if (!docId) return false;
    const docs = readAll().filter(d => d.docId !== docId);
    const ok = writeAll(docs);
    if (ok) syncPush('documents', 'delete', docId);
    return ok;
}
