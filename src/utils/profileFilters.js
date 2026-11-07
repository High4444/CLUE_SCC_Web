// 프로필 → 온통청년 정책 조회(getPolicies) 필터 파라미터 + 분야(lclsfNm) 분류 매핑.
// 자가진단 설문(SelfDiagnosisPage)의 선택지와 StartPage 페르소나 태그를 기준으로 구성.
//
// 중요(실측): 온통청년 getPlcy의 lclsfNm은 "서버측 필터로 동작하지 않는다".
//   - 응답에 실제로 존재하는 값('일자리' 등)을 lclsfNm 파라미터로 넘겨도 totCount=0.
//   - 업스트림이 대분류를 코드 기반으로 필터하며 한글 표시명 매칭을 지원하지 않는 것으로 추정.
//   → 따라서 분야 필터는 "지역(zipCd)으로 샘플을 받아 각 정책의 lclsfNm으로 클라이언트 분류"한다.
//     (SelfDiagnosisPage 게이지 집계와 동일한 방식 — 이 모듈로 공용화)

// 온통청년 대분류(lclsfNm) 정본 값 — 서버 응답의 실제 문자열과 정확히 일치해야 분류가 동작.
// (실측 수집: 일자리 / 교육･직업훈련 / 금융･복지･문화 / 주거 / 참여･기반)
export const LCLSF = {
    JOB: '일자리',
    EDU: '교육･직업훈련',
    WELFARE: '금융･복지･문화',
    HOUSING: '주거',
    PARTICIPATION: '참여･기반',
};

// 지역(시·도명) → zipCd(법정동 시도 5자리).
// 온통청년 zipCd는 시·도 앞 2자리 + '000'으로 시·도 단위(광역) 조회(정확 일치).
//
// ⚠️ 실측 검증(2026-07-08, :3002 실호출 totCount):
//   동작(광역단위 등록 정책 有):
//     서울11000=470 · 경기41000=521 · 인천28000=618 · 부산26000=530 · 대구27000=451
//     대전30000=423 · 울산31000=612 · 세종36000=460 · 충북43000=504 · 충남44000=713
//     경북47000=545 · 경남48000=590 · 제주50000=613
//   특별자치도는 신(新) 5자리 코드로만 반환(구 코드는 0건):
//     강원51000=495 (구 42000=0) · 전북52000=539 (구 45000=0)
//   광역단위 0건 → REGION_TO_ZIP에서 제외(무필터 폴백):
//     광주29000=0 · 전남46000=0
// 따라서 광주·전남은 매핑하지 않고, 조회 시 지역 스코프 없이(무필터) 넓게 받는다.
const REGION_TO_ZIP = {
    '서울': '11000',
    '경기': '41000',
    '인천': '28000',
    '부산': '26000',
    '대구': '27000',
    // '광주': 광역단위 0건 → 무필터(매핑 제외)
    '대전': '30000',
    '울산': '31000',
    '세종': '36000',
    '강원': '51000', // 강원특별자치도 신코드(구 42000은 0건)
    '충북': '43000',
    '충남': '44000',
    '전북': '52000', // 전북특별자치도 신코드(구 45000은 0건)
    // '전남': 광역단위 0건 → 무필터(매핑 제외)
    '경북': '47000',
    '경남': '48000',
    '제주': '50000',
    // '기타'는 시·도 특정 불가 → 무필터
};

export function regionToZipCd(region) {
    return REGION_TO_ZIP[region] || '';
}

// 시·도명 배열 → 유효 zipCd 배열(매핑 없는 지역 스킵, 중복 제거).
// 다지역 병렬 조회(대시보드 추천)에서 사용.
export function regionsToZipCds(regions) {
    const out = [];
    const seen = new Set();
    (Array.isArray(regions) ? regions : []).forEach((r) => {
        const zip = REGION_TO_ZIP[r];
        if (zip && !seen.has(zip)) { seen.add(zip); out.push(zip); }
    });
    return out;
}

// ── 랜딩(StartPage) 페르소나 태그 → 프로필 정규화 매핑 ────────────────────
// 진단 재설계(DIAGNOSIS_REDESIGN): 지역은 17개 시·도 직접 선택, 나이대는 40~45 신설.
// 사용자 결정①: 나이대 범위는 "범위 그대로" 저장·판정한다.

