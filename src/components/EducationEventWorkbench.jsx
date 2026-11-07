import React, { useState, useEffect, useMemo } from 'react';
import LeftPanel from './LeftPanel';
import CenterPanel from './CenterPanel';
import RightPanel from './RightPanel';
import CollapsibleBlock from './CollapsibleBlock';
import { buildAnalysisItemsFromEduData, computeCurrentStageIndex } from '../constants/educationEventData';
import './EducationEventWorkbench.css';


// ACID 태그 매핑: 자격 조건=D(본문 토큰) · 혜택비용계산=I · 확인필요=C · 첨부번역=A
const ACID_TAG_LABEL = { D: 'D', I: 'I', C: 'C', A: 'A' };

const AcidTag = ({ tag }) => (
    <span className={`edu-acid-tag tag-${tag}`} title="ACID 분류">{ACID_TAG_LABEL[tag]}</span>
);

const PageLink = ({ pageNumber, onJump, children }) => (
    <button type="button" className="edu-page-link" onClick={() => onJump(pageNumber)}>
        {children ?? `원문 P.${pageNumber}`}
    </button>
);

const SummaryBar = ({ summary }) => (
    <div className="edu-summary-bar">
        <div className="edu-summary-item">
            <span className="edu-summary-label">대상</span>
            <span className="edu-summary-value">{summary.target}</span>
        </div>
        <div className="edu-summary-item">
            <span className="edu-summary-label">기간</span>
            <span className="edu-summary-value">{summary.period}</span>
        </div>
    </div>
);

