// 공용 서버 동기화 레이어 (write-through 캐시). 흐름5 F5-b~c.
//
// 설계 원칙(docs/ARCHITECTURE.md §1.1):
// - 읽기는 항상 localStorage(동기, 기존 store 그대로). 페이지 코드는 무수정.
// - 쓰기는 localStorage 즉시 반영(기존 store) + 로그인 상태면 서버 PUT/DELETE를
//   fire-and-forget 발사(실패 시 1회 재시도 후 console.warn, UI 블로킹 없음).
// - 로그인 직후 afterLogin(): (게스트 데이터 병합 프롬프트 →) 서버 GET 전체 풀다운.
// - 앱 시작 시 토큰 있으면 pullDown() 백그라운드 1회.
// - 로그아웃 시 afterLogout(): 계정 데이터 키 클리어 + 게스트 백업 자동 복원.
//
// 게스트 모드 보존: isLoggedIn()=false면 syncPush/pullDown/afterLogin이 전부 no-op.
//
// 도메인 ↔ localStorage 키 ↔ §2.1 엔드포인트 매핑:
//   documents  clue_documents        /api/sync/documents/:docId   (본문=문서 레코드)
//   profile    clue_profile          /api/sync/profile            (본문=프로필 객체)
//   saved      clue_saved_policies   /api/sync/saved/:plcyNo      (본문=카드 뷰모델)
//   checklists clue_checklist        /api/sync/checklists/:docId  (본문=값 객체, docId 제외)
//   events     clue_added_events     /api/sync/events/:eventId    (본문=이벤트 레코드)

import * as client from '../api/client';
import { isLoggedIn } from './authStore';

const KEYS = {
    documents: 'clue_documents',
    profile: 'clue_profile',
    saved: 'clue_saved_policies',
    checklists: 'clue_checklist',
    events: 'clue_added_events',
};
const ACCOUNT_KEYS = Object.values(KEYS);
const BACKUP_KEY = 'clue_guest_backup';

function getLS() {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null;
    }
}

