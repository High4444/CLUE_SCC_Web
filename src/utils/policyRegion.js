// 공고 1건의 "실제 적용 지역"을 기관명에서 뽑아낸다.
//
// 배경(실측 2026-10-11, :3002):
//  - getPolicies의 zipCd 쿼리는 사실상 필터가 걸리지 않는다. 서울(11000)·부산(26000)·경남(48000)으로
//    각각 조회해도 상위 기관 분포가 동일했다(세종 62건·충북 63건이 200건 표본의 62%).
//  - 응답의 zipCd 필드도 거의 전부 256개(전국 16개 시·도)라 지역 판별에 쓸 수 없다.
//  - 반면 rgtrUpInstCdNm(등록 상위기관)은 "경기도 / 전북특별자치도 / 조달청"처럼
//    광역 지자체명 또는 중앙부처명이 그대로 들어와 지역 판별이 가능하다.
// → 지역 스코프는 서버 쿼리가 아니라 이 모듈의 기관명 판정으로 건다.

// 공식 기관명에 등장하는 표기 → 프로필이 쓰는 시·도 축약명(profileFilters의 REGION_TO_ZIP 키와 동일).
// 긴 표기를 먼저 보도록 배열 순서를 유지한다("전라남도"가 "전남"보다 먼저).
const INST_TO_REGION = [
    ['서울특별시', '서울'], ['경기도', '경기'], ['인천광역시', '인천'],
    ['부산광역시', '부산'], ['대구광역시', '대구'], ['광주광역시', '광주'],
    ['대전광역시', '대전'], ['울산광역시', '울산'], ['세종특별자치시', '세종'],
    ['강원특별자치도', '강원'], ['강원도', '강원'],
    ['충청북도', '충북'], ['충청남도', '충남'],
    ['전북특별자치도', '전북'], ['전라북도', '전북'],
    ['전라남도', '전남'],
    ['경상북도', '경북'], ['경상남도', '경남'],
    ['제주특별자치도', '제주'], ['제주도', '제주'],
    // 축약 표기로만 들어오는 경우(기관명 끝에 "…도/시" 없이 쓰이는 케이스)
    ['서울시', '서울'], ['인천시', '인천'], ['부산시', '부산'], ['대구시', '대구'],
    ['광주시', '광주'], ['대전시', '대전'], ['울산시', '울산'], ['세종시', '세종'],
];

// 두 개 이상의 시·도를 함께 담당하는 기관 표기.
const INST_TO_MULTI_REGION = [
    ['전남광주통합특별시', ['전남', '광주']],
];

const INST_FIELDS = ['rgtrUpInstCdNm', 'rgtrHghrkInstCdNm', 'rgtrInstCdNm', 'sprvsnInstCdNm'];

// 법정동 시·도 2자리 → 시·도 축약명. zipCd 폴백에서만 쓴다.
const ZIP_PREFIX_TO_REGION = {
    11: '서울', 26: '부산', 27: '대구', 28: '인천', 29: '광주', 30: '대전', 31: '울산', 36: '세종',
    41: '경기', 42: '강원', 43: '충북', 44: '충남', 45: '전북', 46: '전남', 47: '경북', 48: '경남',
    50: '제주', 51: '강원', 52: '전북', // 51·52는 강원·전북특별자치도 신코드
};

// 기관명에 시·도가 없는 공고의 폴백. 부서명만 들어오는 지자체 공고를 구제한다.
// 예) "청년정책관 / 새마을공동체과"(충남) 170건 — 이름만으론 전국 공고와 구분되지 않는다.
// 조건:
//  - rgtrUpInstCd가 중앙부처(1로 시작)·공공기관(B로 시작)이 아닐 것. 중앙부처는 zipCd가 전국이지만
//    소재지 때문에 서울로 오판될 여지를 아예 막는다.
//  - zipCd가 가리키는 시·도가 정확히 하나일 것(전국 256개짜리는 변별력이 없으므로 제외).
// 실측(1,500건): 이 규칙에 걸리는 171건이 전원 충남으로, 오분류 0건이었다.
function regionFromZipCd(policy) {
    const code = String(policy.rgtrUpInstCd || '');
    if (code.startsWith('1') || code.startsWith('B')) return null;
    const sido = new Set();
    for (const c of String(policy.zipCd || '').split(',')) {
        const t = c.trim();
        if (t.length >= 2) sido.add(Number(t.slice(0, 2)));
        if (sido.size > 1) return null; // 둘 이상 → 광역 특정 불가
    }
    if (sido.size !== 1) return null;
    return ZIP_PREFIX_TO_REGION[[...sido][0]] || null;
}

// 공고 객체 → 판정 결과 캐시. 표본이 1,000건 넘고 랭킹이 렌더마다 돌기 때문에
// 기관명 문자열 탐색(필드 4 × 토큰 28)을 공고당 한 번만 한다. 응답 객체는 재사용되므로 WeakMap이면 충분.
const REGION_CACHE = new WeakMap();

/**
 * 공고가 적용되는 시·도 목록.
 * @returns {string[]} 지자체 공고면 해당 시·도 축약명 배열, 중앙부처·공공기관(전국)이면 빈 배열.
 */
export function policyRegions(policy) {
    if (!policy) return [];
    const cached = REGION_CACHE.get(policy);
    if (cached) return cached;
    const found = resolveRegions(policy);
    REGION_CACHE.set(policy, found);
    return found;
}

function resolveRegions(policy) {
    for (const field of INST_FIELDS) {
        const name = String(policy[field] || '');
        if (!name) continue;
        for (const [token, regions] of INST_TO_MULTI_REGION) {
            if (name.includes(token)) return regions.slice();
        }
        for (const [token, region] of INST_TO_REGION) {
            if (name.includes(token)) return [region];
        }
    }
    const byZip = regionFromZipCd(policy);
    if (byZip) return [byZip];
    return []; // 시·도도 zipCd도 특정 못 하면 중앙부처·공공기관 → 전국 공고로 본다
}

/**
 * 공고 지역 vs 내 거주지 판정.
 *   'nationwide' : 전국 공고(중앙부처·공공기관) — 거주지와 무관하게 신청 가능
 *   'match'      : 내 거주 시·도의 지자체 공고
 *   'other'      : 다른 시·도의 지자체 공고 — 거주 요건에 걸릴 가능성이 높음
 *   'unknown'    : 내 거주지를 모름(프로필 미입력) → 판정 보류
 * @param {object} policy
 * @param {string[]} myRegions 프로필에서 뽑은 시·도 축약명 배열(deriveRegions 결과)
 * @returns {'nationwide'|'match'|'other'|'unknown'}
 */
export function judgeRegion(policy, myRegions) {
    const target = policyRegions(policy);
    if (target.length === 0) return 'nationwide';
    const mine = Array.isArray(myRegions) ? myRegions.filter(Boolean) : [];
    if (mine.length === 0) return 'unknown';
    return target.some((r) => mine.includes(r)) ? 'match' : 'other';
}

// 배지 문구용 라벨("경기" → "경기 지역 공고").
export function policyRegionLabel(policy) {
    const r = policyRegions(policy);
    if (r.length === 0) return '전국';
    return r.join('·');
}

export default judgeRegion;
