// 온통청년(:3002 프록시) getPolicies 응답의 policy 항목을
// 대시보드 추천 카드가 쓰는 형태로 변환하는 순수 어댑터.
// 실제 필드 확인: api/server.js → youthcenter getPlcy 응답(plcyNo/plcyNm/aplyYmd 등).

// 신청기간 문자열("YYYYMMDD ~ YYYYMMDD" / "" ) → 카드 마감 라벨.
// aplyPrdSeCd: 0057001=특정기간, 0057002=상시, 0057003=마감.
export function formatDeadline(aplyYmd, aplyPrdSeCd) {
    const raw = typeof aplyYmd === 'string' ? aplyYmd.trim() : '';
    if (raw.includes('~')) {
        const end = raw.split('~').pop().trim(); // "20260715"
        const m = end.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (m) return `${m[2]}/${m[3]} 마감`;
    }
    if (aplyPrdSeCd === '0057002') return '상시 신청';
    return ''; // 기간 불명 — 배지를 띄우지 않는다(2026-10-12, 구 라벨 '공고문 확인' 폐기)
}

// 카드 마감 배지 라벨. 예전에 저장된 찜·최근 본 기록에 남은 '공고문 확인'도 빈 값으로 취급.
export function deadlineBadgeLabel(label) {
    return label && label !== '공고문 확인' ? label : '';
}

// 정책 키워드 문자열 → 태그 배열 (구분자: 콤마/가운뎃점/슬래시).
function parseTags(plcyKywdNm, fallback) {
    if (typeof plcyKywdNm === 'string' && plcyKywdNm.trim()) {
        const tags = plcyKywdNm
            .split(/[,·/]/)
            .map(s => s.trim())
            .filter(Boolean);
        if (tags.length > 0) return tags;
    }
    return fallback ? [fallback] : [];
}

/**
 * 단일 policy → 카드 뷰모델.
 * @returns {{id,title,agency,category,tags,deadline,link}}
 */
export function mapPolicyToCard(p) {
    const category = p?.mclsfNm || p?.lclsfNm || '';
    const agency = p?.sprvsnInstCdNm || p?.operInstCdNm || '';
    return {
        id: p?.plcyNo || '',
        title: p?.plcyNm || '',
        agency,
        category,
        tags: parseTags(p?.plcyKywdNm, category),
        deadline: formatDeadline(p?.aplyYmd, p?.aplyPrdSeCd),
        // 신청 URL 우선, 없으면 참고 URL. 셋 다 없으면 '' → 클릭 시 이동 없음(기존 UX 유지).
        link: p?.aplyUrlAddr || p?.refUrlAddr1 || p?.refUrlAddr2 || '',
    };
}

/**
 * 정책 목록 → 카드 목록(제목 있는 것만). count 만큼 자름.
 */
export function mapPoliciesToCards(policies, count) {
    if (!Array.isArray(policies)) return [];
    const cards = policies.map(mapPolicyToCard).filter(c => c.title);
    return typeof count === 'number' ? cards.slice(0, count) : cards;
}

export default mapPoliciesToCards;
