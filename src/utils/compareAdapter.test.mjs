// compareAdapter 단위 테스트 — 정책 비교 뷰모델 파생(D/I 병렬 · 요약 배지 · 비교 가능 판정).
// 러너/라이브러리 설치 없이 실행: node src/utils/compareAdapter.test.mjs
// compareAdapter.js는 상대 import가 없어 소스 텍스트를 data: URL(ESM)로 그대로 로드한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./compareAdapter.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript,' + encodeURIComponent(src));
const { pickAcidItems, countAcid, quizStatus, isComparable, docToCompareModel } = mod;

// 분석 완료 문서 픽스처(문서함 레코드 트림본).
function makeDoc(over = {}) {
    return {
        docId: 'doc-1',
        fileName: '서울시_청년월세지원.pdf',
        uploadedAt: new Date(2026, 6, 8, 14, 30).getTime(),
        status: 'completed',
        deadline: '2026-08-15',
        deadlineSource: 'auto',
        analysis: {
            acidResults: [
                { id: 'a-1', tag: 'A', title: '무주택 세대원' },
                { id: 'd-1', tag: 'D', title: '만 19~39세' },
                { id: 'd-2', tag: 'D', title: '중위소득 150% 이하' },
                { id: 'i-1', tag: 'I', title: '월 최대 20만원 지원' },
                { id: 'i-2', tag: 'I', evidenceText: '신청기간 8/1~8/15' },
                { id: 'c-1', tag: 'C', title: '별도 상환 없음' },
            ],
            quiz: { question: '지원 대상은?' },
        },
        review: { quizAnswered: true, quizCorrect: true },
        ...over,
    };
}

// ── pickAcidItems: 태그별 병렬 리스트 ──────────────────────────────────
test('pickAcidItems: D(자격 논리)만 순서대로 추출', () => {
    const items = pickAcidItems(makeDoc(), 'D');
    assert.deepEqual(items, [
        { id: 'd-1', text: '만 19~39세' },
        { id: 'd-2', text: '중위소득 150% 이하' },
    ]);
});

test('pickAcidItems: I(핵심 정보)는 title 없으면 evidenceText로 폴백', () => {
    const items = pickAcidItems(makeDoc(), 'I');
    assert.deepEqual(items.map((x) => x.text), ['월 최대 20만원 지원', '신청기간 8/1~8/15']);
});

test('pickAcidItems: 소문자 태그도 대문자로 매칭, 분석 없으면 빈 배열', () => {
    assert.equal(pickAcidItems({ analysis: { acidResults: [{ tag: 'd', title: 'x' }] } }, 'D').length, 1);
    assert.deepEqual(pickAcidItems({}, 'D'), []);
    assert.deepEqual(pickAcidItems(null, 'I'), []);
});

// ── countAcid: 요약 배지 항목 수 ───────────────────────────────────────
test('countAcid: A/C/I/D만 집계(기타 태그 무시)', () => {
    assert.equal(countAcid(makeDoc()), 6);
    assert.equal(countAcid({ analysis: { acidResults: [{ tag: 'X' }, { tag: 'D', title: 't' }] } }), 1);
});

// ── quizStatus: 이해점검 통과 배지 ─────────────────────────────────────
test('quizStatus: 답변+정답이면 통과', () => {
    assert.deepEqual(quizStatus(makeDoc()), { hasQuiz: true, answered: true, passed: true });
});

test('quizStatus: 답변했으나 오답이면 미통과', () => {
    const s = quizStatus(makeDoc({ review: { quizAnswered: true, quizCorrect: false } }));
    assert.equal(s.passed, false);
    assert.equal(s.answered, true);
});

test('quizStatus: 미답변이면 미통과', () => {
    const s = quizStatus(makeDoc({ review: {} }));
    assert.deepEqual(s, { hasQuiz: true, answered: false, passed: false });
});

// ── isComparable: 슬롯 선택 후보 필터 ──────────────────────────────────
test('isComparable: acidResults 1건 이상만 true', () => {
    assert.equal(isComparable(makeDoc()), true);
    assert.equal(isComparable({ docId: 'x', analysis: { acidResults: [] } }), false);
    assert.equal(isComparable({ docId: 'x' }), false);
    assert.equal(isComparable(null), false);
});

// ── docToCompareModel: 열 뷰모델 종합 ──────────────────────────────────
test('docToCompareModel: 기본 정보 + D/I 병렬 + 요약이 한 번에 파생', () => {
    const vm = docToCompareModel(makeDoc());
    assert.equal(vm.docId, 'doc-1');
    assert.equal(vm.fileName, '서울시_청년월세지원.pdf');
    assert.equal(vm.analyzedAt, '2026.07.08');
    assert.equal(vm.deadline, '2026.08.15');
    assert.equal(vm.deadlineSource, 'auto'); // "추정" 라벨 대상
    assert.equal(vm.statusLabel, '검토완료');
    assert.equal(vm.dItems.length, 2);
    assert.equal(vm.iItems.length, 2);
    assert.equal(vm.acidCount, 6);
    assert.equal(vm.quiz.passed, true);
});

test('docToCompareModel: 마감일 수동 수정본은 추정 라벨 없음, 무효 입력은 null', () => {
    const vm = docToCompareModel(makeDoc({ deadline: '2026-09-01', deadlineSource: 'manual' }));
    assert.equal(vm.deadline, '2026.09.01');
    assert.equal(vm.deadlineSource, 'manual');
    const none = docToCompareModel(makeDoc({ deadline: null, deadlineSource: null }));
    assert.equal(none.deadline, null);
    assert.equal(none.deadlineSource, null);
    assert.equal(docToCompareModel(null), null);
});
