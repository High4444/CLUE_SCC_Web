import React, { useState, useMemo, useCallback } from 'react';
import LeftPanel from './LeftPanel';
import CenterPanel from './CenterPanel';
import RightPanel from './RightPanel';
import CollapsibleBlock from './CollapsibleBlock';
import './RecruitmentWorkbench.css';

// "채용"(recruitment) 워크벤치.
// 기본 구성은 지원사업과 같은 3분할(좌 원문 PDF / 중 CLUE 문서 해석 / 우 ACID 항목 분석)이고,
// 가운데 패널 맨 위에만 전형 흐름 블록(경로 칩 + 전형 단계 타임라인 + 날짜·요일 검증)을 얹는다.

// 전형 단계 타임라인 — 교육·행사 여정 타임라인과 같은 모양(점·연결선·라벨·날짜)이고,
// 노드는 전부 같은 스타일로 두되 itemId가 있으면 클릭으로 해당 항목과 연결된다.
const StageTimeline = ({ stages, selectedItemId, onSelect }) => (
    <div className="rec-timeline">
        {stages.map((s, i) => {
            const clickable = !!s.itemId;
            return (
                <div
                    key={`${s.title}-${i}`}
                    className={`rec-node ${clickable ? 'clickable' : ''} ${selectedItemId && selectedItemId === s.itemId ? 'selected' : ''}`}
                    onClick={clickable ? () => onSelect(s.itemId) : undefined}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                >
                    <span className="rec-node-dot" />
                    <span className="rec-node-title">{s.title}</span>
                    {s.date && <span className="rec-node-date">{s.date}</span>}
                    {s.criterion && <span className="rec-node-criterion">{s.criterion}</span>}
                </div>
            );
        })}
    </div>
);

const RecruitmentWorkbench = ({
    recruitment,
    pages,
    acidResults,
    analysisItems,
    docTitle,
    pdfUrl,
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
    const tracks = recruitment?.tracks || [];
    const [trackId, setTrackId] = useState(() => tracks[0]?.id || null);
    const [selectedItemId, setSelectedItemId] = useState(null);
    // 같은 노드를 다시 눌러도 우측 선택·본문 스크롤이 다시 일어나도록 하는 값.
    const [selectNonce, setSelectNonce] = useState(0);

    const acidById = useMemo(
        () => new Map((acidResults || []).map((r) => [r.id, r])),
        [acidResults]
    );

    // track이 지정된 노드는 선택한 경로와 같을 때만, track이 없는 노드는 항상 보여준다.
    const stages = useMemo(
        () => (recruitment?.stages || []).filter((s) => !s.track || s.track === trackId),
        [recruitment, trackId]
    );

    const handleSelect = useCallback((itemId) => {
        if (!itemId) return;
        setSelectedItemId(itemId);
        setSelectNonce((n) => n + 1);
        const item = acidById.get(itemId);
        if (item?.pageNumber) onPageChange(item.pageNumber);
    }, [acidById, onPageChange]);

    return (
        <main className="wb-panels rec-panels">
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

            <section className="panel-center rec-center">
                <CollapsibleBlock title="전형 흐름" defaultOpen={false}>
                <div className="rec-block">
                    {tracks.length > 0 && (
                        <div className="rec-tracks">
                            {tracks.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={`rec-track-chip ${t.id === trackId ? 'active' : ''}`}
                                    onClick={() => setTrackId(t.id)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <StageTimeline stages={stages} selectedItemId={selectedItemId} onSelect={handleSelect} />
                </div>
                </CollapsibleBlock>

                <CenterPanel
                    currentPage={currentPage}
                    onPageChange={onPageChange}
                    onForcePdfSync={() => {}}
                    onTokenSelect={(cat, acidId) => (acidId ? handleSelect(acidId) : null)}
                    pages={pages}
                    docId={docId}
                    focusAcidId={selectedItemId}
                    focusNonce={selectNonce}
                />
            </section>

            <aside className="panel-right">
                <RightPanel
                    onSave={onSave}
                    onPageChange={onPageChange}
                    currentPage={currentPage}
                    selectedTokenCategory={selectedTokenCategory}
                    highlightItemId={selectedItemId}
                    highlightNonce={selectNonce}
                    analysisItems={analysisItems}
                    quiz={quiz}
                    initialReview={initialReview}
                    onReviewChange={onReviewChange}
                    isCompleted={isCompleted}
                    onItemClick={(item) => {
                        setSelectedItemId(item.id);
                        setSelectNonce((n) => n + 1);
                    }}
                />
            </aside>
        </main>
    );
};

export default RecruitmentWorkbench;
