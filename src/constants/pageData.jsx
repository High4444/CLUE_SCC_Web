import React from 'react';

// 색상 체계 (정본 — 논문 정의 기준, docs/DESIGN.md §5 / docs/PRODUCT.md §4):
//   success (초록) → A 행정 용어 (Administrative Terms)
//   info    (파랑) → C 문맥 참조 (Contextual Reference)
//   warning (앰버) → I 핵심 정보 (Information Structuring — 일정·서류·금액·연락처)
//   danger  (빨강) → D 자격 논리 (Decision Logic — 제한·예외·제외, 우선순위 최상위)

export const PAGE_DATA = [
    {
        page: 1,
        title: '신청자격',
        sub: '거주기준 · 혼인기준 · 연령기준',
        icon: '📋',
        color: '#3b82f6',
        content: (
            <>
                신혼부부가 모두{' '}
                <span className="cp-token info">지원공고일 이전부터</span>{' '}
                충주시에 주소를 두고 있어야 하며,{' '}
                <span className="cp-token danger">혼인 7년 이내</span>{' '}
                조건을 충족해야 합니다. 부부 중 1명 이상은{' '}
                <span className="cp-token success">청년(19~39세)</span>
                이어야 합니다.
            </>
        )
    },
    {
        page: 2,
        title: '소득·주택기준',
        sub: '소득기준 · 주택기준 · 면적기준',
        icon: '💰',
        color: '#8b5cf6',
        content: (
            <>
                부부합산 연소득은{' '}
                <span className="cp-token danger">무자녀 8,000만원 이하</span>,{' '}
                1자녀 8,800만원 이하, 2자녀 이상 9,800만원 이하입니다.
                주택은 충주시 소재{' '}
                <span className="cp-token danger">주거전용면적 85㎡ 이하</span>
                이어야 하며, 전세자금은 보증금 2억원 미만,{' '}
                매입자금은{' '}
                <span className="cp-token danger">공시가격 3억원 미만</span>
                인 주택에 한합니다.
            </>
        )
    },
    {
        page: 3,
        title: '대출기준',
        sub: '대출종류 · 지원제외대상',
        icon: '🏦',
        color: '#10b981',
        content: (
            <>
                제1·2금융권에서 신혼부부 명의의 주거자금 대출을 받은 자로
                대출용도에{' '}
                <span className="cp-token success">【주택】, 【전세】, 【임차】</span>
                {' '}등으로 명기된 경우에 한합니다.{' '}
                <span className="cp-token danger">신용 및 일반대출은 주택자금 용도로 사용하더라도 지원이 불가</span>
                합니다. 기초생계·의료·주거급여 수급자 및 공공임대 입주자는
                지원 제외 대상입니다.
            </>
        )
    },
    {
        page: 4,
        title: '지원내용',
        sub: '이자지원 방식 · 지원금액 · 지원기간',
        icon: '🏠',
        color: '#f59e0b',
        content: (
            <>
                공고일 전월 대출잔액의{' '}
                <span className="cp-token warning">1.5%</span>에 해당하는 금액을
                2025년도 이자 납부(예정)개월 수에 따라 월별 계산하여 일시 지급합니다.
                연 1회, 최대{' '}
                <span className="cp-token warning">3년(3회)</span>
                {' '}지원하며, 가구당{' '}
                <span className="cp-token danger">연 100만원 이내</span>
                (만원 미만 절사)입니다.
                이자율이 1.5% 미만인 경우, 실제 이자율로 계산한 금액을 지원합니다.
            </>
        )
    },
    {
        page: 5,
        title: '신청 방법',
        sub: '신청기간 · 신청방법 · 지원절차',
        icon: '📮',
        color: '#6366f1',
        content: (
            <>
                신청인은 신혼부부 중 대표 1인이며{' '}
                <span className="cp-token danger">대리신청은 불가</span>
                합니다. 신청기간은{' '}
                <span className="cp-token warning">2025. 7. 1.(화) ~ 7. 31.(목)</span>
                {' '}[토·일·공휴일 제외]이며, 거주지{' '}
                <span className="cp-token warning">읍면동 행정복지센터 방문</span>
                으로만 접수합니다. 지원절차는 신청·접수(읍면동) → 대상자 결정(시) → 지급 순입니다.
            </>
        )
    },
    {
        page: 6,
        title: '신청서류',
        sub: '전체 필수 제출 서류 목록',
        icon: '📄',
        color: '#0ea5e9',
        content: (
            <>
                신청서, 서약서 및 동의서, 주민등록 등·초본, 혼인관계증명서(상세),
                임대차계약서 또는 등기부등본, 금융기관 발행 주택자금대출 확인서,
                재산세 과세·미과세증명서, 소득확인서류, 통장사본을 제출해야 합니다.
                {' '}
                <span className="cp-token danger">모든 서류는 공고일 이후 발급분(직인날인)으로 제출</span>
                해야 하며,{' '}
                <span className="cp-token success">전국기준 미과세증명서는 반드시 전국 기준으로 발급</span>
                받아야 합니다.
            </>
        )
    },
    {
        page: 7,
        title: '유의사항',
        sub: '서류 제출 · 확인 사항',
        icon: '⚠️',
        color: '#ef4444',
        content: (
            <>
                신청서 서명란에{' '}
                <span className="cp-token warning">반드시 자필서명 또는 도장</span>
                을 날인해야 합니다. 서약서 및 동의서는 동본상 세대원 모두 자필 서명
                또는 도장 날인이 필요합니다(미성년자 제외). 전세계약서 제출 시
                확정일자 발급시인이 필요하며,{' '}
                <span className="cp-token warning">인터넷 등기소의 '확정일자 계약증서' 첨부</span>
                가 필요합니다.
            </>
        )
    },
    {
        page: 8,
        title: '기타사항',
        sub: '중복지원 · 환수조치 · 문의',
        icon: '📌',
        color: '#ec4899',
        content: (
            <>
                <span className="cp-token info">동일 대출건으로</span>
                {' '}2개 이상 사업 중복 신청이 가능하나,
                신청자가 납부한 총 이자액을{' '}
                <span className="cp-token danger">초과할 수 없으며</span>
                , 초과분은 환수됩니다. 허위·부정한 방법으로 지원금을 받거나
                이혼, 타지역 이전 등의 경우{' '}
                <span className="cp-token danger">지원금이 환수</span>
                됩니다. 문의:{' '}
                <span className="cp-token warning">충주시 기획예산과 ☎ 043-850-5266</span>
            </>
        )
    },
    {
        page: 9,
        title: '우선순위 배점표',
        sub: '자녀 수 · 소득 · 거주기간 · 면적 · 혼인기간',
        icon: '📊',
        color: '#14b8a6',
        content: (
            <>
                예산 소진이 예상되는 경우 배점표를 적용합니다. 자녀 수(최대 5점),
                부부합산 소득(최대 5점), 충주시 연속 거주기간(최대 3점),
                전용면적(최대 4점), 혼인기간(최대 4점)으로 평가합니다.
                {' '}
                <span className="cp-token danger">3인 이상 자녀 5점, 3천만원 미만 소득 5점</span>
                이 최고점입니다. 합산 점수가 동일할 경우{' '}
                <span className="cp-token danger">자녀 수가 많고 부부합산 소득이 적은 순</span>
                으로 선정합니다.
            </>
        )
    },
    {
        page: 10,
        title: '지원금 계산사례',
        sub: '전세자금 · 매입자금 계산 예시',
        icon: '🔢',
        color: '#f97316',
        content: (
            <>
                대출잔액 1억원, 이자율 1.5%,{' '}
                <span className="cp-token warning">12개월 전체 이자납부</span>
                시: 1억 × 1.5% × 12/12 = 150만원 →{' '}
                <span className="cp-token danger">지원금 100만원(한도 초과)</span>.
                대출잔액 5천만원, 이자율 1.5%,{' '}
                <span className="cp-token warning">9개월 납부</span>
                시: 5천만 × 1.5% × 9/12 = 56.25만원 →{' '}
                <span className="cp-token warning">지원금 56만원(만원 미만 절사)</span>.
                이자율이 1.5% 미만인 경우 실제 이자율로 계산합니다.
            </>
        )
    }
];
