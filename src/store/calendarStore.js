// 캘린더 이벤트 저장 모듈 (localStorage `clue_added_events` 재사용 계층).
// 기존 체계(CalendarPage·UploadHistoryPage가 쓰던 `clue_added_events`)를 그대로 쓰되,
// 문서 연계(docId) 이벤트를 추가/정리할 수 있게 얇게 감싼다.
//
// 이벤트 레코드 스키마(기존과 호환):
// { id, docId?, name, date, deadline: 'YYYY.MM.DD' }
//   - CalendarPage는 deadline(점 구분)을 split('.')하여 렌더한다.
//   - docId가 있으면 문서 삭제 시 removeEventForDoc로 함께 제거된다.

import { syncPush } from './syncLayer';

const KEY = 'clue_added_events';

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
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeAll(list) {
    const ls = getLS();
    if (!ls) return false;
    try {
        ls.setItem(KEY, JSON.stringify(list));
        return true;
    } catch {
        return false;
    }
}

// 'YYYY-MM-DD' → 'YYYY.MM.DD' (CalendarPage 렌더 포맷).
function toDotted(iso) {
    return typeof iso === 'string' ? iso.replace(/-/g, '.') : '';
}

export function listEvents() {
    return readAll();
}

// 문서(deadline 보유)를 캘린더 이벤트로 등록. deadline 없으면 no-op.
// 같은 docId 이벤트가 있으면 갱신, 없으면 추가.
export function addEventForDoc(doc) {
    if (!doc || !doc.docId || !doc.deadline) return false;
    const list = readAll();
    const evId = `doc-${doc.docId}`;
    const record = {
        id: evId,
        docId: doc.docId,
        name: doc.fileName || '분석한 공고문',
        date: '',
        deadline: toDotted(doc.deadline),
        // 마감일 출처 표기(사용자 결정③): 'auto'=휴리스틱 추정 → 캘린더에 "추정" 라벨.
        // 'manual'(사용자 수정)이면 라벨 없음. 기존 이벤트 호환 위해 없으면 undefined.
        estimated: doc.deadlineSource === 'auto',
    };
    const idx = list.findIndex(e => e && (e.id === evId || e.docId === doc.docId));
    if (idx >= 0) list[idx] = { ...list[idx], ...record };
    else list.push(record);
    const ok = writeAll(list);
    if (ok) syncPush('events', 'put', evId);
    return ok;
}

// 이 문서에서 파생된 캘린더 이벤트(doc-<id>)가 이미 등록돼 있는지 확인.
// 문서함 "캘린더 추가" 버튼의 단일 경로 분기(결정 B3)에 사용.
export function hasEventForDoc(docId) {
    if (!docId) return false;
    const evId = `doc-${docId}`;
    return readAll().some(e => e && (e.id === evId || e.docId === docId));
}

// 문서 삭제 시 해당 문서에서 파생된 이벤트 제거.
export function removeEventForDoc(docId) {
    if (!docId) return false;
    const evId = `doc-${docId}`;
    const ok = writeAll(readAll().filter(e => e && e.id !== evId && e.docId !== docId));
    if (ok) syncPush('events', 'delete', evId);
    return ok;
}

// 오늘 이후(포함) 다가오는 이벤트를 마감 임박순으로 반환. 대시보드 "다가오는 일정"용.
export function listUpcomingEvents(now = new Date(), limit = 3) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return readAll()
        .filter(e => e && typeof e.deadline === 'string' && e.deadline.trim())
        .map(e => {
            const [y, m, d] = e.deadline.split('.').map(n => parseInt(n, 10));
            return { ...e, _ts: new Date(y, (m || 1) - 1, d || 1).getTime() };
        })
        .filter(e => !Number.isNaN(e._ts) && e._ts >= start)
        .sort((a, b) => a._ts - b._ts)
        .slice(0, limit);
}

export default listEvents;
