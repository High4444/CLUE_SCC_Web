// 추천 공고 1차 배지 판정 엔진.
// 온통청년 getPlcy 응답에서 "기계 판정 가능한" 필드만으로 프로필과 대조해
// safe/warn/danger 배지를 낸다. 판정 근거는 배지 title(툴팁)로 노출.
//
// 사용 필드(응답 실측):
//  - sprtTrgtMinAge / sprtTrgtMaxAge : 지원 연령 하한/상한(숫자 문자열, 0은 '없음')
//  - sprtTrgtAgeLmtYn : 연령 제한 적용 여부('Y'=적용, 'N'=무관)
//    → 'N'인데 연령 구간이 채워진 공고가 29%라 플래그는 보조로만 쓰고 실제 구간을 우선한다.
//  - earnCndSeCd : 소득 조건 구분(0043001=무관, 0043002=연소득 이하, 0043003=기타)
//    → 응답에 소득 구간(earnMin/MaxAmt)이 0으로 비어 상세 대조는 불가 → 조건 존재만 확인.
//  ※ 지역은 zipCd로 판정하지 않는다 — 응답 zipCd가 거의 전부 전국 256개라 변별력이 없다.
//    대신 등록 기관명에서 시·도를 뽑는 policyRegion.judgeRegion을 쓴다(사유는 그 파일 주석 참조).

import { deriveAgeRange, deriveRegions, policyMatchesLclsf, ageRangeLabel } from './profileFilters';
import { judgeRegion, policyRegionLabel } from './policyRegion';
import { isEndDateExpired } from './policyDates';

const INCOME_NONE = '0043001'; // earnCndSeCd: 소득 무관

// ── 학력요건(schoolCd) 대조 — 결정 D4(보수적) ────────────────────────────────
// schoolCd는 온통청년 getPlcy 응답의 학력요건 코드(콤마 다중 가능).
// :3002 실측(2026-07-08, 100건 표본) + 실정책 자격문구(addAplyQlfcCndCn) 교차확인으로
// "확실한 코드"만 판정에 쓴다(불확실 코드는 danger로 몰지 않고 '확인 필요' warn).
//   0049010 = 제한없음(무관) — 표본 96%. 확실 → 통과.
//   0049005 = 대학 재학 — 실정책 "대학 재학생/재학생 한정" 문구로 교차확인. 확실.
//   0049004(고교 관련)·0049009(기타) 등 = 의미 불확실 → 대조 보류(확인 필요).
const SCHOOL_NO_LIMIT = '0049010';
const SCHOOL_ENROLLED_UNIV = '0049005';

// 사용자 학력(profile.education) → "확실히" 충족하는 schoolCd 코드 집합.
// 확실 매핑만 등재(대학원 이상이 '재학생 한정'을 충족한다고 단정 불가 — 실제로 대학원생 제외 정책 존재).
const EDU_SATISFIES_SCHOOL_CD = {
    '대학 재학': new Set([SCHOOL_ENROLLED_UNIV]),
};

/**
 * 정책 학력요건(schoolCd) vs 사용자 학력(education) 판정.
 *   'pass'    : 요건 없음 / 제한없음(0049010) / 사용자 학력이 확실히 충족.
 *   'unknown' : 제한은 있으나 확실 대조 불가 → "학력 조건 확인 필요"(warn). danger로 격상하지 않음.
 * @returns {'pass'|'unknown'}
 */
