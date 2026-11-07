// 신청 체크리스트 진행 상태 저장 모듈 (localStorage `clue_checklist`).
// 원칙(REAL_PRODUCT_PLAN §2): 페이지는 localStorage를 직접 만지지 않고 이 모듈만 통한다.
//
// AppliedPoliciesPage는 "검토완료(completed) 문서"에서 체크리스트 항목을 파생한다(문서의 ACID I/D).
// 항목의 라벨·구성은 문서 분석 결과에서 매번 재생성되므로, 여기서는 "체크 여부·신청 완료 여부"
// 같은 사용자 진행 상태만 docId 기준으로 보존한다.
//
// 스키마 (localStorage 키 `clue_checklist`):
// { [docId]: { applied: bool, appliedAt: 'YYYY-MM-DD'|'', items: { [itemId]: bool }, added?: bool } }
// added: 업로드 내역의 체크리스트 아이콘으로 담은 문서(검토완료 전이라도 체크리스트에 노출).

import { syncPush } from './syncLayer';

const KEY = 'clue_checklist';

function getLS() {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null;
    }
}

function readAll() {
    const ls = getLS();
    if (!ls) return {};
    try {
        const parsed = JSON.parse(ls.getItem(KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(map) {
    const ls = getLS();
    if (!ls) return false;
    try {
        ls.setItem(KEY, JSON.stringify(map));
        return true;
    } catch {
        return false;
    }
}

// 문서 한 건의 저장된 진행 상태. 없으면 기본값.
export function getChecklistState(docId) {
    if (!docId) return { applied: false, appliedAt: '', items: {}, added: false };
    const rec = readAll()[docId];
    if (!rec || typeof rec !== 'object') return { applied: false, appliedAt: '', items: {}, added: false };
    return {
        applied: !!rec.applied,
        appliedAt: rec.appliedAt || '',
        items: rec.items && typeof rec.items === 'object' ? rec.items : {},
        added: !!rec.added,
    };
}

// 업로드 내역의 체크리스트 아이콘: 이 문서를 체크리스트에 담는다(이미 있으면 진행 상태 유지).
export function ensureChecklist(docId) {
    if (!docId) return false;
    const map = readAll();
    const rec = map[docId] || { applied: false, appliedAt: '', items: {} };
    if (rec.added) return true;
    map[docId] = { ...rec, added: true };
    const ok = writeAll(map);
    if (ok) syncPush('checklists', 'put', docId);
    return ok;
}

export function setItemDone(docId, itemId, done) {
    if (!docId || itemId == null) return false;
    const map = readAll();
    const rec = map[docId] || { applied: false, appliedAt: '', items: {} };
    rec.items = { ...(rec.items || {}), [itemId]: !!done };
    map[docId] = rec;
    const ok = writeAll(map);
    if (ok) syncPush('checklists', 'put', docId);
    return ok;
}

export function setApplied(docId, applied, appliedAt) {
    if (!docId) return false;
    const map = readAll();
    const rec = map[docId] || { applied: false, appliedAt: '', items: {} };
    rec.applied = !!applied;
    rec.appliedAt = applied ? (appliedAt || rec.appliedAt || '') : '';
    map[docId] = rec;
    const ok = writeAll(map);
    if (ok) syncPush('checklists', 'put', docId);
    return ok;
}

// 문서 삭제 시 진행 상태도 정리.
export function removeChecklist(docId) {
    if (!docId) return false;
    const map = readAll();
    if (!(docId in map)) return true;
    delete map[docId];
    const ok = writeAll(map);
    if (ok) syncPush('checklists', 'delete', docId);
    return ok;
}

// ── 수동 내역(사용자가 직접 추가한 신청 내역) 영속화 (localStorage `clue_manual_entries`) ──
// 결정 B5: 문서 파생 엔트리와 달리 수동 내역은 라벨·메모·체크항목 전체를 사용자가 만든다.
// 문서 분석 결과에서 재생성할 원천이 없으므로 엔트리 전체(제목·기관·금액·메모·체크항목 등)를
// 그대로 저장해 새로고침 후에도 복원한다. AppliedPoliciesPage가 문서 파생분과 병합해 표시.
//
// 스키마: 엔트리 객체 배열
//   [{ id, title, agency, appliedAt, deadline, amount, memo, isApplied, applyUrl,
//      manual: true, checklistItems: [{ id, label, done }] }]
const MANUAL_KEY = 'clue_manual_entries';

function readManual() {
    const ls = getLS();
    if (!ls) return [];
    try {
        const parsed = JSON.parse(ls.getItem(MANUAL_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeManual(list) {
    const ls = getLS();
    if (!ls) return false;
    try {
        ls.setItem(MANUAL_KEY, JSON.stringify(list));
        return true;
    } catch {
        return false;
    }
}

// 최근 추가 우선(뒤에 추가된 항목이 목록 하단) — 추가 순서 보존.
export function listManualEntries() {
    return readManual().map(e => ({ ...e, manual: true, fromDocument: false }));
}

// 신규 등록 또는 기존 수동 내역 병합 업데이트(id 기준).
// 주의: 수동 내역은 아직 서버 동기화 대상이 아님(sync 계약에 수동-내역 컬렉션 없음) →
// syncPush 하지 않고 localStorage에만 영속. 게스트/로그인 양쪽에서 로컬 보존된다.
export function saveManualEntry(entry) {
    if (!entry || !entry.id) return false;
    const list = readManual();
    const idx = list.findIndex(e => e && e.id === entry.id);
    const record = { ...entry, manual: true };
    delete record.fromDocument; // 저장 시 파생 표식 제거(수동 전용 키)
    if (idx >= 0) list[idx] = { ...list[idx], ...record };
    else list.push(record);
    return writeManual(list);
}

export function deleteManualEntry(id) {
    if (!id) return false;
    const list = readManual();
    if (!list.some(e => e && e.id === id)) return true;
    return writeManual(list.filter(e => e && e.id !== id));
}

export default getChecklistState;
