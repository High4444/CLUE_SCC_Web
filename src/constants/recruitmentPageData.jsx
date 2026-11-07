import React from 'react';

export const RECRUITMENT_PAGE_DATA = [
    {
        page: 1,
        icon: '📋',
        title: '채용 개요',
        sub: '직무 · 채용 인원 · 고용 형태',
        bullets: [
            '총 5명 채용 (행정 3 · IT 2)',
            '정규직 / 수습 3개월 급여 80%',
            '공고일 기준 2026. 7. 1.',
        ],
        content: (
            <>
                2026년 하반기 공개채용으로 총 5명을 선발합니다. 직무는{' '}
                <span className="cp-token info">일반 행정 3명</span>,{' '}
                <span className="cp-token success">IT 개발 2명</span>으로 구분됩니다. 고용 형태는{' '}
                <span className="cp-token warning">정규직 (수습 3개월)</span>이며, 수습 기간 중 급여는 정규 급여의 80%가 지급됩니다. 채용 공고일은 2026. 7. 1. 기준입니다.
            </>
        ),
    },
    {
        page: 2,
        icon: '📝',
        title: '지원 자격',
        sub: '학력 · 경력 · 연령 기준',
        bullets: [
            '학력 무관 (전 직무 공통)',
            'IT 직무 경력 2년 이상 필수',
            '연령 제한 없음',
        ],
        content: (
            <>
                일반행정 직무는 학력·연령 제한 없이{' '}
                <span className="cp-token info">신입 지원 가능</span>합니다.
                IT개발 직무는{' '}
                <span className="cp-token danger">경력 2년 이상</span>이 필수 요건이며,
                4대보험 가입 이력을 기준으로 산정합니다. 외국인의 경우{' '}
                <span className="cp-token warning">취업 비자 보유자</span>에 한해 지원이 가능합니다.
            </>
        ),
    },
    {
        page: 3,
        icon: '⭐',
        title: '우대 사항',
        sub: '가산점 · 우대 자격증',
        bullets: [
            '자격증 보유자 서류 가산점 부여',
            '직무 관련 경력자 우대',
            '국가유공자 예우법 적용',
        ],
        content: (
            <>
                일반행정 직무는{' '}
                <span className="cp-token success">컴퓨터활용능력 1급</span>,
                사회복지사, MOS 자격증 보유자를 우대합니다.
                IT개발 직무는{' '}
                <span className="cp-token success">정보처리기사</span>, AWS 자격증,{' '}
                <span className="cp-token info">GitHub 활동 이력</span>을 우대 요소로 반영합니다.{' '}
                <span className="cp-token warning">국가유공자 및 취업지원대상자</span>는
                관계 법령에 따라 우선 선발됩니다.
            </>
        ),
    },
    {
        page: 4,
        icon: '🔄',
        title: '전형 절차',
        sub: '서류 → 필기 → 면접 → 최종',
        bullets: [
            '블라인드 채용 원칙 적용',
            '각 전형 합격자 개별 통보',
            '전형 일정은 추후 홈페이지 공지',
        ],
        content: (
            <>
                채용 전형은{' '}
                <span className="cp-token info">서류 심사 → 필기 시험 → 면접 → 최종 합격</span>{' '}
                순으로 진행됩니다. 모든 전형은{' '}
                <span className="cp-token success">블라인드 방식</span>으로 운영되며,
                학교명·출신지·가족관계 기재를 금지합니다. 각 전형 합격자는{' '}
                <span className="cp-token warning">개별 연락</span>을 통해 통보되며,
                일정 변경 시 공식 홈페이지를 통해 안내합니다.
            </>
        ),
    },
    {
        page: 5,
        icon: '📄',
        title: '제출 서류',
        sub: '공통 서류 · 직무별 추가 서류',
        bullets: [
            '공고일 이후 발급 서류만 인정',
            'IT 직무: 포트폴리오 필수 제출',
            '허위 서류 제출 시 합격 취소',
        ],
        content: (
            <>
                공통 서류는 입사지원서, 자기소개서, 졸업증명서이며,{' '}
                <span className="cp-token danger">공고일 이후 발급분만 유효</span>합니다.
                IT개발 직무 지원자는{' '}
                <span className="cp-token danger">포트폴리오를 반드시 제출</span>해야 하며,
                경력자는 4대보험 이력이 확인되는{' '}
                <span className="cp-token info">경력증명서</span>를 함께 제출해야 합니다.
            </>
        ),
    },
    {
        page: 6,
        icon: '💻',
        title: '접수 방법',
        sub: '온라인 접수 · 마감 일정',
        bullets: [
            '온라인 채용 시스템으로만 접수 가능',
            '마감: 2026. 7. 31. 23:59 서버 기준',
            '방문·우편·이메일 접수 불가',
        ],
        content: (
            <>
                접수는{' '}
                <span className="cp-token info">온라인 채용 시스템</span>을 통해서만 가능하며,
                방문·우편·이메일 접수는 일절 허용되지 않습니다.
                접수 마감은{' '}
                <span className="cp-token danger">2026년 7월 31일 23:59</span> 서버 기준이며,
                마감 직전 접속 폭주에 대비해{' '}
                <span className="cp-token warning">여유 있게 제출</span>할 것을 권장합니다.
            </>
        ),
    },
    {
        page: 7,
        icon: '⚠️',
        title: '주의 사항',
        sub: '블라인드 채용 · 중복 지원 제한',
        bullets: [
            '학교명·출신지·가족관계 기재 금지',
            '동일 공고 중복 직무 지원 불가',
            '허위 기재 시 합격 취소 및 불이익',
        ],
        content: (
            <>
                블라인드 채용 원칙에 따라{' '}
                <span className="cp-token danger">학교명, 출신 지역, 가족관계</span> 등
                편견 유발 요소를 기재하면 서류 심사에서 불이익을 받을 수 있습니다.
                동일 공고 내{' '}
                <span className="cp-token danger">중복 직무 지원은 불가</span>하며,
                허위 사실 기재 또는 서류 위변조 사실이 확인될 경우{' '}
                <span className="cp-token warning">합격이 즉시 취소</span>됩니다.
            </>
        ),
    },
];
