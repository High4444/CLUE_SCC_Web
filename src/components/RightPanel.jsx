import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RightPanel.css';

// 카테고리 = ACID 4분류 (논문 정본, docs/PRODUCT.md §4)
//   A 행정 용어 (success) · C 문맥 참조 (info) · I 핵심 정보 (warning) · D 자격 논리 (danger)
const CATEGORY_TABS = [
    { id: 'A', label: 'A · 행정 용어' },
    { id: 'C', label: 'C · 문맥 참조' },
    { id: 'I', label: 'I · 핵심 정보' },
    { id: 'D', label: 'D · 자격 논리' },
];

const ANALYSIS_ITEMS = {
    // 🟢 A — 행정 용어: 이해가 필요한 제도·행정 용어/서류 (success 토큰)
    A: [
        {
            id: 'a1', pageRef: 'P.2', title: 'P.2 가구 유형별 소득 기준', sub: '행정 용어',
            riskType: '행정 용어', riskTitle: '무자녀·1자녀·2자녀 이상 구분',
            why: '무자녀 8,000만원 / 1자녀 8,800만원 / 2자녀 이상 9,800만원으로 가구 유형에 따라 다릅니다.',
            impact: '가구 유형을 잘못 파악하면 신청 가능 여부 판단이 달라집니다.',
            checkQ: '우리 가구는 어느 유형에 해당하나요?',
        },
        {
            id: 'a3', pageRef: 'P.6', title: 'P.6 전국기준 미과세증명서', sub: '행정 용어',
            riskType: '행정 용어', riskTitle: '전국 기준 발급 필수',
            why: '재산세 미과세증명서는 반드시 전국 기준으로 발급받아야 서류가 유효합니다.',
            impact: '지역 기준으로 발급하면 서류 미비로 접수가 거부될 수 있습니다.',
            checkQ: '미과세증명서를 전국 기준으로 발급했나요?',
        },
    ],
    // 🔵 C — 문맥 참조: 앞뒤 문맥(공고일·상기 조건 등)을 참조해야 이해되는 표현 (info 토큰)
    C: [
        {
            id: 'c1', pageRef: 'P.1', title: 'P.1 혼인 7년 이내 기준', sub: '문맥 참조',
            riskType: '기간 해석', riskTitle: '공고일 기준으로 혼인 기간 계산',
            why: '공고일 전일까지 혼인신고를 마친 날짜 기준으로 7년을 계산합니다.',
            impact: '혼인 기간 계산을 잘못하면 자격이 없는데 신청할 수 있습니다.',
            checkQ: '우리 혼인신고일이 2018. 6. 24. 이후인가요?',
        },
        {
            id: 'ac3', pageRef: 'P.6', title: 'P.6 공고일 이후 발급 서류 제출', sub: '문맥 참조',
            riskType: '기준 해석', riskTitle: '모든 서류 공고일 이후 발급분·직인 필수',
            why: '모든 제출 서류는 공고일 이후 발급분이어야 하며 직인이 날인되어야 합니다.',
            impact: '공고일 이전 발급 서류는 효력이 없어 재발급이 필요합니다.',
            checkQ: '준비한 서류의 발급일이 공고일 이후인지 확인했나요?',
        },
    ],
    // 🟡 I — 핵심 정보: 신청 일정·제출서류·지원 금액·연락처 (warning 토큰)
    I: [
        {
            id: 'co4', pageRef: 'P.4', title: 'P.4 지원 비율·기간·한도', sub: '핵심 정보',
            riskType: '지원 내용', riskTitle: '대출잔액 1.5%, 최대 3년(3회), 연 100만원 이내',
            why: '대출잔액의 1.5%를 연 1회 최대 3년간 지원하되, 가구당 연 100만원을 초과할 수 없습니다.',
            impact: '지원 횟수가 3회를 초과하거나 한도를 잘못 계산하면 신청·정산에 오류가 생깁니다.',
            checkQ: '이전 지원 횟수와 예상 지원금을 계산해 봤나요?',
        },
        {
            id: 'ac1', pageRef: 'P.5', title: 'P.5 읍면동 행정복지센터 방문 접수', sub: '핵심 정보',
            riskType: '접수 방법', riskTitle: '거주지 읍면동 행정복지센터 직접 방문',
            why: '온라인·이메일·우편·대리 접수가 모두 불가하며 거주지 읍면동 행정복지센터를 직접 방문해야 합니다.',
            impact: '방문 접수 외 다른 방법으로 신청하면 접수가 처리되지 않습니다.',
            checkQ: '거주지 관할 읍면동 행정복지센터 위치와 운영시간을 확인했나요?',
        },
        {
            id: 'ac4', pageRef: 'P.7', title: 'P.7 자필서명·도장 날인', sub: '핵심 정보',
            riskType: '제출 방법', riskTitle: '신청서·서약서 자필서명 또는 도장 필수',
            why: '신청서 서명란과 서약서·동의서의 세대원 전원에게 자필서명 또는 도장 날인이 필요합니다.',
            impact: '서명·날인 누락 시 서류 불완전으로 접수가 거부됩니다.',
            checkQ: '모든 서류에 자필서명 또는 도장 날인을 완료했나요?',
        },
        {
            id: 'ac5', pageRef: 'P.7', title: 'P.7 확정일자 계약증서 첨부', sub: '핵심 정보',
            riskType: '제출 서류', riskTitle: '인터넷 등기소 확정일자 계약증서',
            why: '전세계약서 제출 시 인터넷 등기소의 확정일자 계약증서를 별도 첨부해야 합니다.',
            impact: '확정일자 증서 미첨부 시 서류 불완전으로 접수가 지연될 수 있습니다.',
            checkQ: '인터넷 등기소에서 확정일자 계약증서를 발급받았나요?',
        },
        {
            id: 'a4', pageRef: 'P.8', title: 'P.8 충주시 기획예산과 문의', sub: '핵심 정보',
            riskType: '연락처', riskTitle: '충주시 기획예산과 ☎ 043-850-5266',
            why: '지원 내용·서류·절차에 대한 공식 문의 창구입니다.',
            impact: '잘못된 정보로 신청하면 추후 불이익이 발생할 수 있습니다.',
            checkQ: '궁금한 사항을 공식 창구에서 확인했나요?',
        },
    ],
    // 🔴 D — 자격 논리: 자격 제한·예외·제외 (danger 토큰) · 우선순위 최상위
    D: [
        {
            id: 'co1', pageRef: 'P.1', title: 'P.1 충주시 거주 + 청년 연령 조건', sub: '자격 논리',
            riskType: '자격 조건', riskTitle: '공고일 이전 거주 + 만 19~39세',
            why: '신혼부부 모두 공고일 이전부터 충주시에 거주해야 하며, 부부 중 1명 이상이 만 19~39세여야 합니다.',
            impact: '두 조건 중 하나라도 미충족 시 신청 자격이 없습니다.',
            checkQ: '두 분 모두 충주시에 거주하고 한 분이 만 39세 이하인가요?',
        },
        {
            id: 'co2', pageRef: 'P.2', title: 'P.2 주택 면적·공시가격 기준', sub: '자격 논리',
            riskType: '자격 조건', riskTitle: '전용 85㎡ 이하, 공시가격 3억원 미만',
            why: '전용면적 85㎡ 이하이어야 하며, 매입자금은 공시가격 3억원 미만 주택에 한합니다.',
            impact: '기준 초과 시 지원이 불가합니다.',
            checkQ: '현재 주택의 면적과 공시가격을 확인했나요?',
        },
        {
            id: 'a2', pageRef: 'P.3', title: 'P.3 대출 용도 명기 필수', sub: '자격 논리',
            riskType: '자격 조건', riskTitle: '【주택】·【전세】·【임차】 명기',
            why: '대출확인서에 주택·전세·임차 목적이 명확히 기재되어야 지원 대상이 됩니다.',
            impact: '신용·일반대출은 주택 용도여도 지원이 불가합니다.',
            checkQ: '금융기관 발행 대출확인서에 용도가 명기되어 있나요?',
        },
        {
            id: 'co3', pageRef: 'P.3', title: 'P.3 신용·일반대출 지원 불가 조건', sub: '자격 논리',
            riskType: '자격 조건', riskTitle: '주택·전세·임차 명기 대출만 지원',
            why: '신용대출·일반대출은 주택 용도여도 지원이 불가하며, 대출확인서에 용도가 명기된 경우에만 해당됩니다.',
            impact: '대출 종류를 잘못 파악하면 신청해도 지원 대상에서 제외됩니다.',
            checkQ: '대출이 주택담보·전세자금 대출이고 용도가 명기되어 있나요?',
        },
        {
            id: 'ac2', pageRef: 'P.5', title: 'P.5 대리신청 불가', sub: '자격 논리',
            riskType: '접수 방법', riskTitle: '신청인 본인 직접 방문 필수',
            why: '신청인은 신혼부부 중 대표 1인이며 대리신청은 어떤 경우에도 불가합니다.',
            impact: '대리 방문 시 접수 자체가 거부됩니다.',
            checkQ: '신청 당일 본인이 직접 방문할 수 있나요?',
        },
        {
            id: 'co5', pageRef: 'P.8', title: 'P.8 중복 지원 한도 조건', sub: '자격 논리',
            riskType: '자격 조건', riskTitle: '총 이자액 초과 지원 불가',
            why: '동일 대출건으로 2개 이상 사업에 중복 신청은 가능하나 총 이자액을 초과하여 받을 수 없습니다.',
            impact: '중복 신청 시 총 지원금 합계가 실제 납부 이자액을 넘으면 초과분이 환수됩니다.',
            checkQ: '다른 사업과 중복 신청 시 이자액 합계를 계산했나요?',
        },
        {
            id: 'ac6', pageRef: 'P.8', title: 'P.8 지원금 환수 주의', sub: '자격 논리',
            riskType: '주의 사항', riskTitle: '이혼·타지역 이전·허위 신청 시 환수',
            why: '지원금 수령 후 이혼, 타지역 이전, 허위 신청 사실 확인 시 지원금이 전액 환수됩니다.',
            impact: '지원 기간 중 상황이 변경되면 반드시 담당 부서에 신고해야 합니다.',
            checkQ: '지원 기간 중 거주지 이전 계획이 없는지 확인했나요?',
        },
        {
            id: 'c2', pageRef: 'P.9', title: 'P.9 배점 최고점 기준', sub: '자격 논리',
            riskType: '기준 해석', riskTitle: '3인 이상 자녀 5점, 3천만원 미만 소득 5점',
            why: '자녀 수와 소득 구간에 따라 배점이 달라지며, 예산 소진 시 배점 순으로 선정됩니다.',
            impact: '배점 기준을 정확히 이해하지 않으면 선정에서 불이익을 받을 수 있습니다.',
            checkQ: '배점표 기준으로 우리 가구의 예상 점수를 계산해 봤나요?',
        },
        {
            id: 'co6', pageRef: 'P.9', title: 'P.9 동점 시 선정 기준', sub: '자격 논리',
            riskType: '자격 조건', riskTitle: '자녀 수 많고 소득 적은 순',
            why: '배점 합산이 동일하면 자녀 수가 많고 부부합산 소득이 적은 순으로 선정합니다.',
            impact: '예산 소진 시 배점이 낮으면 탈락할 수 있습니다.',
            checkQ: '배점표 기준으로 우리 가구의 예상 점수를 계산해 봤나요?',
        },
    ],
};

