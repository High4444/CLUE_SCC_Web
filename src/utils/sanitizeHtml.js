import DOMPurify from 'dompurify';

// 백엔드(server/services/acidAnalyzer.js 프롬프트)가 contentHtml에 실제로 지시·출력하는 태그만 허용한다.
// 핵심은 cp-token span + class (정본 매핑: docs/DESIGN.md §5). 나머지는 프롬프트가 지시하는 구조 태그로 한정.
//   프롬프트 지시: span.cp-token, h2/h3, p, ul/li, table/tr/td.
//   방어적으로 br/strong/em, ol, thead/tbody/th, h1/h4 까지만 확장(실제 등장 가능 범위).
const ALLOWED_TAGS = [
    'span', 'p', 'br', 'strong', 'em',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'h1', 'h2', 'h3', 'h4',
];

// class + data-acid-id 만 허용.
//   class        → cp-token 매핑 문자열 보존(정본: docs/DESIGN.md §5)
//   data-acid-id → 토큰이 가리키는 ACID 항목 id(우측 패널 연동용). 값은 렌더링되지 않고
//                  항목 id 조회에만 쓰이며, 못 찾으면 무시되므로 주입 위험이 없다.
// script/style/iframe/object/embed, on* 이벤트 핸들러, javascript: URL 등은
// DOMPurify 기본 방어 + 아래 allow-list 로 차단된다.
const ALLOWED_ATTR = ['class', 'data-acid-id'];

/**
 * 백엔드가 내려준 contentHtml 을 dangerouslySetInnerHTML 주입 직전에 소독한다.
 * cp-token span 은 보존하고, 악성 태그·이벤트 핸들러·스크립트는 제거한다.
 * @param {string} dirty 원본 HTML 문자열
 * @returns {string} 소독된 HTML
 */
export function sanitizeContentHtml(dirty) {
    if (typeof dirty !== 'string' || dirty.length === 0) return '';
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false, // data-* 불필요(실데이터 미사용) — 표면적 최소화
    });
}

export default sanitizeContentHtml;
