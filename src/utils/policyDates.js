// 정책 접수기간(aplyYmd) 날짜 파싱 유틸(순수 함수, 상대 import 없음).
// recommendRank(추천 랭킹)와 verdictEngine(신청 가능 집계)이 함께 쓰는 공유 모듈 —
// 두 모듈이 서로를 import하지 않고 마감 경과 판정을 일관되게 쓰도록 여기로 분리.

// aplyYmd("YYYYMMDD ~ YYYYMMDD" | "YYYYMMDD" 등) → 접수 종료일 Date | null.
// 기간형이면 '~' 뒤(종료일), 단일이면 그 값. 구분자(.-/) 허용. 파싱 불가면 null(상시 등).
export function parsePolicyEndDate(aplyYmd) {
    const raw = typeof aplyYmd === 'string' ? aplyYmd.trim() : '';
    if (!raw) return null;
    const part = raw.includes('~') ? raw.split('~').pop().trim() : raw;
    const m = part.match(/(\d{4})[.\-/]?(\d{1,2})[.\-/]?(\d{1,2})/);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

// 접수 종료일이 파싱 가능하고 오늘(now 기준 자정)보다 과거이면 true(마감 경과).
// 파싱 불가(상시 신청 등)는 false — '지금 신청 가능'으로 간주하는 현행 관례 유지.
// 종료일 당일은 아직 유효(false).
export function isEndDateExpired(aplyYmd, now = new Date()) {
    const end = parsePolicyEndDate(aplyYmd);
    if (!end) return false;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return end < today;
}

export default parsePolicyEndDate;
