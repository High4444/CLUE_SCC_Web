// 분석 완료 문서 → 정책 비교 뷰모델(순수).
//
// 근거(docs/plans/PART5_FINAL_AXIS.md): 정책 비교는 프리셋이 아니라 "분석 완료된 내 문서 2개"의
// ACID 결과를 실비교한다. checklistAdapter와 동일한 tag 규약(대문자 A/C/I/D)을 쓴다.
//   - D(자격 논리): 자격 조건 대조
//   - I(핵심 정보): 준비·핵심 정보 대조(기간·서류·금액)
//
// 이 모듈은 상대 import가 없어(순수) node:test에서 소스 텍스트 로드로 그대로 검증된다.

// 특정 ACID 태그 항목만 뽑아 병렬 리스트용 {id, text}로 정규화.
export function pickAcidItems(doc, tag) {
    const acid = Array.isArray(doc?.analysis?.acidResults) ? doc.analysis.acidResults : [];
    const T = String(tag || '').toUpperCase();
    return acid
        .filter((r) => r && String(r.tag || '').toUpperCase() === T && (r.title || r.evidenceText))
        .map((r) => ({
            id: r.id || `${T}-${r.blockId ?? r.title}`,
            text: r.title || r.evidenceText,
        }));
}

// ACID 4분류(A/C/I/D) 항목 총 개수 — 요약 배지용.
export function countAcid(doc) {
    const acid = Array.isArray(doc?.analysis?.acidResults) ? doc.analysis.acidResults : [];
    return acid.filter((r) => r && ['A', 'C', 'I', 'D'].includes(String(r.tag || '').toUpperCase())).length;
}

// 이해점검(퀴즈) 통과 여부. 통과 = 퀴즈가 있고, 답변했고, 정답인 경우만.
// (documentStore 스키마: analysis.quiz, review.quizAnswered/quizCorrect)
export function quizStatus(doc) {
    const hasQuiz = !!doc?.analysis?.quiz?.question;
    const answered = !!doc?.review?.quizAnswered;
    const correct = !!doc?.review?.quizCorrect;
    return { hasQuiz, answered, passed: answered && correct };
}

const STATUS_LABELS = {
    completed: '검토완료',
    reviewing: '임시저장', // 2026-10-12: 화면에는 검토중 상태가 없다
    saved: '임시저장',
};

function formatDate(ts) {
    if (!ts) return '';
    const dt = new Date(ts);
    if (isNaN(dt.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}.${p(dt.getMonth() + 1)}.${p(dt.getDate())}`;
}

// 비교 가능 여부: analysis.acidResults가 1건 이상 있어야 실비교가 성립.
export function isComparable(doc) {
    return !!doc && Array.isArray(doc?.analysis?.acidResults) && doc.analysis.acidResults.length > 0;
}

// 문서 레코드 → 비교 열(column) 뷰모델.
export function docToCompareModel(doc) {
    if (!doc || !doc.docId) return null;
    return {
        docId: doc.docId,
        fileName: doc.fileName || '분석한 공고문',
        analyzedAt: formatDate(doc.uploadedAt),
        // 마감일: 'YYYY-MM-DD' → 'YYYY.MM.DD'. source 'auto'는 "추정" 라벨 대상.
        deadline: doc.deadline ? doc.deadline.replace(/-/g, '.') : null,
        deadlineSource: doc.deadline ? (doc.deadlineSource || 'auto') : null,
        statusLabel: STATUS_LABELS[doc.status] || '임시저장',
        dItems: pickAcidItems(doc, 'D'), // 자격 논리
        iItems: pickAcidItems(doc, 'I'), // 핵심 정보
        acidCount: countAcid(doc),
        quiz: quizStatus(doc),
    };
}

export default docToCompareModel;
