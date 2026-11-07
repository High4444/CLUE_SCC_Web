// profileFilters 단위 테스트 (진단 재설계: 17 지역·40~45·상태5종·구태그 호환).
//
// 이 저장소는 아직 테스트 러너(vitest 등)가 설치돼 있지 않고 package.json이 commonjs라
// node로 ESM 소스(.js)를 직접 import할 수 없다. 러너·새 라이브러리 설치 없이 실행하기 위해
// 소스 파일 내용을 data: URL(항상 ESM)로 로드한다. 소스는 상대 import가 없어 안전.
//   실행: node src/utils/profileFilters.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./profileFilters.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript,' + encodeURIComponent(src));
const {
    normalizeProfileFromTags,
    regionsToZipCds,
    regionToZipCd,
    deriveAgeRange,
    deriveRegions,
    interestsToLclsfSet,
    profileToLclsfSet,
    LCLSF,
} = mod;

// ── 지역: 17개 시·도 직접 선택 → regions:[단일] ──────────────────────────
test('region 태그(17 시·도) → 단일 시·도 배열', () => {
    for (const sido of ['서울', '경기', '제주', '세종', '강원', '전북', '광주']) {
        const p = normalizeProfileFromTags({}, [`region:${sido}`]);
        assert.deepEqual(p.regions, [sido], `${sido} 단일 매핑`);
    }
});

