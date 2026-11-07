// 파트2(문서 생애주기 축) 단위 테스트 — 러너/라이브러리 설치 없이 node로 실행.
//   실행: node src/store/documentAxis.test.mjs
//
// 이 저장소는 package.json이 commonjs라 node가 ESM 소스(.js)를 직접 import할 수 없어,
// 소스 텍스트를 data: URL(항상 ESM)로 로드한다. store 소스는 './syncLayer' 상대 import가
// 있으므로 그 줄만 no-op(syncPush)로 치환해 로드한다(부수효과 없이 순수 로직만 검증).
//
// 커버리지:
//  - checklistStore 수동 내역 영속(saveManualEntry/listManualEntries/deleteManualEntry) — B5
//  - calendarStore 캘린더 추가 3분기 근거(hasEventForDoc/addEventForDoc) — B3
//  - documentStore 상태 역행 가드 근거(updateStatus/updateReview 시맨틱) — B1

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// ── 인메모리 localStorage 셰임(모듈 로드 전에 전역 설치) ──
function installLocalStorage() {
    const map = new Map();
    globalThis.localStorage = {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
        clear: () => { map.clear(); },
    };
    return map;
}

// store 소스를 syncLayer import 없이 data URL 모듈로 로드.
async function loadStore(relPath) {
    let src = await readFile(new URL(relPath, import.meta.url), 'utf8');
    src = src.replace(/import\s*\{\s*syncPush\s*\}\s*from\s*['"]\.\/syncLayer['"];?/,
        'const syncPush = () => {};');
    return import('data:text/javascript,' + encodeURIComponent(src));
}

installLocalStorage();
const checklist = await loadStore('./checklistStore.js');
const calendar = await loadStore('./calendarStore.js');
const documents = await loadStore('./documentStore.js');

test('B5: 수동 내역 저장 → 목록 복원(manual 플래그 부여)', () => {
    globalThis.localStorage.clear();
    const entry = { id: 'm1', title: '직접 추가 공고', memo: '메모', checklistItems: [{ id: 1, label: '서류', done: false }] };
    assert.equal(checklist.saveManualEntry(entry), true);

    const list = checklist.listManualEntries();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'm1');
    assert.equal(list[0].title, '직접 추가 공고');
    assert.equal(list[0].manual, true);
    assert.equal(list[0].checklistItems.length, 1);
});

test('B5: 같은 id 재저장은 병합 업데이트(중복 추가 아님)', () => {
    globalThis.localStorage.clear();
    checklist.saveManualEntry({ id: 'm1', title: 'A', isApplied: false });
    checklist.saveManualEntry({ id: 'm1', title: 'A', isApplied: true, memo: '완료' });

    const list = checklist.listManualEntries();
    assert.equal(list.length, 1);
    assert.equal(list[0].isApplied, true);
    assert.equal(list[0].memo, '완료');
});

test('B5: 수동 내역 삭제', () => {
    globalThis.localStorage.clear();
    checklist.saveManualEntry({ id: 'm1', title: 'A' });
    checklist.saveManualEntry({ id: 'm2', title: 'B' });
    assert.equal(checklist.deleteManualEntry('m1'), true);

    const list = checklist.listManualEntries();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'm2');
});

test('B5: 문서 파생 진행상태(clue_checklist)와 수동 내역(clue_manual_entries)은 별도 키', () => {
    globalThis.localStorage.clear();
    checklist.setApplied('doc-1', true, '2026-07-08'); // 문서 파생 진행상태
    checklist.saveManualEntry({ id: 'm1', title: 'A' }); // 수동 내역

    // 수동 목록엔 문서 파생분이 섞이지 않는다.
    const manual = checklist.listManualEntries();
    assert.equal(manual.length, 1);
    assert.equal(manual[0].id, 'm1');
    // 문서 진행상태는 그대로 조회 가능.
    assert.equal(checklist.getChecklistState('doc-1').applied, true);
});

test('B3: 마감일 있는 문서는 캘린더 등록 → hasEventForDoc true (분기 ②)', () => {
    globalThis.localStorage.clear();
    const doc = { docId: 'd1', fileName: '공고.pdf', deadline: '2026-07-31', deadlineSource: 'manual' };
    assert.equal(calendar.hasEventForDoc('d1'), false); // 등록 전
    assert.equal(calendar.addEventForDoc(doc), true);
    assert.equal(calendar.hasEventForDoc('d1'), true);  // 등록 후(분기 ①의 근거)

    const events = calendar.listEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'doc-d1');
    assert.equal(events[0].deadline, '2026.07.31'); // 점 구분 포맷
});

test('B3: 마감일 없는 문서는 등록 불가 → hasEventForDoc false (분기 ③)', () => {
    globalThis.localStorage.clear();
    const doc = { docId: 'd2', fileName: '공고.pdf', deadline: null };
    assert.equal(calendar.addEventForDoc(doc), false);
    assert.equal(calendar.hasEventForDoc('d2'), false);
    assert.equal(calendar.listEvents().length, 0);
});

test('B3: 이미 등록된 문서 재등록은 중복 없이 갱신(분기 ①)', () => {
    globalThis.localStorage.clear();
    calendar.addEventForDoc({ docId: 'd1', fileName: '공고.pdf', deadline: '2026-07-31' });
    calendar.addEventForDoc({ docId: 'd1', fileName: '공고(수정).pdf', deadline: '2026-08-01' });

    const events = calendar.listEvents();
    assert.equal(events.length, 1); // 중복 추가되지 않음
    assert.equal(events[0].deadline, '2026.08.01');
});

test('B8: removeEventForDoc + updateDeadline(null) 역방향 동기화 근거', () => {
    globalThis.localStorage.clear();
    documents.upsertDocument({ docId: 'd1', fileName: '공고.pdf', status: 'completed', deadline: '2026-07-31', deadlineSource: 'manual' });
    calendar.addEventForDoc(documents.getDocument('d1'));
    assert.equal(calendar.hasEventForDoc('d1'), true);

    // 캘린더에서 삭제 시 수행하는 두 동작.
    documents.updateDeadline('d1', null);
    calendar.removeEventForDoc('d1');

    assert.equal(calendar.hasEventForDoc('d1'), false);
    assert.equal(documents.getDocument('d1').deadline, null);
    assert.equal(documents.getDocument('d1').deadlineSource, null);
});

test('B1: 상태 역행 가드 근거 — updateReview는 status를 건드리지 않는다', () => {
    globalThis.localStorage.clear();
    documents.upsertDocument({ docId: 'd1', fileName: '공고.pdf', status: 'reviewing' });
    documents.updateStatus('d1', 'completed');
    assert.equal(documents.getDocument('d1').status, 'completed');
    assert.ok(typeof documents.getDocument('d1').completedAt === 'number');

    // "검토 내용 저장"(temp)이 completed 문서에서 하는 일: updateStatus 호출 없이 review만 갱신.
    documents.updateReview('d1', { quizAnswered: true, lastViewedAt: 123 });
    const doc = documents.getDocument('d1');
    assert.equal(doc.status, 'completed');            // 역행하지 않음
    assert.equal(doc.review.quizAnswered, true);      // review만 갱신됨
});

test('B7: 저장 review에 verifiedRiskIds를 쓰지 않아도 정상 동작', () => {
    globalThis.localStorage.clear();
    documents.upsertDocument({ docId: 'd1', fileName: '공고.pdf', status: 'reviewing' });
    documents.updateReview('d1', { quizAnswered: false, lastViewedAt: 1 });
    assert.equal('verifiedRiskIds' in documents.getDocument('d1').review, false);
});
