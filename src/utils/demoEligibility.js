// 예시 비교(청년도약계좌 vs 청년미래적금)의 "내 조건 확인".
// 두 보도자료에 명시된 기준만 사용한다. 공고문에 없는 항목은 판정하지 않고 "명시 없음"으로 안내한다.
// 점수·순위는 만들지 않는다(근거 없는 수치 금지).

// status: 'ok'(공고문 기준 해당) | 'check'(추가 확인 필요) | 'no'(해당 안 됨)
const RANK = { ok: 0, check: 1, no: 2 };
const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);

// A — 청년도약계좌(2025년 1월 기여금 확대 기준): 총급여 구간만 명시.
function checkDoyak({ income }) {
    const lines = [];
    let status = 'ok';

    lines.push('나이 요건은 이 보도자료에 명시 없음');

    if (income <= 2400) lines.push('총급여 2,400만원 이하 구간 → 월 최대 기여금 3.3만원');
    else if (income <= 3600) lines.push('총급여 2,400만원 초과~3,600만원 이하 구간 → 월 최대 기여금 2.9만원');
    else if (income <= 4800) lines.push('총급여 3,600만원 초과~4,800만원 이하 구간 → 월 최대 기여금 2.5만원');
    else if (income <= 6000) lines.push('총급여 4,800만원 초과~6,000만원 이하 구간 → 월 최대 기여금 2.1만원');
    else if (income <= 7500) {
        lines.push('총급여 6,000만원 초과~7,500만원 이하 → 기여금 없이 비과세만 지원');
        status = worst(status, 'check');
    } else {
        lines.push('총급여 7,500만원 초과 → 공고문에 제시된 소득 구간을 넘어요');
        status = 'no';
    }

    lines.push("신규 가입은 '25.12월 종료 (청년미래적금 공고문 기준)");
    return { status, lines };
}

// B — 청년미래적금(2026.6.22 출시): 나이·소득·가구·직업 요건 명시.
function checkMirae({ age, income, job }) {
    const lines = [];
    let status = 'ok';

    if (age < 19) {
        lines.push('만 19세 미만은 가입 대상이 아니에요');
        status = 'no';
    } else if (age <= 34) {
        lines.push('나이 요건(만 19~34세) 충족');
    } else if (age === 35) {
        lines.push("만 35세는 '91.1.1~8.7생이면 최초 가입기간에 한해 예외 허용 — 생일 확인 필요");
        status = worst(status, 'check');
    } else {
        lines.push('만 35세 이상은 가입 대상이 아니에요 (병역 이행 기간은 최대 6년까지 나이에서 제외)');
        status = 'no';
    }

    if (job === 'biz') {
        lines.push('소상공인은 연매출 기준(일반형 3억원 이하 · 우대형 1억원 이하)으로 심사 — 소상공인확인서 사전 발급 필요');
        status = worst(status, 'check');
    } else if (income <= 0) {
        lines.push("직전연도('25년) 소득이 확인되지 않으면 가입할 수 없어요");
        status = 'no';
    } else if (income <= 6000) {
        const preferred = job === 'sme' && income <= 3600;
        lines.push(
            preferred
                ? '총급여 3,600만원 이하 + 중소기업 재직 → 우대형(매칭 12%) 가능성. 가구중위소득 150% 이하 확인 필요'
                : '총급여 6,000만원 이하 → 일반형(매칭 6%) 가능성. 가구중위소득 200% 이하 확인 필요'
        );
        status = worst(status, 'check');
    } else if (income <= 7500) {
        lines.push('총급여 6,000만원 초과~7,500만원 이하 → 기여금 없이 세제혜택만');
        status = worst(status, 'check');
    } else {
        lines.push('총급여 7,500만원 초과 → 공고문에 제시된 소득 구간을 넘어요');
        status = 'no';
    }

    return { status, lines };
}

/**
 * @param {{age:number, income:number, job:'sme'|'employee'|'biz'|'none'}} input  income = 직전연도 총급여(만원)
 */
export function checkEligibility(input) {
    return { a: checkDoyak(input), b: checkMirae(input) };
}

export const STATUS_LABEL = { ok: '공고문 기준 해당', check: '확인 필요', no: '해당 안 됨' };
