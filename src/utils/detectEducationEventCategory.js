// "교육·행사" 카테고리(연수생/참여기업 모집 공고류) 판별 — 규칙 기반, AI 호출 없음.
// 분석 파이프라인(server/)은 건드리지 않고, 클라이언트에서 받은 결과 위에 얹는 얕은 분류기.
// 오탐 방지를 위해 "모집(공고)" + 연수·전형 계열 신호어가 함께 있을 때만 education_event로 판정한다.
// 다른 카테고리(정책 지원사업 등)는 영향 없음 — 신호가 없으면 기존 레이아웃 그대로 쓰인다.

const SIGNAL_PATTERNS = [
    /연수생/,
    /교육생/,
    /참여\s*기업/,
    /선발\s*일정/,
    /코딩\s*테스트/,
    /전형/,
    /연수\s*기간/,
    /교육\s*과정/,
];

function stripHtml(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ');
}

/**
 * @param {string} fileName
 * @param {Array<{title?:string, contentHtml?:string}>} reconstructedPages
 * @returns {'education_event'|null}
 */
export function detectEducationEventCategory(fileName, reconstructedPages) {
    const firstPage = Array.isArray(reconstructedPages) ? reconstructedPages[0] : null;
    const text = [
        fileName || '',
        firstPage?.title || '',
        stripHtml(firstPage?.contentHtml),
    ].join(' ');

    const hasRecruitNotice = /모집\s*공고|모집공고/.test(text);
    if (!hasRecruitNotice) return null;

    const signalCount = SIGNAL_PATTERNS.filter((re) => re.test(text)).length;
    return signalCount >= 1 ? 'education_event' : null;
}
