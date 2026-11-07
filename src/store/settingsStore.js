// 서비스 설정 저장 모듈 (localStorage 계층, 키 `clue_settings`).
// 원칙(REAL_PRODUCT_PLAN §2와 동일): 페이지는 localStorage를 직접 만지지 않고 이 모듈만 통한다.
//
// 저장 대상은 ServiceSettingsPage의 알림/개인정보 토글값(실동작하는 것만).
// 다크모드는 실테마 시스템이 없어 여기 저장하지 않는다(UI에서 "준비 중" 비활성 처리).
// 레코드 스키마 (localStorage 키 `clue_settings`):
// { push: bool, kakao: bool, night: bool, marketing: bool }

const KEY = 'clue_settings';

const DEFAULTS = { push: true, kakao: false, night: false, marketing: true };

// localStorage 접근 방어(SSR·프라이빗 모드·미지원 환경).
function getLS() {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null;
    }
}

// 저장된 설정 반환(기본값과 병합). 손상 시 기본값.
export function getSettings() {
    const ls = getLS();
    if (!ls) return { ...DEFAULTS };
    try {
        const raw = ls.getItem(KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULTS };
        return { ...DEFAULTS, ...parsed };
    } catch {
        return { ...DEFAULTS };
    }
}

// 설정 전체 저장.
export function saveSettings(settings) {
    const ls = getLS();
    if (!ls || !settings || typeof settings !== 'object') return false;
    try {
        const record = { ...DEFAULTS, ...settings };
        ls.setItem(KEY, JSON.stringify(record));
        return true;
    } catch {
        return false;
    }
}

// 단일 키 갱신 후 저장. 반환값은 갱신된 전체 설정.
export function setSetting(key, value) {
    const next = { ...getSettings(), [key]: value };
    saveSettings(next);
    return next;
}

export default getSettings;
