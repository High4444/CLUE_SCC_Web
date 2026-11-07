// policyRegion 단위 테스트 — 기관명/기관코드/zipCd로 공고의 시·도를 뽑는 규칙.
// 러너 없이 돌리기 위해 profileFilters.test.mjs와 같은 data: URL 로딩을 쓴다(상대 import 없음).
//   실행: node src/utils/policyRegion.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./policyRegion.js', import.meta.url), 'utf8');
const { policyRegions, judgeRegion, policyRegionLabel } = await import(
    'data:text/javascript,' + encodeURIComponent(src)
);

test('광역 지자체명이 상위기관에 들어오면 그 시·도로 본다', () => {
    assert.deepEqual(policyRegions({ rgtrUpInstCdNm: '경기도' }), ['경기']);
    assert.deepEqual(policyRegions({ rgtrUpInstCdNm: '서울특별시' }), ['서울']);
    assert.deepEqual(policyRegions({ rgtrUpInstCdNm: '전북특별자치도' }), ['전북']);
    assert.deepEqual(policyRegions({ rgtrUpInstCdNm: '충청북도 기획조정실' }), ['충북']);
});

test('상위기관이 비면 하위 기관명 필드로 내려가며 찾는다', () => {
    assert.deepEqual(policyRegions({ rgtrInstCdNm: '전북특별자치도 익산시' }), ['전북']);
    assert.deepEqual(policyRegions({ sprvsnInstCdNm: '제주특별자치도 서귀포시' }), ['제주']);
});

test('중앙부처·공공기관은 전국(빈 배열)', () => {
    assert.deepEqual(policyRegions({ rgtrUpInstCdNm: '국토교통부' }), []);
    assert.deepEqual(policyRegions({ rgtrUpInstCdNm: '한국관광공사' }), []);
    assert.deepEqual(policyRegions({}), []);
    assert.equal(policyRegionLabel({ rgtrUpInstCdNm: '국세청' }), '전국');
});

test('두 시·도를 함께 담당하는 기관은 둘 다 반환', () => {
    assert.deepEqual(policyRegions({ rgtrUpInstCdNm: '전남광주통합특별시' }), ['전남', '광주']);
});

test('기관명에 시·도가 없어도 지자체 코드 + 단일 zipCd면 구제한다', () => {
    // 실데이터: 충남의 "청년정책관"처럼 부서명만 들어오는 공고(표본 1,500건 중 171건).
    const chungnam = { rgtrInstCdNm: '청년정책관', rgtrUpInstCd: '6440000', zipCd: '44130,44150' };
    assert.deepEqual(policyRegions(chungnam), ['충남']);
});

test('중앙부처는 zipCd가 좁아도 지역으로 넘기지 않는다', () => {
    // 소재지 때문에 서울로 오판되는 것을 막는다(코드가 1·B로 시작하면 폴백 자체를 건너뜀).
    assert.deepEqual(policyRegions({ rgtrUpInstCdNm: '국토교통부', rgtrUpInstCd: '1613000', zipCd: '11110' }), []);
    assert.deepEqual(policyRegions({ rgtrUpInstCdNm: '정부산하기관및위원회', rgtrUpInstCd: 'B000000', zipCd: '11110' }), []);
});

test('zipCd가 여러 시·도면 폴백하지 않는다', () => {
    assert.deepEqual(policyRegions({ rgtrInstCdNm: '일자리경제과', rgtrUpInstCd: '4520000', zipCd: '11110,41111' }), []);
});

test('judgeRegion: 일치 / 타지역 / 전국 / 거주지 미입력', () => {
    const gg = { rgtrUpInstCdNm: '경기도' };
    const central = { rgtrUpInstCdNm: '국세청' };
    assert.equal(judgeRegion(gg, ['경기']), 'match');
    assert.equal(judgeRegion(gg, ['서울']), 'other');
    assert.equal(judgeRegion(gg, ['서울', '경기']), 'match'); // 다지역 프로필 중 하나만 맞아도 일치
    assert.equal(judgeRegion(central, ['서울']), 'nationwide');
    assert.equal(judgeRegion(central, []), 'nationwide');     // 전국 공고는 거주지 몰라도 통과
    assert.equal(judgeRegion(gg, []), 'unknown');             // 지자체 공고인데 거주지 미입력 → 보류
});

test('전남·광주 통합 기관은 두 지역 주민 모두에게 일치로 본다', () => {
    // 랭킹에서 'other'는 제외되므로, 통합 행정구역을 한쪽으로만 잡으면 반대쪽 주민이 통째로 놓친다.
    const merged = { rgtrUpInstCdNm: '전남광주통합특별시 화순군' };
    assert.equal(judgeRegion(merged, ['전남']), 'match');
    assert.equal(judgeRegion(merged, ['광주']), 'match');
    // 반면 광주 전용 기관은 전남 주민에게 타지역이다.
    assert.equal(judgeRegion({ rgtrInstCdNm: '광주시청' }, ['전남']), 'other');
});

test('같은 객체를 다시 넣어도 결과가 같다(WeakMap 캐시)', () => {
    const p = { rgtrUpInstCdNm: '부산광역시' };
    assert.deepEqual(policyRegions(p), ['부산']);
    assert.deepEqual(policyRegions(p), ['부산']);
});
