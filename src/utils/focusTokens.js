// 본문 cp-token 중 "최종 선정된 ACID 항목"에 대응하는 것만 남기고 나머지는 벗긴다.
// 서버가 이미 걸러 보낸 응답에는 무해(멱등)하고, 예전에 저장된 분석 결과에는 색칠 과다를 즉시 줄여준다.

const TAG_TO_CLASS = { A: 'success', C: 'info', I: 'warning', D: 'danger' };
const TOKEN_RE = /<span\s+class="cp-token\s+([a-z]+)"[^>]*>([\s\S]*?)<\/span>/g;

const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const norm = s => decode(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');

function bigrams(s) {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
}

// 토큰과 항목 제목이 글자쌍(bigram)을 얼마나 공유하는지 (0~1) — 같은 근거 블록 안에서 어느 토큰이 이 항목의 핵심인지 가른다
function overlap(tt, title) {
    const a = bigrams(tt);
    if (a.size === 0 || !title) return 0;
    const b = bigrams(title);
    let shared = 0;
    a.forEach(g => { if (b.has(g)) shared++; });
    return shared / a.size;
}

function scoreToken(token, item) {
    const tt = token.norm;
    if (tt.length < 2) return 0;
    const hl = norm(item.highlightText);
    const title = norm(item.title);
    const evidence = norm(item.evidenceText);
    let tier = 0;
    if (hl && (tt.includes(hl) || hl.includes(tt))) tier = 3;
    else if (title && (tt.includes(title) || title.includes(tt))) tier = 2;
    else if (evidence && evidence.includes(tt)) tier = 1;
    if (tier === 0) return 0;
    return tier + overlap(tt, title) * 0.6 + (token.cls === TAG_TO_CLASS[item.tag] ? 0.2 : 0) + Math.min(tt.length, 40) / 10000;
}

/**
 * @param {string} html        페이지 contentHtml
 * @param {Array}  acidResults 분석 결과 항목 배열 ({pageNumber, tag, title, evidenceText, highlightText?})
 * @param {number} pageNumber  이 페이지 번호
 * @returns {string} 항목당 최대 1개의 토큰만 남긴 html (토큰 색은 항목의 태그를 따른다)
 */
export function focusTokens(html, acidResults, pageNumber) {
    if (typeof html !== 'string' || !html.includes('cp-token')) return html || '';

    const tokens = [];
    for (const m of html.matchAll(TOKEN_RE)) {
        tokens.push({ start: m.index, end: m.index + m[0].length, cls: m[1], inner: m[2], norm: norm(m[2]) });
    }

    const items = (Array.isArray(acidResults) ? acidResults : []).filter(
        r => r && r.pageNumber === pageNumber && TAG_TO_CLASS[(r.tag || '').toUpperCase()]
    );

    const keep = new Map(); // token index → 적용할 클래스
    for (const raw of items) {
        const item = { ...raw, tag: raw.tag.toUpperCase() };
        let best = -1;
        let bestScore = 0;
        tokens.forEach((t, i) => {
            if (keep.has(i)) return;
            const s = scoreToken(t, item);
            if (s > bestScore) { bestScore = s; best = i; }
        });
        if (best >= 0) keep.set(best, TAG_TO_CLASS[item.tag]);
    }

    let out = '';
    let cursor = 0;
    tokens.forEach((t, i) => {
        out += html.slice(cursor, t.start);
        out += keep.has(i) ? `<span class="cp-token ${keep.get(i)}">${t.inner}</span>` : t.inner;
        cursor = t.end;
    });
    return out + html.slice(cursor);
}