// 나이대 태그(옵션) → ageRange {min,max}.
// 신 5구간(2026-10-12). 열린 구간은 자가진단 슬라이더 범위(15~100)로 닫는다 — 판정 함수가 유한 경계를 요구.
const LANDING_AGE_RANGE_V2 = {
    '만 18세 이하': { min: 15, max: 18 },
    '만 19~34세': { min: 19, max: 34 },
    '만 35~39세': { min: 35, max: 39 },
    '만 40~64세': { min: 40, max: 64 },
    '만 65세 이상': { min: 65, max: 100 },
};

// 연령 범위 → 표시 라벨. 랜딩 신 구간과 정확히 같으면 칩 라벨("만 65세 이상"), 아니면 "N세"/"min~max세".
export function ageRangeLabel(range) {
    if (!range) return '';
    for (const [label, r] of Object.entries(LANDING_AGE_RANGE_V2)) {
        if (r.min === range.min && r.max === range.max) return label;
    }
    return range.min === range.max ? `${range.min}세` : `${range.min}~${range.max}세`;
}

// 구 구간(19~24 등)은 이미 저장된 interests 태그 하위호환용으로 남긴다.
const LANDING_AGE_RANGE = {
    ...LANDING_AGE_RANGE_V2,
    '19~24세': { min: 19, max: 24 },
    '25~29세': { min: 25, max: 29 },
    '30~34세': { min: 30, max: 34 },
    '35~39세': { min: 35, max: 39 },
    '40~45세': { min: 40, max: 45 },
};

// 지역 태그(신) — 17개 시·도 직접 선택 → 단일 시·도 배열.
const SIDO_LIST = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

