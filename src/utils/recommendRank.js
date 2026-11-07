// 대시보드 추천 가중치 랭킹(사용자 결정②: 가중치 랭킹).
// 지역 스코프 샘플(policies[]) → 정책별 점수화 → 정렬 → 상위 N(호출부에서 slice).
// 순수 함수(테스트 가능). verdict 계산은 verdictEngine, 분야 매칭은 profileFilters에 위임.

import { computeVerdict } from './verdictEngine';
import { policyMatchesLclsf, deriveRegions } from './profileFilters';
import { judgeRegion } from './policyRegion';
import { parsePolicyEndDate } from './policyDates';

// 접수 종료일 파싱은 policyDates로 이전(verdictEngine 집계와 공유). 공개 API 유지 위해 재노출.
export { parsePolicyEndDate };

// ── 가중치(조정 가능). 근거는 각 주석 참조. ──────────────────────────────
const W_REGION = 3;  // 내 거주 시·도의 지자체 공고: 분야 일치와 같은 비중으로 끌어올린다.
                     // 다른 시·도의 지자체 공고는 가중치를 주지 않고 랭킹에서 아예 뺀다(rankPolicies 참조).
const W_LCLSF = 3;   // 관심 분야(lclsfNm) 일치: 개인화 핵심 신호 → 가장 큰 가점.
const W_SAFE = 2;    // verdict safe(신청 가능성 높음): 실제 신청 가능 정책 우선.
const W_WARN = 0;    // verdict warn(확인 필요): 중립(가감 없음).
const W_DANGER = -2; // verdict danger(기준 미달): 강한 감점(제외까진 안 함 — 참고 노출).
const W_SOON = 1;    // 마감 14일 이내: 임박 정책을 살짝 끌어올림.
const SOON_DAYS = 14;

// 정책 1건 점수화. { verdict, score, expired, end, regionJudge } 반환.
// expired     : 접수 종료일이 파싱 가능하고 오늘보다 과거인 경우(랭킹에서 제외 대상).
// regionJudge : 'match'|'other'|'nationwide'|'unknown' — 'other'도 랭킹에서 제외 대상.
export function scorePolicy(policy, { lclsfSet, profile, now = new Date() } = {}) {
    const verdict = computeVerdict(policy, profile);
    let score = 0;

    // 거주지: 내 지역 지자체 공고는 가점(전국 공고는 중립, 다른 지역은 rankPolicies에서 제외).
    const regionJudge = judgeRegion(policy, deriveRegions(profile));
    if (regionJudge === 'match') score += W_REGION;

    if (lclsfSet && policyMatchesLclsf(policy, lclsfSet)) score += W_LCLSF;

    if (verdict.level === 'safe') score += W_SAFE;
    else if (verdict.level === 'warn') score += W_WARN;
    else if (verdict.level === 'danger') score += W_DANGER;

    const end = parsePolicyEndDate(policy?.aplyYmd);
    let expired = false;
    if (end) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffDays = Math.round((end - today) / 86400000);
        if (diffDays < 0) expired = true;               // 마감 경과 → 제외
        else if (diffDays <= SOON_DAYS) score += W_SOON; // 14일 이내 → 가점
    }

    return { verdict, score, expired, end, regionJudge };
}

// 정책 목록 → 점수 내림차순 랭킹. 동점은 최신순(plcyNo 문자열 내림차순).
// plcyNo는 앞자리에 등록 시각을 포함(예: "20260703...") → 문자열 desc가 최신순 근사.
//
// 제외 대상(가점 감점이 아니라 목록에서 아예 뺀다):
//  - 마감이 지난 공고
//  - 다른 시·도의 지자체 공고('other') — 거주지 요건에 걸려 신청할 수 없으므로
//    건수가 줄더라도 섞지 않는다. 전국 공고('nationwide')와 거주지 미입력('unknown')은 남긴다.
// 반환: [{ policy, verdict, score, expired, end, regionJudge }] (호출부에서 slice(0,N) 후 카드 매핑).
export function rankPolicies(policies, opts = {}) {
    const list = Array.isArray(policies) ? policies : [];
    return list
        .map((p) => ({ policy: p, ...scorePolicy(p, opts) }))
        .filter((x) => !x.expired && x.regionJudge !== 'other')
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const an = String(a.policy?.plcyNo || '');
            const bn = String(b.policy?.plcyNo || '');
            return bn.localeCompare(an); // 동점 → 최신순
        });
}

export default rankPolicies;