const QUIZ_DATA = {
    question: '이 공고에서 신청 방법으로 맞는 것은 무엇인가요?',
    options: [
        '온라인 신청만 가능하다.',
        '거주지 읍면동 행정복지센터 방문 접수한다.',
        '이메일 제출 후 전화 확인하면 된다.',
        '대리 신청이 가능하다.',
    ],
    answer: 1,
};

// 실데이터 우선, 없으면 목데이터. 항목 있는 첫 카테고리를 기본 선택.
const CAT_ORDER = ['A', 'C', 'I', 'D'];
function firstNonEmptyCat(items) {
    return CAT_ORDER.find(c => items[c] && items[c].length > 0) || 'A';
}

// 항목의 쪽수 — pageRef('P.4')에서 뽑는다. 못 읽으면 맨 뒤로 보낸다.
function pageOf(item) {
    const n = parseInt(String(item?.pageRef || '').replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

// 공고문을 읽는 순서대로 보이도록 쪽수 오름차순 정렬.
// Array.prototype.sort는 안정 정렬이라 같은 쪽 안에서는 원래 순서가 유지된다.
function sortByPage(list) {
    return (list || []).slice().sort((a, b) => pageOf(a) - pageOf(b));
}

const RightPanel = ({ onSave, onPageChange, currentPage, selectedTokenCategory, highlightItemId, highlightNonce, analysisItems, quiz, initialReview, onReviewChange, isCompleted, hideItemDetail, onItemClick }) => {
    // 실데이터 모드: 전달된 analysisItems/quiz 사용 / 목데이터 모드: 기존 상수
    const ITEMS = analysisItems || ANALYSIS_ITEMS;

    // 공고별 퀴즈. 객체 1개로 와도 배열로 맞춘다.
    // 실데이터 모드(analysisItems 전달)에서 공고에 퀴즈가 없으면 빈 배열 → 다른 공고 문제를 대신
    // 띄우지 않고 "이해 점검" 탭을 숨긴다. 목데이터 데모 모드에서만 기존 예시 문제를 쓴다.
    const quizList = useMemo(() => {
        const given = Array.isArray(quiz) ? quiz : quiz ? [quiz] : [];
        const normalized = given
            .filter(q => q && q.question && Array.isArray(q.options) && q.options.length > 0)
            .map(q => ({
                question: q.question,
                options: q.options,
                answer: typeof q.answer === 'number' ? q.answer : (typeof q.answerIndex === 'number' ? q.answerIndex : 0),
                feedback: q.feedback || '',
            }));
        if (normalized.length > 0) return normalized;
        return analysisItems ? [] : [QUIZ_DATA];
    }, [quiz, analysisItems]);
    const hasQuiz = quizList.length > 0;

    const [mainTab, setMainTab] = useState('analysis');
    const [categoryTab, setCategoryTab] = useState(() => firstNonEmptyCat(ITEMS));
    const [selectedItem, setSelectedItem] = useState(() => {
        const c = firstNonEmptyCat(ITEMS);
        return sortByPage(ITEMS[c])[0] || null;
    });
    // 재진입 시 이전에 푼 퀴즈 상태 복원(실데이터 모드). 문항별 선택/확인 여부를 배열로 들고 있고,
    // 구 레코드(단일 문항: quizSelectedIdx)도 그대로 복원된다.
    const [answers, setAnswers] = useState(() => {
        if (Array.isArray(initialReview?.quizAnswers)) return initialReview.quizAnswers;
        if (initialReview?.quizAnswered && typeof initialReview.quizSelectedIdx === 'number') {
            return [initialReview.quizSelectedIdx];
        }
        return [];
    });
    const [checkedAt, setCheckedAt] = useState(() => {
        if (Array.isArray(initialReview?.quizAnswers)) {
            return initialReview.quizAnswers.map(a => typeof a === 'number');
        }
        return initialReview?.quizAnswered ? [true] : [];
    });
    const itemListRef = useRef(null);
    const bodyRef = useRef(null); // 실제 스크롤되는 영역(.rp-analysis-body)

    const items = useMemo(() => sortByPage(ITEMS[categoryTab]), [ITEMS, categoryTab]);

    // 토큰 클릭 시 카테고리 자동 전환
    useEffect(() => {
        if (!selectedTokenCategory) return;
        const catItems = ITEMS[selectedTokenCategory];
        if (!catItems) return;
        setMainTab('analysis');
        setCategoryTab(selectedTokenCategory);
        setSelectedItem(sortByPage(catItems)[0] || null); // 0건 카테고리도 크래시 없이
        if (itemListRef.current) {
            itemListRef.current.scrollTop = 0;
        }
    }, [selectedTokenCategory]); // eslint-disable-line react-hooks/exhaustive-deps

    // 특정 항목 id를 직접 선택 — 교육·행사 레이아웃의 카드 클릭, 그리고 본문 토큰(data-acid-id) 클릭 연동용.
    // 카테고리뿐 아니라 "바로 그 항목"까지 선택해야 할 때 쓴다. 기존 selectedTokenCategory 흐름과는 별개로 동작하며,
    // 같은 항목을 다시 눌러도 반응하도록 highlightNonce가 바뀌면 다시 실행한다(교육 레이아웃은 nonce를 넘기지 않음).
    useEffect(() => {
        if (!highlightItemId) return;
        for (const cat of CAT_ORDER) {
            const found = (ITEMS[cat] || []).find(it => it.id === highlightItemId);
            if (found) {
                setMainTab('analysis');
                setCategoryTab(cat);
                setSelectedItem(found);
                if (itemListRef.current) itemListRef.current.scrollTop = 0;
                break;
            }
        }
    }, [highlightItemId, highlightNonce]); // eslint-disable-line react-hooks/exhaustive-deps

    // 가운데에서 페이지를 넘기면 그 쪽 항목(.on-page)이 보이도록 목록을 스크롤한다.
    // 선택 상태(selectedItem)는 건드리지 않는다 — 선택은 사용자가 클릭할 때만 바뀐다.
    useEffect(() => {
        if (!currentPage || mainTab !== 'analysis') return;
        const body = bodyRef.current;
        const target = itemListRef.current?.querySelector('.rp-item-row.on-page');
        if (!body || !target) return;

        const margin = 12;
        const bodyRect = body.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        if (targetRect.top < bodyRect.top + margin) {
            body.scrollTop += targetRect.top - bodyRect.top - margin;
        } else if (targetRect.bottom > bodyRect.bottom - margin) {
            body.scrollTop += targetRect.bottom - bodyRect.bottom + margin;
        }
    }, [currentPage, categoryTab, mainTab]);

    // 퀴즈가 없는 공고인데 "이해 점검"에 머물러 있으면 항목 분석으로 되돌린다.
    useEffect(() => {
        if (!hasQuiz && mainTab === 'quiz') setMainTab('analysis');
    }, [hasQuiz, mainTab]);

    const handleCategoryChange = (catId) => {
        setCategoryTab(catId);
        setSelectedItem(sortByPage(ITEMS[catId])[0] || null);
    };

    // 검토 진행 상태 기록 — 전 문항을 확인했는지(quizAnswered), 모두 정답인지(quizCorrect)로 저장한다.
    // 대시보드·정책비교가 쓰는 기존 필드를 유지하면서 문항별 답(quizAnswers)을 함께 남긴다.
    const persistQuiz = (nextAnswers, nextChecked) => {
        if (!onReviewChange) return;
        const answeredAll = quizList.every((_, i) => typeof nextAnswers[i] === 'number' && nextChecked[i]);
        onReviewChange({
            quizAnswered: answeredAll,
            quizCorrect: answeredAll && quizList.every((q, i) => nextAnswers[i] === q.answer),
            quizSelectedIdx: typeof nextAnswers[0] === 'number' ? nextAnswers[0] : null,
            quizAnswers: nextAnswers,
        });
    };

    const selectOption = (qi, optionIdx) => {
        // 정답을 맞힌 문항은 더 못 바꾼다(기존 동작 유지).
        if (checkedAt[qi] && answers[qi] === quizList[qi].answer) return;
        const nextAnswers = [...answers];
        nextAnswers[qi] = optionIdx;
        const nextChecked = [...checkedAt];
        nextChecked[qi] = false;
        setAnswers(nextAnswers);
        setCheckedAt(nextChecked);
    };

    const checkAnswer = (qi) => {
        const nextChecked = [...checkedAt];
        nextChecked[qi] = true;
        setCheckedAt(nextChecked);
        persistQuiz(answers, nextChecked);
    };

    const retryQuiz = () => {
        setAnswers([]);
        setCheckedAt([]);
        // 저장된 답도 함께 초기화 — 다시 열어도 풀기 전 상태로 시작.
        if (onReviewChange) {
            onReviewChange({ quizAnswered: false, quizCorrect: false, quizSelectedIdx: null, quizAnswers: [] });
        }
    };

    return (
        <div className="right-panel-outer">

            {/* ── Main Tabs ── */}
            <div className="rp-main-tabs">
                <button
                    className={`rp-main-tab ${mainTab === 'analysis' ? 'active' : ''}`}
                    onClick={() => setMainTab('analysis')}
                >
                    항목 분석
                </button>
                {/* 공고에 퀴즈가 없으면 탭 자체를 숨긴다(다른 공고 문제 대체 금지). */}
                {hasQuiz && (
                    <button
                        className={`rp-main-tab ${mainTab === 'quiz' ? 'active' : ''}`}
                        onClick={() => setMainTab('quiz')}
                    >
                        이해 점검
                    </button>
                )}
            </div>

            {/* ── 항목 분석 ── */}
            {mainTab === 'analysis' && (
                <div className="rp-analysis-body" ref={bodyRef}>

                    {/* Category Pills */}
                    <div className="rp-cat-pills">
                        {CATEGORY_TABS.map(cat => (
                            <button
                                key={cat.id}
                                data-cat={cat.id}
                                className={`rp-cat-pill ${categoryTab === cat.id ? 'active' : ''}`}
                                onClick={() => handleCategoryChange(cat.id)}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Item List */}
                    <div className="rp-item-section">
                        <div className="rp-section-title">항목 목록</div>
                        <div className="rp-items" ref={itemListRef}>
                            {items.map(item => (
                                <div
                                    key={item.id}
                                    className={`rp-item-row ${selectedItem?.id === item.id ? 'active' : ''} ${currentPage && pageOf(item) === currentPage ? 'on-page' : ''}`}
                                    onClick={() => {
                                        setSelectedItem(item);
                                        const pageNum = parseInt(item.pageRef.replace('P.', ''), 10);
                                        if (!isNaN(pageNum) && onPageChange) {
                                            onPageChange(pageNum);
                                        }
                                        if (onItemClick) onItemClick(item);
                                    }}
                                >
                                    <span className={`rp-item-dot ${categoryTab}`} />
                                    <div className="rp-item-texts">
                                        <div className="rp-item-title">{item.title}</div>
                                        <div className="rp-item-sub">
                                            {item.sub}
                                            {/* 공고문만으로 판단이 안 되는 항목 표시 */}
                                            {item.needsCheck && <span className="rp-item-check-badge">확인 필요</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Detail Card — hideItemDetail을 주면 숨긴다. "주의 영향"이 없는 용어 항목은 그 블록만 빠진다. */}
                    {selectedItem && !hideItemDetail && (
                        <div className="rp-detail-card">
                            <div className="rp-detail-risk-label">선택된 항목</div>
                            <div className="rp-detail-type-badge">{selectedItem.riskType}</div>
                            <div className="rp-detail-title">{selectedItem.riskTitle}</div>

                            <div className="rp-detail-block">
                                <div className="rp-detail-block-label">왜 중요한지</div>
                                <div className="rp-detail-block-text">{selectedItem.why}</div>
                            </div>

                            {selectedItem.impact && (
                                <div className="rp-detail-block">
                                    <div className="rp-detail-block-label">주의 영향</div>
                                    <div className="rp-detail-block-text">{selectedItem.impact}</div>
                                </div>
                            )}

                            {/* "지금 확인할 것"(checkQ) 블록은 2026-10-12 전 공고 공통 삭제 — 데이터의 checkQ 필드는 남아 있으나 표시하지 않는다. */}
                        </div>
                    )}
                </div>
            )}

            {/* ── 이해 점검 ── */}
            {mainTab === 'quiz' && hasQuiz && (
                <div className="rp-quiz-body">
                    <div className="rp-quiz-inner">
                        {quizList.map((q, qi) => {
                            const picked = answers[qi];
                            const isChecked = !!checkedAt[qi];
                            const isRight = picked === q.answer;
                            return (
                                <div key={qi} className="rp-quiz-item">
                                    {quizList.length > 1 && (
                                        <div className="rp-quiz-no">문제 {qi + 1} / {quizList.length}</div>
                                    )}
                                    <p className="rp-quiz-question">{q.question}</p>
                                    <div className="rp-quiz-opts">
                                        {q.options.map((opt, i) => {
                                            const isSelected = picked === i;
                                            return (
                                                <div
                                                    key={i}
                                                    className={`rp-quiz-opt ${isSelected && !isChecked ? 'selected' : ''} ${isChecked && isSelected && isRight ? 'correct' : ''} ${isChecked && isSelected && !isRight ? 'wrong' : ''}`}
                                                    onClick={() => selectOption(qi, i)}
                                                >
                                                    {opt}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button
                                        className={`rp-quiz-check-btn ${typeof picked === 'number' && !isChecked ? 'active' : ''}`}
                                        onClick={() => checkAnswer(qi)}
                                        disabled={typeof picked !== 'number' || (isChecked && isRight)}
                                    >
                                        {isChecked && !isRight ? '다시 확인' : isChecked ? '확인 완료 ✓' : '답 확인'}
                                    </button>
                                    {isChecked && (
                                        <div className={`rp-quiz-feedback ${isRight ? 'success' : 'wrong'}`}>
                                            {isRight
                                                ? (q.feedback || '정답입니다. 공고문의 해당 문구를 다시 읽어보세요.')
                                                : (q.feedback ? `다시 확인이 필요해요. ${q.feedback}` : '다시 확인이 필요해요. 공고문의 해당 문구를 다시 읽어보세요.')}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {checkedAt.some(Boolean) && (
                            <button type="button" className="rp-quiz-retry-btn" onClick={retryQuiz}>
                                다시 풀기
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Footer ── */}
            <div className="rp-footer">
                <button className="rp-foot-secondary" onClick={() => onSave && onSave('temp')}>{isCompleted ? '검토 내용 저장' : '임시 저장'}</button>
                <button className="rp-foot-primary" onClick={() => onSave && onSave('complete')}>검토 완료</button>
            </div>
        </div>
    );
};

export default RightPanel;