// 거주 지역 "묶음" 태그(구) → 시·도 배열. 기존 저장된 프로필/태그 하위호환용.
// (매핑: 서울→[서울], 경기·인천→[경기,인천], 광역시→5대 광역시, 지방→그 외 시·도)
const LANDING_REGION_GROUP = {
    '서울': ['서울'],
    '경기·인천': ['경기', '인천'],
    '광역시': ['부산', '대구', '광주', '대전', '울산'],
    '지방 (그 외)': ['강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '세종'],
};

// 랜딩 지역 칩(2026-10-12 간소화): 서울·경기·인천·강원·제주는 시·도 그대로, 나머지는 도 단위로 묶는다.
// 묶음은 그 도 안의 광역시까지 포함 — 예: '경상' 선택 시 부산 거주자에게도 대구·울산·경북·경남 공고가 match로 섞인다(사용자 승인한 정확도 손해).
export const LANDING_REGION_PROVINCE = {
    '충청': ['대전', '세종', '충북', '충남'],
    '전라': ['광주', '전북', '전남'],
    '경상': ['부산', '대구', '울산', '경북', '경남'],
};

// 지역 태그값 → 시·도 배열. 17개 시·도 직접 선택이면 [단일], 도 단위·구 묶음 태그면 그 배열, 아니면 null.
function resolveRegionTag(value) {
    if (SIDO_LIST.includes(value)) return [value];
    const group = LANDING_REGION_PROVINCE[value] || LANDING_REGION_GROUP[value];
    return group ? [...group] : null;
}

// 시·도 배열이 도 단위 묶음과 정확히 같으면 그 이름('경상' 등), 아니면 null. 표시용.
export function regionsToProvinceName(regions) {
    if (!Array.isArray(regions)) return null;
    for (const [name, sidos] of Object.entries(LANDING_REGION_PROVINCE)) {
        if (sidos.length === regions.length && sidos.every(s => regions.includes(s))) return name;
    }
    return null;
}

// 프로필의 연령을 판정용 범위 {min,max}로 통일.
// 우선순위: 자가진단 age(숫자, 정밀) → {min:age,max:age}. 없으면 랜딩 ageRange. 둘 다 없으면 null.
export function deriveAgeRange(profile) {
    if (!profile) return null;
    const age = Number(profile.age);
    if (Number.isFinite(age) && age > 0) return { min: age, max: age };
    const r = profile.ageRange;
    if (r && Number.isFinite(Number(r.min)) && Number.isFinite(Number(r.max))) {
        return { min: Number(r.min), max: Number(r.max) };
    }
    return null;
}

// 프로필의 조회 대상 지역(시·도 배열)을 통일.
// 우선순위: 자가진단 단일 region(정밀, '기타' 제외) → [region]. 없으면 랜딩 regions. 둘 다 없으면 [].
export function deriveRegions(profile) {
    if (!profile) return [];
    const single = typeof profile.region === 'string' ? profile.region.trim() : '';
    if (single && single !== '기타') return [single];
    if (Array.isArray(profile.regions) && profile.regions.length) {
        return profile.regions.filter((v) => typeof v === 'string' && v.trim());
    }
    return [];
}

// 랜딩 status 태그(옵션) → 자가진단 employment 필드. "깨끗하게 대응되는" 라벨만 매핑.
// 자가진단 employment 선택지(SelfDiagnosisPage): ['재학중','미취업','중소기업 재직','대기업 재직','창업자','기타'].
//   - 구직 중 → 미취업 / 재학 중 → 재학중 (1:1 대응).
//   - 창업 준비·운영: '창업자'와 준비 단계가 불일치, 재직 중: 중소/대기업 재직 구분 불가,
//     프리랜서·자영업: 자가진단에 대응 없음 → 매핑하지 않는다(선택 시 employment를 제거).
//   - 구 라벨(취업준비생/재학생)은 하위호환으로 계속 대응.
const STATUS_TO_EMPLOYMENT = {
    '구직 중': '미취업',
    '재학 중': '재학중',
    '취업준비생': '미취업',
    '재학생': '재학중',
};

// 랜딩 페르소나 태그(interests: "key:opt")를 정규화 필드로 변환해 기존 프로필에 병합.
// 정책: 축 단위 "마지막 명시 입력 승리" — 이번에 사용자가 실제로 선택한 축은 기존 정밀 필드를 덮어쓴다.
//   - age 태그 선택 시   : ageRange = 선택 구간으로 갱신하고 정밀 age(숫자)는 제거(deriveAgeRange가 범위로 일관 처리).
//   - region 태그 선택 시 : 단일 시·도면 region·regions 둘 다 갱신(과거 region 폐기),
//                          구 묶음 태그(다지역)면 regions만 갱신하고 단일 region은 제거(regions로 폴백).
//   - status 태그 선택 시 : employment를 대응 라벨로 갱신하고, 대응이 없으면 employment를 제거
//                          (표시 계층이 status 태그(interests)로 폴백). interests 자체는 호출부에서 교체.
//   - 선택 안 한 축과 자가진단 전용 필드(income/household/education/special 등)는 그대로 보존.
export function normalizeProfileFromTags(existing, tags) {
    const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
    const list = Array.isArray(tags) ? tags : [];

    // age 축: 나이대 태그를 명시 선택했으면 ageRange로 교체하고 정밀 age는 제거.
    const ageTag = list.find((t) => typeof t === 'string' && t.startsWith('age:'));
    if (ageTag) {
        const range = LANDING_AGE_RANGE[ageTag.slice('age:'.length)];
        if (range) {
            base.ageRange = { ...range };
            delete base.age; // 정밀 숫자 폐기 → 이후 판정·표시·프리필은 범위로 일관 처리
        }
    }

    // region 축: 지역 태그를 명시 선택했으면 region/regions를 갱신(과거 region 폐기).
    const regionTag = list.find((t) => typeof t === 'string' && t.startsWith('region:'));
    if (regionTag) {
        const resolved = resolveRegionTag(regionTag.slice('region:'.length));
        if (resolved && resolved.length) {
            base.regions = resolved;
            if (resolved.length === 1) base.region = resolved[0]; // 단일 시·도(신) → 정밀 region도 갱신
            else delete base.region; // 구 묶음 태그(다지역) → 단일 region 폐기(regions로 폴백)
        }
    }

    // status 축: 상태 태그를 명시 선택했으면 employment를 대응 라벨로 갱신, 대응 없으면 제거.
    const statusTags = list.filter((t) => typeof t === 'string' && t.startsWith('status:'));
    if (statusTags.length) {
        let mappedEmployment = '';
        for (const t of statusTags) {
            const emp = STATUS_TO_EMPLOYMENT[t.slice('status:'.length)];
            if (emp) { mappedEmployment = emp; break; }
        }
        if (mappedEmployment) base.employment = mappedEmployment;
        else delete base.employment; // 대응 없음 → 표시 계층이 status(interests)로 폴백
    }

    return base;
}

// 취업 상태(employment) → 분야(lclsfNm). interests(태그)가 없을 때의 폴백 매핑.
// 설문에 별도 "관심 분야" 항목이 없어 취업 상태에서 강하게 유추되는 경우만 매핑.
// 재직·기타 등 분야가 모호하면 무필터('')로 두어 후보를 넓게 유지(0건 폴백과 함께).
const EMPLOYMENT_TO_LCLSF = {
    '미취업': LCLSF.JOB,
    '재학중': LCLSF.EDU,
    '창업자': LCLSF.JOB,
    // '중소기업 재직' / '대기업 재직' / '기타' → 무필터
};

export function employmentToLclsfNm(employment) {
    return EMPLOYMENT_TO_LCLSF[employment] || '';
}

// StartPage 페르소나 태그("key:opt") → 분야(lclsfNm) 매핑표.
// 분야를 강하게 시사하는 태그만 매핑하고, 그 외(나이대·지역 등)는
// 분야 특정 불가로 "무시"한다(매핑 불가 태그는 필터에 영향 없음).
//   - status(현재 상태, 신 라벨): 구직 중/창업 준비·운영/프리랜서·자영업 → 일자리,
//     재학 중 → 교육･직업훈련 ('재직 중'은 분야 모호 → 무시)
//   - age / region: 분야 특정 불가 → 무시(지역은 zipCd가 별도로 담당)
//   - (구 라벨·구 카테고리 household/income 태그는 하위호환으로 계속 매핑)
const INTEREST_TAG_TO_LCLSF = {
    // 현재 상태 — 신 라벨(진단 재설계)
    'status:구직 중': [LCLSF.JOB],
    'status:재학 중': [LCLSF.EDU],
    'status:창업 준비·운영': [LCLSF.JOB],
    'status:프리랜서·자영업': [LCLSF.JOB],
    // 'status:재직 중' → 분야 무매핑(무시)
    // 현재 상태 — 구 라벨(하위호환)
    'status:취업준비생': [LCLSF.JOB],
    'status:재학생': [LCLSF.EDU],
    'status:프리랜서/자영업': [LCLSF.JOB],
    // 구 카테고리(household/income) — 랜딩에서 제거됐으나 기존 저장 태그 하위호환
    'household:무주택자': [LCLSF.HOUSING],
    'household:1인 가구': [LCLSF.HOUSING],
    'income:중위소득 50% 이하': [LCLSF.WELFARE],
    'income:중위소득 50~80%': [LCLSF.WELFARE],
};

// interests(태그 배열) → 분야(lclsfNm) 집합. 다중 관심사는 합집합, 매핑 불가 태그는 무시.
export function interestsToLclsfSet(interests) {
    const set = new Set();
    if (Array.isArray(interests)) {
        for (const tag of interests) {
            const mapped = INTEREST_TAG_TO_LCLSF[tag];
            if (mapped) mapped.forEach(v => set.add(v));
        }
    }
    return set;
}

// 프로필 → 추천에 적용할 분야(lclsfNm) 집합.
// 우선순위: interests(태그, 합집합) > 자가진단 취업상태 매핑. 둘 다 없으면 빈 집합(무필터).
export function profileToLclsfSet(profile) {
    if (!profile) return new Set();
    const fromInterests = interestsToLclsfSet(profile.interests);
    if (fromInterests.size > 0) return fromInterests;
    const fromEmployment = employmentToLclsfNm(profile.employment);
    return fromEmployment ? new Set([fromEmployment]) : new Set();
}

// 정책 하나가 주어진 분야(lclsfNm 문자열 / 배열 / Set)에 속하는지.
export function policyMatchesLclsf(policy, lclsf) {
    const v = policy?.lclsfNm;
    if (!v) return false;
    if (lclsf instanceof Set) return lclsf.has(v);
    if (Array.isArray(lclsf)) return lclsf.includes(v);
    return v === lclsf;
}

// 정책 목록을 분야로 클라이언트 분류. 분야가 비면(무필터) 원본 그대로 반환.
export function filterPoliciesByLclsf(policies, lclsf) {
    if (!Array.isArray(policies)) return [];
    const empty =
        !lclsf ||
        (lclsf instanceof Set && lclsf.size === 0) ||
        (Array.isArray(lclsf) && lclsf.length === 0);
    if (empty) return policies;
    return policies.filter(p => policyMatchesLclsf(p, lclsf));
}

// 프로필 → getPolicies에 넘길 서버 필터 파라미터(빈 값은 제외).
// lclsfNm은 서버 필터로 무효(상단 주석)라 넘기지 않는다 — 분야는 클라이언트 분류로 처리.
export function buildPolicyQuery(profile) {
    if (!profile) return {};
    const query = {};
    const zip = regionToZipCd(profile.region);
    if (zip) query.zipCd = zip;
    return query;
}

export default buildPolicyQuery;
