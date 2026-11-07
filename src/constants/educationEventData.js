// "교육·행사" 레이아웃용 파생 로직.
// 공고별 분석 데이터(자격 체크·혜택 내역·확인 필요·첨부 번역·여정 타임라인)는 더 이상 이 파일에 두지 않고
// src/data/demo/{공고ID}.json 의 eduData 필드에 있다(화면 컴포넌트는 JSON만 읽는다).
// 여기에는 그 JSON을 화면이 쓰는 형태로 바꾸는 순수 함수만 남긴다.
//
// ACID 탭 매핑(카드 ↔ 우측 "항목 분석" 패널): 지원가능체크=D(자격논리) · 혜택비용계산=I(핵심정보) ·
// 확인필요=C(문맥참조) · 첨부번역=A(행정용어).


// 큐레이션 데이터가 없는(education_event로 분류됐지만 처음 보는) 문서용 최소 대체 구조.
// acidResults(D=자격논리, I=핵심정보)만으로 최대한 구성한다. 자동 추출이라 진짜 "분석"은 아직 없으므로
// analysis 칸에는 그 사실을 정직하게 밝힌다(빈 칸으로 두지 않는다).
export function buildFallbackEducationEventData(analysis) {
    const results = Array.isArray(analysis?.acidResults) ? analysis.acidResults : [];
    const dItems = results.filter((r) => r.tag === 'D');
    const iItems = results.filter((r) => r.tag === 'I');
    const firstPage = analysis?.reconstructedPages?.[0]?.pageNumber || 1;
    const AUTO_NOTE = '자동 추출된 항목이라 CLUE의 교차 분석은 아직 없습니다 — 원문에서 직접 확인하세요.';

    return {
        summary: {
            target: dItems[0]?.title || '원문에서 확인 필요',
            period: iItems.find((r) => /기간|일정/.test(r.title || ''))?.title || '원문에서 확인 필요',
        },
        programPeriod: null,
        timeline: [],
        eligibility: dItems.map((r, i) => ({
            id: `elig-auto-${i}`,
            title: r.title,
            notice: r.title,
            analysis: AUTO_NOTE,
            status: 'check',
            pageNumber: r.pageNumber || firstPage,
        })),
        benefits: {
            receive: iItems.map((r, i) => ({
                id: `ben-r-auto-${i}`,
                title: r.title,
                notice: `${r.title}${r.evidenceText ? ` — ${r.evidenceText}` : ''}`,
                analysis: AUTO_NOTE,
                pageNumber: r.pageNumber || firstPage,
            })),
            pay: [],
            conditional: [],
        },
        issues: [
            {
                id: 'issue-auto-0',
                title: '큐레이션 데이터 없음',
                notice: '이 문서는 큐레이션된 상세 데이터가 없어, 자동 추출 결과로만 채워졌습니다.',
                analysis: '중요한 조건·금액·일정은 CLUE 교차 분석 없이 원문을 직접 확인해야 합니다.',
                pageNumber: firstPage,
                severity: 'warn',
            },
        ],
        attachment2: [],
        attachment3: [],
    };
}

// eduData(지원가능체크·혜택비용계산·확인필요·첨부번역)를 RightPanel의 A/C/I/D "항목 분석" 포맷으로 변환.
// 매핑: eligibility→D(자격논리) · benefits→I(핵심정보) · issues→C(문맥참조) · attachment2+3→A(행정용어).
// RightPanel 상세 카드는 왜 중요한지(why)·주의 영향(impact)·지금 확인할 것(checkQ) 순으로 읽히므로,
// 공고가 뭐라고 적었는지(notice)를 why에, 그래서 어떻게 되는지(analysis)를 impact에 넣는다.
export function buildAnalysisItemsFromEduData(eduData) {
    const toD = (items) => (items || []).map((it) => ({
        id: it.id, pageRef: `P.${it.pageNumber}`, title: it.title, sub: '자격 논리',
        riskType: '자격 논리', riskTitle: it.title, why: it.notice, impact: it.analysis, checkQ: it.checkQ || '',
    }));
    const toI = (items) => (items || []).map((it) => ({
        id: it.id, pageRef: `P.${it.pageNumber}`, title: it.title, sub: '핵심 정보',
        riskType: '핵심 정보', riskTitle: it.title, why: it.notice, impact: it.analysis, checkQ: it.checkQ || '',
    }));
    const toC = (items) => (items || []).map((it) => ({
        id: it.id, pageRef: `P.${it.pageNumber}`, title: it.title, sub: '문맥 참조',
        riskType: '문맥 참조', riskTitle: it.title, why: it.notice, impact: it.analysis, checkQ: it.checkQ || '',
    }));
    // inAcid: false인 항목(영어 용어)은 첨부 번역 탭에는 그대로 보이되 우측 A·행정 용어 목록에서는 뺀다.
    const toA = (items) => (items || [])
        .filter((it) => it.inAcid !== false)
        .map((it) => ({
            id: it.id, pageRef: `P.${it.pageNumber}`, title: it.term, sub: '행정 용어',
            riskType: '행정 용어', riskTitle: it.term, why: it.gist, impact: '', checkQ: it.checkQ || '',
        }));

    const benefits = eduData.benefits || {};
    return {
        D: toD(eduData.eligibility),
        I: toI([...(benefits.receive || []), ...(benefits.pay || []), ...(benefits.conditional || [])]),
        C: toC(eduData.issues),
        A: toA([...(eduData.attachment2 || []), ...(eduData.attachment3 || [])]),
    };
}

// 5개 타임라인 노드 중 "오늘"이 속한 구간을 대략적으로 표시한다. programPeriod가 교육연수 구간만 담고 있어
// 지원·선발단계/수료성과 노드까지 정확히 구분할 수는 없으므로, 시작 전=지원(0)·기간 중=교육연수(2)·종료 후=사후(4)로만 근사한다.
export function computeCurrentStageIndex(programPeriod, today = new Date()) {
    if (!programPeriod?.start || !programPeriod?.end) return null;
    const start = new Date(programPeriod.start);
    const end = new Date(programPeriod.end);
    if (today < start) return 0;
    if (today > end) return 4;
    return 2;
}
