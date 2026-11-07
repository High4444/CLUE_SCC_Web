// 사용자 프로필 저장 모듈 (localStorage 계층).
// 원칙(REAL_PRODUCT_PLAN §2와 동일): 페이지는 localStorage를 직접 만지지 않고 이 모듈만 통한다.
// → 추후 서버 DB(로그인) 전환 시 이 모듈만 교체.
//
// 스키마는 자가진단 설문(SelfDiagnosisPage) 실제 입력 항목 기준.
// 프로필 레코드 (localStorage 키 `clue_profile`):
// { age(number), targetGroup, region, employment, income,
//   householdSize, household, special: string[],
//   interests?: string[],   // StartPage 페르소나 태그(관심 태그, "key:opt" 형태) — 선택적
//   savedAt(number) }
// 이름 입력 항목은 설문에 없음 → 프로필에도 이름 필드 없음(위젯은 "나의 프로필" 표기).

import { syncPush } from './syncLayer';

const KEY = 'clue_profile';

// localStorage 접근 방어(SSR·프라이빗 모드·미지원 환경).
function getLS() {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null;
    }
}

// 저장된 프로필 반환. 없거나 손상 시 null.
export function getProfile() {
    const ls = getLS();
    if (!ls) return null;
    try {
        const raw = ls.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // 객체가 아니거나 빈 값이면 미설정으로 취급
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed;
    } catch {
        return null;
    }
}

// 프로필 저장(병합 없이 전체 교체). 자가진단 완료 시 호출.
export function saveProfile(profile) {
    const ls = getLS();
    if (!ls || !profile || typeof profile !== 'object') return false;
    try {
        const record = { ...profile, savedAt: Date.now() };
        ls.setItem(KEY, JSON.stringify(record));
        syncPush('profile', 'put');
        return true;
    } catch {
        // QuotaExceededError 등 → 조용히 실패
        return false;
    }
}

export function clearProfile() {
    const ls = getLS();
    if (!ls) return false;
    try {
        ls.removeItem(KEY);
        syncPush('profile', 'delete');
        return true;
    } catch {
        return false;
    }
}

export default getProfile;
