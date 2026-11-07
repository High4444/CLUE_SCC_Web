// 프로필 "표시 전용" 셀렉터 (파트1 결정 D1·D2·D6 정본).
// 데이터 흐름 규칙(docs/plans/PART1_PROFILE_AXIS.md):
//   - 표시(위젯·마이페이지·비교 페이지) = 이 셀렉터만 읽는다. 원시 필드(profile.age/region/…) 직접 접근 금지.
//   - 소비(조회·판정) = profileFilters의 derive 헬퍼(deriveAgeRange/deriveRegions/profileToLclsfSet).
//
// 랜딩(StartPage)만 한 유저와 자가진단(정밀)까지 한 유저를 하나의 표시 규격으로 통일한다.
//   랜딩 저장분 : { ageRange, regions[], interests["key:opt"], savedAt } (age/region/employment/education 없음)
//   자가진단 저장분: { age(number), region, employment, education, income, householdSize, household, … }

import { deriveAgeRange, deriveRegions, profileToLclsfSet, regionsToProvinceName, ageRangeLabel } from './profileFilters';

// 완료도 tier → 배지 문구(D6). none은 기존 "진단 전" 표기 유지.
const TIER_LABEL = { none: '진단 전', basic: '기본 설정 완료', full: '정밀 진단 완료' };

// 상태 배지 폴백(D2). employment도 status 태그도 없을 때.
const STATUS_FALLBACK = '청년';

function nonEmptyStr(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : '';
}

// interests(랜딩 페르소나 태그 "key:opt")에서 첫 status 라벨 유도. 없으면 ''.
function statusFromInterests(interests) {
    if (!Array.isArray(interests)) return '';
    const tag = interests.find((t) => typeof t === 'string' && t.startsWith('status:'));
    return tag ? tag.slice('status:'.length).trim() : '';
}

// 완료도 tier 판정.
//   full : 자가진단(정밀) 흔적 존재 — employment/education/숫자 age 중 하나라도 있으면(랜딩은 셋 다 없음).
//   basic: 랜딩 최소 — ageRange 또는 regions 또는 interests만 있음.
//   none : 프로필 없음 또는 아무 신호 없음.
export function profileTier(profile) {
    if (!profile || typeof profile !== 'object') return 'none';
    const preciseAge = Number.isFinite(Number(profile.age)) && Number(profile.age) > 0;
    const hasFullSignal = !!(nonEmptyStr(profile.employment) || nonEmptyStr(profile.education) || preciseAge);
    if (hasFullSignal) return 'full';
    const hasAgeRange = profile.ageRange && Number.isFinite(Number(profile.ageRange.min));
    const hasRegions = Array.isArray(profile.regions) && profile.regions.length > 0;
    const hasInterests = Array.isArray(profile.interests) && profile.interests.length > 0;
    return (hasAgeRange || hasRegions || hasInterests) ? 'basic' : 'none';
}

// 나이 표시: 정밀 age → "N세", 랜딩 ageRange → 칩 라벨("만 19~34세") 또는 "min~max세", 없으면 ''.
function displayAge(profile) {
    return ageRangeLabel(deriveAgeRange(profile));
}

// 거주 표시: region 우선(정밀). regions 1개면 그대로, 도 단위 묶음이면 "경상", 그 외 복수면 "경기 외 1", 없으면 ''.
function displayRegion(profile) {
    const arr = deriveRegions(profile); // 단일 region 우선, 없으면 regions[]
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    return regionsToProvinceName(arr) || `${arr[0]} 외 ${arr.length - 1}`;
}

/**
 * 원시 프로필 → 표시용 통일 뷰(D1). null-safe.
 * @returns {{
 *   tier:'none'|'basic'|'full', hasProfile:boolean, completionLabel:string,
 *   age:string, region:string, status:string, statusBadge:string,
 *   education:string, income:string, household:string, interests:string[]
 * }}
 *   - status     : 원시 상태(employment 우선 → status 태그) — 없으면 ''(마이페이지 "미설정"용).
 *   - statusBadge: status || '청년' — 헤더 위젯 배지용(항상 값 존재, D2).
 */
export function getDisplayProfile(profile) {
    const tier = profileTier(profile);
    if (tier === 'none' || !profile) {
        return {
            tier: 'none', hasProfile: false, completionLabel: TIER_LABEL.none,
            age: '', region: '', status: '', statusBadge: STATUS_FALLBACK,
            education: '', income: '', household: '', interests: [],
        };
    }

    // 상태(D2): employment(정밀) 우선 → interests의 status 태그 → 폴백.
    const status = nonEmptyStr(profile.employment) || statusFromInterests(profile.interests);

    return {
        tier,
        hasProfile: true,
        completionLabel: TIER_LABEL[tier],
        age: displayAge(profile),
        region: displayRegion(profile),
        status,
        statusBadge: status || STATUS_FALLBACK,
        education: nonEmptyStr(profile.education),
        income: nonEmptyStr(profile.income),
        household: nonEmptyStr(profile.householdSize) || nonEmptyStr(profile.household),
        // 관심분야 = interests(취업상태 폴백 포함) → 정책 분야(lclsfNm) 라벨 집합.
        interests: Array.from(profileToLclsfSet(profile)),
    };
}

export default getDisplayProfile;