function readArray(key) {
    const ls = getLS();
    if (!ls) return [];
    try {
        const parsed = JSON.parse(ls.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function readObj(key) {
    const ls = getLS();
    if (!ls) return null;
    try {
        const parsed = JSON.parse(ls.getItem(key) || 'null');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function writeRaw(key, value) {
    const ls = getLS();
    if (!ls) return;
    try { ls.setItem(key, JSON.stringify(value)); } catch { /* 용량초과 등 무시 */ }
}

function removeKey(key) {
    const ls = getLS();
    if (!ls) return;
    try { ls.removeItem(key); } catch { /* 무시 */ }
}

// PUT 본문으로 보낼 최신 값을 localStorage에서 추출. 없으면 null.
function currentValue(domain, key) {
    switch (domain) {
        case 'documents':
            return readArray(KEYS.documents).find(d => d && d.docId === key) || null;
        case 'profile':
            return readObj(KEYS.profile);
        case 'saved':
            return readArray(KEYS.saved).find(p => p && p.id === key) || null;
        case 'checklists': {
            const map = readObj(KEYS.checklists) || {};
            const v = map[key];
            // 체크리스트 특례: 본문에 docId 미포함(값 객체만 전송).
            return v ? { applied: !!v.applied, appliedAt: v.appliedAt || '', items: v.items || {} } : null;
        }
        case 'events':
            return readArray(KEYS.events).find(e => e && e.id === key) || null;
        default:
            return null;
    }
}

async function dispatch(domain, op, key, retry) {
    try {
        if (op === 'delete') {
            await client.syncDelete(domain, domain === 'profile' ? undefined : key);
            return;
        }
        const value = currentValue(domain, key);
        if (value == null) {
            // 값이 사라졌으면(경합) 프로필은 삭제로, 그 외는 스킵.
            if (domain === 'profile') await client.syncDelete('profile');
            return;
        }
        await client.syncPut(domain, domain === 'profile' ? undefined : key, value);
    } catch (err) {
        if (retry) return dispatch(domain, op, key, false);
        console.warn(`[syncLayer] ${op} ${domain}/${key ?? ''} 동기화 실패:`, err?.message || err);
    }
}

// 쓰기 훅: store의 write 성공 직후 호출. 로그인 상태에서만 서버로 발사(fire-and-forget).
export function syncPush(domain, op, key) {
    if (!isLoggedIn()) return; // 게스트: 서버 호출 0
    Promise.resolve().then(() => dispatch(domain, op, key, true)).catch(() => {});
}

// 서버 전체 → localStorage 풀다운(캐시 갱신). 도메인별 개별 방어(부분 실패 허용).
export async function pullDown() {
    if (!isLoggedIn()) return;

    try {
        const r = await client.syncGet('profile');
        if (r && r.profile) writeRaw(KEYS.profile, r.profile);
        else removeKey(KEYS.profile);
    } catch (err) { console.warn('[syncLayer] profile 풀다운 실패:', err?.message || err); }

    try {
        const r = await client.syncGet('documents');
        writeRaw(KEYS.documents, (r && r.documents) || []);
    } catch (err) { console.warn('[syncLayer] documents 풀다운 실패:', err?.message || err); }

    try {
        const r = await client.syncGet('saved');
        writeRaw(KEYS.saved, (r && r.saved) || []);
    } catch (err) { console.warn('[syncLayer] saved 풀다운 실패:', err?.message || err); }

    try {
        const r = await client.syncGet('checklists');
        // GET 응답 [{docId,applied,appliedAt,items}] → 맵 {[docId]:{applied,appliedAt,items}} 재구성.
        const map = {};
        ((r && r.checklists) || []).forEach(c => {
            if (c && c.docId) map[c.docId] = { applied: !!c.applied, appliedAt: c.appliedAt || '', items: c.items || {} };
        });
        writeRaw(KEYS.checklists, map);
    } catch (err) { console.warn('[syncLayer] checklists 풀다운 실패:', err?.message || err); }

    try {
        const r = await client.syncGet('events');
        writeRaw(KEYS.events, (r && r.events) || []);
    } catch (err) { console.warn('[syncLayer] events 풀다운 실패:', err?.message || err); }
}

// 로컬 게스트 데이터를 import 본문 형태로 수집(비어있는 도메인은 생략).
function collectLocal() {
    const body = {};
    const profile = readObj(KEYS.profile);
    if (profile) body.profile = profile;
    const documents = readArray(KEYS.documents);
    if (documents.length) body.documents = documents;
    const saved = readArray(KEYS.saved);
    if (saved.length) body.saved = saved;
    const checklists = readObj(KEYS.checklists) || {};
    if (Object.keys(checklists).length) body.checklists = checklists; // 서버가 맵 수용
    const events = readArray(KEYS.events);
    if (events.length) body.events = events;
    return body;
}

export function hasLocalGuestData() {
    return Object.keys(collectLocal()).length > 0;
}

// 게스트 데이터를 백업 슬롯에 1회 보관(로그아웃 시 복원용).
function backupGuest() {
    writeRaw(BACKUP_KEY, {
        documents: readArray(KEYS.documents),
        profile: readObj(KEYS.profile),
        saved: readArray(KEYS.saved),
        checklist: readObj(KEYS.checklists),
        events: readArray(KEYS.events),
        savedAt: Date.now(),
    });
}

// 로그인/가입 성공 직후 1회: 병합 프롬프트 → import 또는 백업 → 풀다운.
// bringConfirm: () => boolean|Promise<boolean> — UI에서 confirm 주입(테스트 시 대체 가능).
export async function afterLogin(bringConfirm) {
    if (!isLoggedIn()) return;
    if (hasLocalGuestData()) {
        let bring = true;
        try {
            bring = bringConfirm
                ? await bringConfirm()
                : (typeof confirm === 'function' ? confirm('지금까지 저장한 데이터를 이 계정으로 가져올까요?') : true);
        } catch { bring = true; }

        if (bring) {
            try { await client.syncImport(collectLocal()); }
            catch (err) { console.warn('[syncLayer] 게스트 데이터 import 실패:', err?.message || err); }
        } else {
            backupGuest(); // 로컬 데이터는 백업 후 서버 데이터로 덮어씀
        }
    }
    await pullDown();
}

// 로그아웃 정리: 계정 데이터 키 클리어(서버에 있으니 유실 아님) + 게스트 백업 자동 복원.
// IndexedDB(PDF·드로잉)는 기기 로컬 설계라 유지(고아 허용).
export function afterLogout() {
    ACCOUNT_KEYS.forEach(removeKey);
    const backup = readObj(BACKUP_KEY);
    if (backup) {
        if (Array.isArray(backup.documents)) writeRaw(KEYS.documents, backup.documents);
        if (backup.profile) writeRaw(KEYS.profile, backup.profile);
        if (Array.isArray(backup.saved)) writeRaw(KEYS.saved, backup.saved);
        if (backup.checklist) writeRaw(KEYS.checklists, backup.checklist);
        if (Array.isArray(backup.events)) writeRaw(KEYS.events, backup.events);
        removeKey(BACKUP_KEY);
    }
}