test('region 구태그(묶음) 하위호환', () => {
    assert.deepEqual(normalizeProfileFromTags({}, ['region:경기·인천']).regions, ['경기', '인천']);
    assert.deepEqual(normalizeProfileFromTags({}, ['region:광역시']).regions, ['부산', '대구', '광주', '대전', '울산']);
    assert.deepEqual(
        normalizeProfileFromTags({}, ['region:지방 (그 외)']).regions,
        ['강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '세종']
    );
});

test('region 도 단위 태그(충청·전라·경상) → 광역시 포함 다지역, 단일 region 제거', () => {
    const p = normalizeProfileFromTags({ region: '서울' }, ['region:경상']);
    assert.deepEqual(p.regions, ['부산', '대구', '울산', '경북', '경남']);
    assert.equal(p.region, undefined);
    assert.deepEqual(normalizeProfileFromTags({}, ['region:충청']).regions, ['대전', '세종', '충북', '충남']);
    assert.deepEqual(normalizeProfileFromTags({}, ['region:전라']).regions, ['광주', '전북', '전남']);
    assert.equal(mod.regionsToProvinceName(['광주', '전북', '전남']), '전라');
    assert.equal(mod.regionsToProvinceName(['경기', '인천']), null);
});

test('알 수 없는 region 태그는 무시(regions 미설정)', () => {
    const p = normalizeProfileFromTags({}, ['region:없는지역']);
    assert.equal(p.regions, undefined);
});

// ── 나이: 40~45세 신설 ────────────────────────────────────────────────
test('age 태그 40~45세 → ageRange {40,45}', () => {
    assert.deepEqual(normalizeProfileFromTags({}, ['age:40~45세']).ageRange, { min: 40, max: 45 });
});

test('age 신 5구간(만 나이) → ageRange, 열린 구간은 15·100으로 닫음', () => {
    assert.deepEqual(normalizeProfileFromTags({}, ['age:만 18세 이하']).ageRange, { min: 15, max: 18 });
    assert.deepEqual(normalizeProfileFromTags({}, ['age:만 19~34세']).ageRange, { min: 19, max: 34 });
    assert.deepEqual(normalizeProfileFromTags({}, ['age:만 40~64세']).ageRange, { min: 40, max: 64 });
    assert.deepEqual(normalizeProfileFromTags({}, ['age:만 65세 이상']).ageRange, { min: 65, max: 100 });
    assert.equal(mod.ageRangeLabel({ min: 65, max: 100 }), '만 65세 이상');
    assert.equal(mod.ageRangeLabel({ min: 27, max: 27 }), '27세');
    assert.equal(mod.ageRangeLabel({ min: 25, max: 29 }), '25~29세');
});

test('age 태그 기존 구간 유지(하위호환)', () => {
    assert.deepEqual(normalizeProfileFromTags({}, ['age:19~24세']).ageRange, { min: 19, max: 24 });
    assert.deepEqual(normalizeProfileFromTags({}, ['age:35~39세']).ageRange, { min: 35, max: 39 });
});

// ── 축 단위 "마지막 명시 입력 승리"(랜딩에서 고른 축은 기존 정밀 필드를 덮어씀) ──
test('랜딩에서 선택한 축은 기존 정밀 age/region을 덮어씀', () => {
    const p = normalizeProfileFromTags({ age: 27, region: '부산' }, ['age:40~45세', 'region:서울']);
    assert.deepEqual(p.ageRange, { min: 40, max: 45 }); // 나이 축 선택 → 범위로 교체
    assert.equal(p.age, undefined);                     // 정밀 age는 제거
    assert.deepEqual(p.regions, ['서울']);              // 지역 축 선택 → regions 갱신
    assert.equal(p.region, '서울');                     // 단일 시·도 → 정밀 region도 갱신(과거 '부산' 폐기)
});

test('선택 안 한 축과 자가진단 전용 필드는 보존', () => {
    // 지역만 선택 — age/employment/income은 그대로 남는다.
    const p = normalizeProfileFromTags(
        { age: 27, region: '부산', employment: '재학중', income: '200~300만 원' },
        ['region:서울']
    );
    assert.equal(p.age, 27);              // 나이 축 미선택 → 정밀 age 보존
    assert.equal(p.employment, '재학중'); // 상태 축 미선택 → employment 보존
    assert.equal(p.income, '200~300만 원'); // 자가진단 전용 필드 보존
    assert.equal(p.region, '서울');       // 지역 축만 교체
});

test('구 묶음 region 태그는 regions만 갱신하고 단일 region은 폐기', () => {
    const p = normalizeProfileFromTags({ region: '부산' }, ['region:경기·인천']);
    assert.deepEqual(p.regions, ['경기', '인천']);
    assert.equal(p.region, undefined); // 다지역 → 단일 region 제거(regions로 폴백)
});

// ── status 축 → employment 갱신/제거 ──────────────────────────────────
test('status 태그 → employment 대응 라벨로 갱신(구직 중→미취업, 재학 중→재학중)', () => {
    assert.equal(normalizeProfileFromTags({ employment: '재학중' }, ['status:구직 중']).employment, '미취업');
    assert.equal(normalizeProfileFromTags({ employment: '미취업' }, ['status:재학 중']).employment, '재학중');
});

test('status 태그가 대응 없으면 employment 제거(표시 계층 폴백)', () => {
    for (const s of ['재직 중', '창업 준비·운영', '프리랜서·자영업']) {
        const p = normalizeProfileFromTags({ employment: '재학중' }, [`status:${s}`]);
        assert.equal(p.employment, undefined, `${s} → employment 제거`);
    }
});

test('시나리오: 옛 정밀 프로필 + 랜딩 [경기·30~34·구직 중]', () => {
    const old = { age: 25, region: '서울', employment: '재학중', income: '200~300만 원' };
    const p = normalizeProfileFromTags(old, ['region:경기', 'age:30~34세', 'status:구직 중']);
    assert.equal(p.region, '경기');
    assert.deepEqual(p.regions, ['경기']);
    assert.deepEqual(p.ageRange, { min: 30, max: 34 });
    assert.equal(p.age, undefined);           // 정밀 age 제거
    assert.equal(p.employment, '미취업');     // 구직 중 → 미취업
    assert.equal(p.income, '200~300만 원');   // 자가진단 전용 필드 보존
    assert.deepEqual(deriveRegions(p), ['경기']);
    assert.equal(regionsToZipCds(deriveRegions(p))[0], '41000');
});

// ── 상태 5종 → 분야(lclsfNm) 매핑 (interests) ───────────────────────────
test('현재 상태 신 라벨 → 분야 매핑', () => {
    const set = (tag) => [...interestsToLclsfSet([tag])];
    assert.deepEqual(set('status:구직 중'), [LCLSF.JOB]);
    assert.deepEqual(set('status:재학 중'), [LCLSF.EDU]);
    assert.deepEqual(set('status:창업 준비·운영'), [LCLSF.JOB]);
    assert.deepEqual(set('status:프리랜서·자영업'), [LCLSF.JOB]);
    assert.deepEqual(set('status:재직 중'), []); // 무매핑
});

test('현재 상태 구 라벨 하위호환', () => {
    const set = (tag) => [...interestsToLclsfSet([tag])];
    assert.deepEqual(set('status:취업준비생'), [LCLSF.JOB]);
    assert.deepEqual(set('status:재학생'), [LCLSF.EDU]);
    assert.deepEqual(set('status:프리랜서/자영업'), [LCLSF.JOB]);
});

test('profileToLclsfSet: interests 합집합 우선', () => {
    const s = profileToLclsfSet({ interests: ['region:경기', 'age:40~45세', 'status:재학 중'] });
    assert.deepEqual([...s], [LCLSF.EDU]); // region/age는 분야 무매핑, 재학 중만 반영
});

// ── zipCd / derive 헬퍼 ───────────────────────────────────────────────
test('regionsToZipCds: 경기 → 41000', () => {
    assert.deepEqual(regionsToZipCds(['경기']), ['41000']);
    assert.equal(regionToZipCd('경기'), '41000');
});

test('deriveAgeRange / deriveRegions', () => {
    assert.deepEqual(deriveAgeRange({ ageRange: { min: 40, max: 45 } }), { min: 40, max: 45 });
    assert.deepEqual(deriveAgeRange({ age: 27 }), { min: 27, max: 27 });
    assert.deepEqual(deriveRegions({ regions: ['경기'] }), ['경기']);
    assert.deepEqual(deriveRegions({ region: '부산' }), ['부산']);
});