export function judgeSchool(schoolCd, education) {
    const codes = String(schoolCd || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (codes.length === 0) return 'pass';                 // 학력요건 없음 → 무관
    if (codes.includes(SCHOOL_NO_LIMIT)) return 'pass';    // 제한없음 → 통과(확실)
    const sat = EDU_SATISFIES_SCHOOL_CD[education];
    if (sat && codes.some((c) => sat.has(c))) return 'pass'; // 확실 충족
    return 'unknown';                                      // 제한 있음 + 확실 대조 불가
}

// 연령 경계값 파싱. 0은 "값 없음"(한쪽만 비어 있는 공고가 표본에 39건 — 예: min 0 / max 39)이라
// null로 바꿔 judgeAgeRange에서 무한대 경계로 처리되게 한다.
function toAgeBound(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

// 정책 연령 구간 라벨("min~max세", 한쪽 없으면 '?').
function ageBoundLabel(min, max) {
    return `${min != null ? min : '?'}~${max != null ? max : '?'}세`;
}

// 프로필 연령 범위 라벨(랜딩 구간이면 칩 라벨, 단일이면 "N세", 범위면 "min~max세").
function rangeLabel(range) {
    return ageRangeLabel(range) || '?';
}

/**
 * 프로필 연령 범위(range {min,max}) vs 정책 연령 구간([policyMin, policyMax]) 판정.
 * 사용자 결정①(범위 그대로 판정) 반영:
 *   - 'pass'    : 프로필 범위 전체가 정책 구간 안(전체 통과) → safe 후보
 *   - 'partial' : 일부만 통과(범위 일부만 대상) → warn("연령 확인 필요")
 *   - 'fail'    : 전혀 겹치지 않음(전체 미달/초과) → danger
 *   - 'unknown' : 대조 불가(프로필 연령 없음 또는 정책 연령 구간 없음)
 * 단일 나이(자가진단 age)는 range.min===range.max로 들어와 동일 경로로 판정된다.
 * @returns {'pass'|'partial'|'fail'|'unknown'}
 */
export function judgeAgeRange(range, policyMin, policyMax) {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return 'unknown';
    if (policyMin == null && policyMax == null) return 'unknown';
    const lo = policyMin == null ? -Infinity : policyMin;
    const hi = policyMax == null ? Infinity : policyMax;
    if (range.max < lo || range.min > hi) return 'fail';       // 전혀 겹치지 않음
    if (range.min >= lo && range.max <= hi) return 'pass';     // 범위 전체가 구간 안
    return 'partial';                                          // 부분 겹침
}

/**
 * 공고 1건 + 프로필 → 판정.
 * @returns {{ level:'safe'|'warn'|'danger'|'neutral', text:string, title:string }}
 */
export function computeVerdict(policy, profile) {
    // 프로필 없으면 기존 중립 배지 유지("분석 전").
    if (!profile) return { level: 'neutral', text: '분석 전', title: '' };

    const p = policy || {};

    // 0) 거주지 판정 — 다른 시·도의 지자체 공고는 거주 요건에 걸릴 가능성이 높아 먼저 거른다.
    //    전국 공고(중앙부처·공공기관)와 거주지 미입력은 그냥 통과시킨다.
    const myRegions = deriveRegions(profile);
    const regionJudge = judgeRegion(p, myRegions);
    if (regionJudge === 'other') {
        return {
            level: 'danger', text: '다른 지역 공고',
            title: `${policyRegionLabel(p)} 지역 공고 — 내 거주지(${myRegions.join('·')})가 아님`,
        };
    }

    const min = toAgeBound(p.sprtTrgtMinAge);
    const max = toAgeBound(p.sprtTrgtMaxAge);
    // 실측(2026-10-11, 1,500건): sprtTrgtAgeLmtYn='N'인데 연령 구간이 들어 있는 공고가 439건(29%)이다.
    // 예) "경기도 청년 면접수당"은 N인데 18~39세. 플래그만 믿으면 45세에게도 청년 공고가 추천된다.
    // → 플래그보다 실제 값을 우선하고, 값이 있으면 무조건 대조한다.
    const hasAgeRange = min != null || max != null;
    const ageLimited = hasAgeRange || p.sprtTrgtAgeLmtYn === 'Y';
    // 자가진단 age(숫자)·랜딩 ageRange를 하나의 범위로 통일(같은 헬퍼 사용).
    const ageRange = deriveAgeRange(profile);

    // 1) 연령 범위 판정.
    let ageChecked = false;   // 전체 통과
    let agePartial = false;   // 일부만 통과
    if (ageLimited) {
        const j = judgeAgeRange(ageRange, min, max);
        if (j === 'fail') {
            // 범위 전체가 미달/초과 → danger.
            return {
                level: 'danger', text: '기준 검토 필요',
                title: `연령 기준 ${ageBoundLabel(min, max)} — 내 조건(${rangeLabel(ageRange)})으로 대상 아님`,
            };
        }
        if (j === 'pass') ageChecked = true;
        else if (j === 'partial') agePartial = true;
        // 'unknown' → 대조 불가(아래 모호 warn)
    }

    const reasons = [];
    if (regionJudge === 'match') reasons.push(`거주지(${policyRegionLabel(p)}) 일치`);
    if (ageChecked) reasons.push(`연령(${ageBoundLabel(min, max)}) 충족`);

    // 2) 연령 부분 통과: 범위 일부만 대상 → 연령 확인 필요(warn).
    if (agePartial) {
        reasons.unshift(`연령 확인 필요 — 기준 ${ageBoundLabel(min, max)}, 내 조건 ${rangeLabel(ageRange)} 일부만 해당`);
        return { level: 'warn', text: '연령 확인 필요', title: reasons.join(' · ') };
    }

    // 3) 소득 조건: 무관이 아니면 서류로 확인 필요(상세 대조 불가) → warn.
    const incomeCode = p.earnCndSeCd;
    const hasIncomeCond = incomeCode && incomeCode !== INCOME_NONE;
    if (hasIncomeCond) {
        reasons.push('소득 조건 있음(서류 확인)');
        return { level: 'warn', text: '서류 확인 필요', title: reasons.join(' · ') };
    }
    reasons.push('소득 무관');

    // 4) 연령 제한이 있으나 대조 불가(나이 미입력 등) → 모호.
    if (ageLimited && !ageChecked && !agePartial) {
        reasons.unshift('연령 조건 확인 불가');
        return { level: 'warn', text: '서류 확인 필요', title: reasons.join(' · ') };
    }

    // 5) 학력요건(schoolCd) 대조 — 확실 매핑만(D4). 제한 있으나 확실 대조 불가면 safe→warn 강등.
    //    (제한없음/충족은 통과. danger로는 절대 격상하지 않음 — 보수적.)
    const schoolJudge = judgeSchool(p.schoolCd, profile.education);
    if (schoolJudge === 'unknown') {
        reasons.push('학력 조건 확인 필요');
        return { level: 'warn', text: '학력 조건 확인 필요', title: reasons.join(' · ') };
    }

    // 6) 확인 가능한 조건 전부 통과 → safe.
    if (!ageLimited) reasons.unshift('연령 제한 없음');
    return { level: 'safe', text: '신청 가능성 높음', title: reasons.join(' · ') };
}

// 정책 샘플 + 프로필 → (선택) 분야(lclsf) 필터 후 '신청 가능성 높음(safe)' 건수 집계.
// SelfDiagnosisPage 게이지와 StartPage 즉시결과가 공유하는 공용 산식.
// lclsf가 비면(null/미지정) 분야 필터 없이 전체 샘플을 대상으로 집계한다.
// 마감 경과(접수 종료일이 오늘 이전) 정책은 eligible에서 제외 — "지금 신청 가능한 N건"
// 문구와 일치시키기 위함(recommendRank 랭킹과 동일한 기준, policyDates 공유).
// 종료일 파싱 불가(상시 신청 등)는 포함 유지. 이 개선은 게이지·즉시결과에 함께 적용된다.
// @returns {{ total:number, eligible:number }}
export function countEligible(policies, profile, lclsf = null) {
    const list = Array.isArray(policies) ? policies : [];
    const inCat = lclsf ? list.filter((p) => policyMatchesLclsf(p, lclsf)) : list;
    const total = inCat.length;
    const eligible = inCat.filter(
        (p) => computeVerdict(p, profile).level === 'safe' && !isEndDateExpired(p?.aplyYmd),
    ).length;
    return { total, eligible };
}

// 배지 level → 필터 탭 키.
export const LEVEL_TO_FILTER = { safe: 'SAFE', warn: 'WARN', danger: 'DANGER', neutral: 'ALL' };

export default computeVerdict;
