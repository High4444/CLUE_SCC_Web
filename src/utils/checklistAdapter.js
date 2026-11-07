// 검토완료(completed) 문서·체크리스트에 담은 문서 → 신청 체크리스트 항목 변환기(순수).
//
// 근거(REAL_PRODUCT_PLAN 흐름3-c): 검토완료된 문서를 "신청 진행" 항목으로 노출하고,
// 그 문서의 제출 서류·신청 절차를 체크리스트로 변환한다(아래 docToEntry 참조).
// 체크 여부·신청 완료 여부는 checklistStore(localStorage)가 보존.
//
// 각 체크 항목 id는 ACID 항목 id(예: "acid-gemini-3")를 재사용 → 리로드/재분석 후에도
// 진행 상태(clue_checklist)가 안정적으로 매핑된다.

// 실분석 문서(체크리스트 데이터가 없는 문서)에서 I(핵심 정보) 중 서류·신청 절차로 보이는 항목을 고를 때 쓰는 단어.
const SUBMISSION_HINT = /서류|제출|증명|등본|초본|신청서|발급|확인서|서약|사본|접수|신청|구비|양식|원서/;

// 문서 하나 → AppliedPoliciesPage 엔트리.
// 2026-10-12: 체크 항목은 "제출 서류·신청 절차"만 남긴다(자격 확인 D 항목은 제외).
//   ① 분석에 checklist가 있으면(전시용 공고 12건 — 공고 원문의 제출 서류·절차) 그대로 쓴다.
//   ② 없으면(실분석 문서) I 항목 중 서류·신청 관련 단어가 있는 것만, 하나도 없으면 I 전체.
export function docToEntry(doc, state = {}) {
    if (!doc || !doc.docId) return null;
    const analysis = doc.analysis || {};
    const savedItems = state.items || {};
    // 데모 항목 제목의 "P.3 " 같은 쪽 표시는 체크 문장에선 군더더기라 뗀다.
    const clean = (t) => String(t || '').replace(/^P\.\d+\s*/, '').trim();

    let checklistItems;
    if (Array.isArray(analysis.checklist) && analysis.checklist.length > 0) {
        checklistItems = analysis.checklist.map((c) => ({
            id: c.id,
            label: c.label,
            done: !!savedItems[c.id],
        }));
    } else {
        const acid = Array.isArray(analysis.acidResults) ? analysis.acidResults : [];
        const iItems = acid.filter(r => r && String(r.tag || '').toUpperCase() === 'I' && (r.title || r.evidenceText));
        const hinted = iItems.filter(r => SUBMISSION_HINT.test(`${r.title || ''} ${r.evidenceText || ''}`));
        checklistItems = (hinted.length ? hinted : iItems).map(r => {
            const id = r.id || `I-${r.blockId ?? r.title}`;
            return { id, label: clean(r.title || r.evidenceText), done: !!savedItems[id] };
        });
    }

    return {
        id: doc.docId,
        docId: doc.docId,
        title: doc.fileName || '분석한 공고문',
        agency: '',
        appliedAt: state.appliedAt || '',
        deadline: doc.deadline || '',
        amount: '',
        memo: '',
        isApplied: !!state.applied,
        applyUrl: '',
        fromDocument: true, // 문서 파생 엔트리 표식(수동 추가와 구분)
        checklistItems,
    };
}

// 문서 목록 → 엔트리 목록. 검토완료 문서 + 업로드 내역에서 체크리스트에 담은(added) 문서.
// getState(docId)로 진행 상태 주입. 데모 문서는 호출측이 withDemoAnalysis로 분석 본문을 채워 넘긴다.
export function buildEntriesFromDocs(docs, getState) {
    if (!Array.isArray(docs)) return [];
    return docs
        .map(d => ({ d, state: d && getState ? getState(d.docId) : {} }))
        .filter(({ d, state }) => d && (d.status === 'completed' || state.added))
        .map(({ d, state }) => docToEntry(d, state))
        .filter(Boolean);
}

export default buildEntriesFromDocs;
