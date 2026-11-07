// 찜한 공고 저장 모듈 (localStorage 계층).
// 원칙(REAL_PRODUCT_PLAN §2와 동일): 페이지는 localStorage를 직접 만지지 않고 이 모듈만 통한다.
// → 추후 서버 DB(로그인) 전환 시 이 모듈만 교체.
//
// 저장 대상은 대시보드 추천 카드(policyAdapter.mapPolicyToCard) 뷰모델.
// 키는 정책 고유번호(plcyNo == card.id).
// 레코드 스키마 (localStorage 키 `clue_saved_policies`):
// { id(plcyNo), title, agency, category, tags: string[], deadline, link, savedAt(number) }

import { syncPush } from './syncLayer';

const KEY = 'clue_saved_policies';

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
        // QuotaExceededError 등 → 조용히 실패
        return false;
    }
}

// 최근 찜한 순으로 반환.
export function listSaved() {
    return readAll()
        .slice()
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export function isSaved(id) {
    if (!id) return false;
    return readAll().some(p => p.id === id);
}

// 카드 뷰모델을 찜 목록에 추가(이미 있으면 갱신 없이 유지).
export function savePolicy(card) {
    if (!card || !card.id) return false;
    const list = readAll();
    if (list.some(p => p.id === card.id)) {
        syncPush('saved', 'put', card.id); // 서버 일관성 보정
        return true; // 이미 찜됨
    }
    list.push({
        id: card.id,
        title: card.title || '',
        agency: card.agency || '',
        category: card.category || '',
        tags: Array.isArray(card.tags) ? card.tags : [],
        deadline: card.deadline || '',
        link: card.link || '',
        savedAt: Date.now(),
    });
    const ok = writeAll(list);
    if (ok) syncPush('saved', 'put', card.id);
    return ok;
}

export function removeSaved(id) {
    if (!id) return false;
    const ok = writeAll(readAll().filter(p => p.id !== id));
    if (ok) syncPush('saved', 'delete', id);
    return ok;
}

// 저장 상태 토글. 반환값은 토글 후 "찜됨" 여부.
export function toggleSaved(card) {
    if (!card || !card.id) return false;
    if (isSaved(card.id)) {
        removeSaved(card.id);
        return false;
    }
    savePolicy(card);
    return true;
}

export default listSaved;