// 여정 타임라인 — 지원→선발단계→교육연수→수료성과→사후 5개 고정 노드. 노드를 누르면 좌측 원문의 해당
// 페이지로 이동한다(onJump). risks(관련 확인필요 카드 id 배열)가 있으면 "⚠ N" 배지만 표시하고,
// 배지를 누르면(stopPropagation으로 노드 클릭과 분리) 문서 해석 본문의 해당 토큰으로 이동+강조한다(onWarnClick).
const JourneyTimeline = ({ timeline, currentIndex, onJump, onWarnClick }) => {
    if (!timeline || timeline.length === 0) return null;
    return (
        <div className="edu-timeline">
            {timeline.map((node, i) => (
                <div
                    key={node.key}
                    className={`edu-timeline-node ${i === currentIndex ? 'is-current' : ''} ${node.risks?.length ? 'has-risk' : ''}`}
                    onClick={() => onJump(node.pageNumber)}
                    role="button"
                    tabIndex={0}
                >
                    <span className="edu-timeline-dot" />
                    <span className="edu-timeline-label">{node.label}</span>
                    {node.dateLines ? (
                        <span className="edu-timeline-date edu-timeline-date--multi">
                            {node.dateLines.map((line, li) => <span key={li} className="edu-timeline-date-line">{line}</span>)}
                        </span>
                    ) : (
                        <span className="edu-timeline-date">{node.date}</span>
                    )}
                    <span className="edu-timeline-desc">{node.desc}</span>
                    {node.risks?.length > 0 && (
                        <button
                            type="button"
                            className="edu-timeline-risk-badge"
                            onClick={(e) => { e.stopPropagation(); onWarnClick(node.risks); }}
                        >
                            ⚠ {node.risks.length}
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
};

const GlossarySection = ({ items, onJump, onSelect, highlightId }) => {
    const [openKey, setOpenKey] = useState(null);

    // 우측 "항목 분석"에서 같은 용어를 누르면 아코디언을 자동으로 펼친다.
    useEffect(() => {
        if (!highlightId || !items) return;
        const idx = items.findIndex((it) => it.id === highlightId);
        if (idx === -1) return;
        setOpenKey(`${items[idx].pageNumber}-${idx}`);
    }, [highlightId, items]);

    if (!items || items.length === 0) {
        return <p className="edu-empty">이 공고문에는 번역할 영어 블록이 없습니다.</p>;
    }
    return (
        <div className="edu-glossary-list">
            {items.map((item, i) => {
                const key = `${item.pageNumber}-${i}`;
                const open = openKey === key;
                return (
                    <div
                        key={key}
                        className={`edu-glossary-item ${item.id === highlightId ? 'edu-glossary-item--highlight' : ''}`}
                        data-card-id={item.id}
                    >
                        <button
                            type="button"
                            className="edu-glossary-term"
                            onClick={() => {
                                setOpenKey(open ? null : key);
                                onSelect?.(item.id);
                            }}
                        >
                            <AcidTag tag="A" />
                            <span className="edu-glossary-term-text">{item.term}</span>
                            <span className="edu-glossary-chevron">{open ? '▴' : '▾'}</span>
                        </button>
                        {open && (
                            <div className="edu-glossary-gist">
                                {item.gist}
                                <PageLink pageNumber={item.pageNumber} onJump={onJump} />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const ScheduleSection = ({ schedule, onJump }) => {
    if (!schedule || !Array.isArray(schedule.days) || schedule.days.length === 0) {
        return <p className="edu-empty">일정표가 없습니다.</p>;
    }
    return (
        <>
            <p className="edu-schedule-note">
                {schedule.note} <PageLink pageNumber={schedule.pageNumber} onJump={onJump} />
            </p>
            <div className="edu-schedule-list">
                {schedule.days.map((day) => (
                    <div key={day.date} className="edu-schedule-day">
                        <div className="edu-schedule-date">{day.date}</div>
                        <ul className="edu-schedule-items">
                            {day.items.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                    </div>
                ))}
            </div>
        </>
    );
};

const AttachmentsTab = ({ schedule, attachment2, attachment3, onJump, onSelect, highlightId }) => (
    <div className="edu-attachments">
        <section className="edu-attachment-section">
            <h4 className="edu-attachment-title">첨부1 — 일정표</h4>
            <ScheduleSection schedule={schedule} onJump={onJump} />
        </section>
        <section className="edu-attachment-section">
            <h4 className="edu-attachment-title">첨부2 — 용어 해설</h4>
            <GlossarySection items={attachment2} onJump={onJump} onSelect={onSelect} highlightId={highlightId} />
        </section>
        <section className="edu-attachment-section">
            <h4 className="edu-attachment-title">첨부3 — 현장 견학</h4>
            <GlossarySection items={attachment3} onJump={onJump} onSelect={onSelect} highlightId={highlightId} />
        </section>
    </div>
);

const BASE_TABS = [
    // 다른 카테고리의 가운데 패널(원문 구조를 유지한 CLUE 해석 + ACID 색 토큰)을 이 레이아웃에서도
    // 첫 탭으로 그대로 쓴다. 토큰을 누르면 우측 "항목 분석"의 같은 항목이 선택된다.
    { key: 'reader', label: '문서 해석' },
    // "혜택·비용 계산"·"확인 필요" 탭은 2026-10-12 삭제 — 해당 항목(ben-·issue-)은 본문 토큰과 우측 항목 분석으로만 보여준다.
];

// 우측 "항목 분석" 패널 item.id 접두어 → 중앙 탭 매핑(항목 2, 우→중 연동용).
const TAB_BY_ID_PREFIX = [
    { prefix: 'elig-', tab: 'reader' }, // 자격 조건은 전용 탭 없이 본문 토큰으로 바로 간다
    { prefix: 'ben-', tab: 'reader' },
    { prefix: 'issue-', tab: 'reader' },
    { prefix: 'att2-', tab: 'attachments' },
    { prefix: 'att3-', tab: 'attachments' },
];

/**
 * "교육·행사" 카테고리(연수생/참여기업 모집 공고류) 전용 워크벤치 레이아웃.
 * 좌=LeftPanel(원문 PDF, 그대로 재사용) / 중=교육·행사 전용 탭(지원가능체크·혜택비용·확인필요) /
 * 우=RightPanel(ACID A·C·I·D 분석 + 이해 점검 + 저장, 기존 정책 레이아웃과 완전히 동일한 컴포넌트).
 * 즉 "중앙"만 새로 만들고 좌·우는 기존 3패널과 동일한 컴포넌트를 그대로 쓴다.
 */
const EducationEventWorkbench = ({
    eduData,
    pdfUrl,
    pages,
    docTitle,
    currentPage,
    onPageChange,
    isPdfExpanded,
    onToggleExpand,
    quiz,
    onSave,
    selectedTokenCategory,
    initialReview,
    onReviewChange,
    isCompleted,
    docId = null,
}) => {
    const hasAttachments = !!(eduData.schedule?.days?.length || eduData.attachment2?.length || eduData.attachment3?.length);
    const tabs = hasAttachments ? [...BASE_TABS, { key: 'attachments', label: '첨부 번역' }] : BASE_TABS;
    const [activeTab, setActiveTab] = useState('reader');
    // 가운데 카드 클릭 → 우측 "항목 분석" 패널에서 같은 항목 선택(항목 1·2).
    const [highlightItemId, setHighlightItemId] = useState(null);
    const selectItem = (id) => setHighlightItemId(id);
    // 우측 항목 클릭 또는 타임라인 "⚠ N" 배지 클릭 → 가운데 해당 카드로 스크롤+강조(항목 1·2의 반대 방향).
    const [centerHighlightId, setCenterHighlightId] = useState(null);
    // 같은 항목을 다시 눌러도 본문 토큰 스크롤·강조가 다시 일어나게 하는 값.
    const [readerFocusNonce, setReaderFocusNonce] = useState(0);

    // 우측 "항목 분석" 패널은 실제 Gemini acidResults가 아니라 이 레이아웃의 큐레이션 데이터를 보여준다
    // (항목 1) — eligibility→D · benefits→I · issues→C · attachment2+3→A. 자격 조건은 전용 탭 없이 본문 토큰으로만 보여준다.
    const analysisItems = buildAnalysisItemsFromEduData(eduData);
    const currentStageIndex = computeCurrentStageIndex(eduData.programPeriod);

    // 타임라인의 risks는 "확인 필요" 카드 id를 가리킨다. 카드가 지워졌는데 참조가 남으면
    // 눌러도 아무 데도 가지 않는 "⚠ N"이 뜨므로, 실제로 존재하는 카드만 세고 넘긴다.
    const timeline = useMemo(() => {
        const cardIds = new Set((eduData.issues || []).map((i) => i.id));
        return (eduData.timeline || []).map((node) =>
            node.risks?.length
                ? { ...node, risks: node.risks.filter((id) => cardIds.has(id)) }
                : node
        );
    }, [eduData.timeline, eduData.issues]);

    const jump = (pageNumber) => {
        if (pageNumber) onPageChange(pageNumber);
    };

    const handleRightItemClick = (item) => {
        const match = TAB_BY_ID_PREFIX.find((m) => item.id?.startsWith(m.prefix));
        if (!match) return;
        // "문서 해석"을 보고 있으면 탭을 뺏지 않고 본문의 같은 토큰으로 스크롤한다.
        if (activeTab !== match.tab) setActiveTab(match.tab);
        setCenterHighlightId(item.id);
        setReaderFocusNonce((n) => n + 1);
    };

    // 타임라인 "⚠ N" 배지 → 문서 해석 본문의 해당 토큰으로 스크롤 + 우측 항목 분석에서 같은 항목 선택.
    const handleWarnClick = (riskIds) => {
        if (!riskIds || riskIds.length === 0) return;
        setActiveTab('reader');
        setCenterHighlightId(riskIds[0]);
        setReaderFocusNonce((n) => n + 1);
        selectItem(riskIds[0]);
    };

    // centerHighlightId(또는 탭 전환)가 바뀌면 해당 카드로 스크롤한다.
    useEffect(() => {
        if (!centerHighlightId) return;
        const el = document.querySelector(`[data-card-id="${CSS.escape(centerHighlightId)}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [centerHighlightId, activeTab]);

    return (
        <main className="wb-panels edu-panels">
            <aside className={`panel-left ${isPdfExpanded ? 'expanded' : ''}`}>
                <LeftPanel
                    currentPage={currentPage}
                    onPageChange={onPageChange}
                    isExpanded={isPdfExpanded}
                    onToggleExpand={onToggleExpand}
                    pages={pages}
                    pdfUrl={pdfUrl}
                    docTitle={docTitle}
                />
            </aside>

            <section className="panel-center edu-center-col">
                <CollapsibleBlock title="공고 요약 · 일정" defaultOpen={false}>
                    <SummaryBar summary={eduData.summary} />
                    <JourneyTimeline timeline={timeline} currentIndex={currentStageIndex} onJump={jump} onWarnClick={handleWarnClick} />
                </CollapsibleBlock>
                <div className="edu-tabs-section">
                    <div className="edu-tabs-head">
                        {tabs.map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                className={`edu-tab-btn ${activeTab === t.key ? 'active' : ''}`}
                                onClick={() => setActiveTab(t.key)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <div className={`edu-tabs-body ${activeTab === 'reader' ? 'is-reader' : ''}`}>
                        {activeTab === 'reader' && (
                            <CenterPanel
                                currentPage={currentPage}
                                onPageChange={onPageChange}
                                onForcePdfSync={() => {}}
                                onTokenSelect={(cat, acidId) => { if (acidId) selectItem(acidId); }}
                                pages={pages}
                                docId={docId}
                                focusAcidId={centerHighlightId}
                                focusNonce={readerFocusNonce}
                            />
                        )}
                        {activeTab === 'attachments' && (
                            <AttachmentsTab
                                schedule={eduData.schedule}
                                attachment2={eduData.attachment2}
                                attachment3={eduData.attachment3}
                                onJump={jump}
                                onSelect={selectItem}
                                highlightId={centerHighlightId}
                            />
                        )}
                    </div>
                </div>
            </section>

            <aside className="panel-right">
                <RightPanel
                    onSave={onSave}
                    onPageChange={onPageChange}
                    selectedTokenCategory={selectedTokenCategory}
                    highlightItemId={highlightItemId}
                    analysisItems={analysisItems}
                    quiz={quiz}
                    initialReview={initialReview}
                    onReviewChange={onReviewChange}
                    isCompleted={isCompleted}
                    onItemClick={handleRightItemClick}
                />
            </aside>
        </main>
    );
};

export default EducationEventWorkbench;
