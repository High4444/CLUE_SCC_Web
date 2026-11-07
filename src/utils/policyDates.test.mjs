// policyDates 단위 테스트 — 마감 경과/미래/파싱불가 3케이스.
// countEligible(verdictEngine) 집계 게이트가 이 isEndDateExpired에 위임하므로,
// 여기서 3케이스의 판정을 고정 시각으로 검증하면 집계 반영 효과를 그대로 커버한다.
//
// 러너·라이브러리 설치 없이 실행하려고 소스를 data: URL(ESM)로 로드한다.
// policyDates.js는 상대 import가 없어 안전(profileFilters.test.mjs와 동일 방식).
//   실행: node src/utils/policyDates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./policyDates.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript,' + encodeURIComponent(src));
const { parsePolicyEndDate, isEndDateExpired } = mod;

const NOW = new Date(2026, 6, 8); // 2026-07-08 (고정 기준일)

// ── parsePolicyEndDate: 형태별 파싱 ───────────────────────────────────
test('parsePolicyEndDate: 기간형은 종료일, 단일형은 그 값', () => {
    assert.deepEqual(parsePolicyEndDate('20260101 ~ 20260715'), new Date(2026, 6, 15));
    assert.deepEqual(parsePolicyEndDate('20260715'), new Date(2026, 6, 15));
    assert.deepEqual(parsePolicyEndDate('2026.07.15'), new Date(2026, 6, 15));
});

test('parsePolicyEndDate: 파싱 불가(상시/빈값/월일 범위 초과) → null', () => {
    assert.equal(parsePolicyEndDate(''), null);
    assert.equal(parsePolicyEndDate('상시'), null);
    assert.equal(parsePolicyEndDate(undefined), null);
    assert.equal(parsePolicyEndDate('20261399'), null); // 13월·99일
});

// ── isEndDateExpired: 집계 제외 게이트(3케이스) ────────────────────────
test('마감 경과(종료일 어제) → true (집계 제외)', () => {
    assert.equal(isEndDateExpired('20260707', NOW), true);
    assert.equal(isEndDateExpired('20260101 ~ 20260707', NOW), true);
});

test('미래 마감(종료일 내일/당일) → false (집계 포함)', () => {
    assert.equal(isEndDateExpired('20260709', NOW), false); // 내일
    assert.equal(isEndDateExpired('20260708', NOW), false); // 당일은 아직 유효
    assert.equal(isEndDateExpired('20260101 ~ 20260801', NOW), false);
});

test('종료일 파싱 불가(상시 등) → false (집계 포함)', () => {
    assert.equal(isEndDateExpired('상시', NOW), false);
    assert.equal(isEndDateExpired('', NOW), false);
    assert.equal(isEndDateExpired(undefined, NOW), false);
});
