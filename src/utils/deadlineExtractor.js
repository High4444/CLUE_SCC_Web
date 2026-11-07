// 분석 결과(acidResults)에서 "신청 마감일"을 추정하는 순수 휴리스틱 유틸.
//
// ⚠️ 휴리스틱 주의: 이 모듈은 자연어 공고문에서 규칙 기반으로 날짜를 추출한다.
// 100% 정확하지 않으며, 확신이 없으면 null을 반환한다(오탐 이벤트 생성 금지 방침).
// 캘린더 자동 이벤트는 이 함수가 날짜를 돌려줄 때만 생성된다.
//
// 규칙 요약:
//  1) I(핵심 정보)태그 항목의 title+evidenceText만 본다. (신청기간·마감·제출기한이 I에 분류됨)
//  2) "마감/접수/신청기간/신청기한/까지" 문맥을 가진 항목을 우선한다.
//  3) 기간형("A ~ B")은 종료일(B)을 마감일로 본다. 종료일에 연도가 없으면 시작일 연도를 승계.
//  4) 연도가 전혀 없으면 기준연도(now의 연도, 기본 현재)를 사용한다.
//  5) 숫자 날짜가 없으면("예산 소진 시까지", "상시" 등) 추출하지 않는다(null).
//
// 반환: 'YYYY-MM-DD' | null

// 마감/접수 문맥 우선순위 키워드(높을수록 우선).
const CONTEXT_KEYWORDS = [
    { re: /신청\s*기간|접수\s*기간|모집\s*기간|신청\s*기한|접수\s*기한|제출\s*기한/, score: 3 },
    { re: /마감|까지/, score: 2 },
    { re: /신청|접수|제출|기간|기한/, score: 1 },
];

function contextScore(text) {
    let s = 0;
    for (const k of CONTEXT_KEYWORDS) if (k.re.test(text)) s = Math.max(s, k.score);
    return s;
}

const pad2 = (n) => String(n).padStart(2, '0');

function isValidMD(m, d) {
    return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

function toIso(y, m, d) {
    if (!isValidMD(m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
}

// 단일 날짜 토큰 파싱기들. 각각 {year|null, month, day, index} 또는 null.
// index는 원문 내 위치(기간형에서 종료일 선택에 사용).

// 연도 포함: "2026. 3. 2." / "2026-03-02" / "2026년 3월 2일" / "2026/3/2"
const RE_YMD = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*[.일]?/g;
// 연도 없음(월/일 표기): "3월 13일" / "3. 13." / "3-13" / "3/13"
const RE_MD = /(?<!\d)(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*[.일]?(?!\s*\d)/g;

function findYmd(text) {
    const out = [];
    RE_YMD.lastIndex = 0;
    let m;
    while ((m = RE_YMD.exec(text)) !== null) {
        out.push({ year: +m[1], month: +m[2], day: +m[3], index: m.index });
    }
    return out;
}

function findMd(text) {
    const out = [];
    RE_MD.lastIndex = 0;
    let m;
    while ((m = RE_MD.exec(text)) !== null) {
        out.push({ year: null, month: +m[1], day: +m[2], index: m.index });
    }
    return out;
}

// 텍스트 하나에서 마감일 후보(단일 ISO)를 추출. 실패 시 null.
export function extractDeadlineFromText(text, opts = {}) {
    if (!text || typeof text !== 'string') return null;
    const baseYear = (opts.now instanceof Date ? opts.now : new Date()).getFullYear();

    // 연도 포함 날짜를 먼저 모으고, 그 위치를 제외한 구간에서 월/일 날짜를 모은다
    // (연도 날짜의 "월/일" 부분이 MD로 중복 매칭되는 것 방지).
    const ymds = findYmd(text);
    let masked = text;
    for (const y of ymds) {
        // 매칭 대략 길이만큼 공백 마스킹(자릿수 가변이라 넉넉히 감산 대신 재구성).
        // 간단히: 원문에서 해당 연도 4자리 위치부터 일부를 공백 처리.
    }
    // 마스킹은 정밀도보다 안전성 우선 — 연도 4자리로 시작하는 토큰을 통째로 지운다.
    masked = text.replace(RE_YMD, (s) => ' '.repeat(s.length));
    const mds = findMd(masked);

    // 기간형 판정: 물결(~,∼,～) 또는 '부터~까지' 형태.
    const hasRange = /[~∼～]/.test(text) || /부터/.test(text);

    const all = [...ymds, ...mds].sort((a, b) => a.index - b.index);
    if (all.length === 0) return null;

    // 기간형이면 마지막(종료) 날짜, 아니면 마지막 날짜(마감은 대개 뒤에 옴)를 채택.
    // 종료일에 연도가 없으면 앞선 연도 토큰의 연도를 승계.
    const chosen = all[all.length - 1];
    let year = chosen.year;
    if (year == null) {
        const priorYear = [...ymds].reverse().find(y => y.index <= chosen.index);
        year = priorYear ? priorYear.year : (ymds[0] ? ymds[0].year : baseYear);
    }
    void hasRange; // 종료일 선택은 위 "마지막 토큰" 규칙으로 충족(기간형/단일형 공통).
    return toIso(year, chosen.month, chosen.day);
}

// acidResults 전체에서 마감일 1건을 추정. 실패 시 null.
export function extractDeadline(acidResults, opts = {}) {
    if (!Array.isArray(acidResults)) return null;

    // I태그 항목만, 마감 문맥 점수 높은 순으로 정렬해 순회.
    const candidates = acidResults
        .filter(r => r && String(r.tag || '').toUpperCase() === 'I')
        .map(r => {
            const text = `${r.title || ''} ${r.evidenceText || ''}`.trim();
            return { text, score: contextScore(text) };
        })
        .filter(c => c.text && c.score > 0)
        .sort((a, b) => b.score - a.score);

    for (const c of candidates) {
        const iso = extractDeadlineFromText(c.text, opts);
        if (iso) return iso;
    }
    return null;
}

export default extractDeadline;
