import React, { useState, useEffect, useMemo, useCallback } from 'react';
import LeftPanel from './LeftPanel';
import CenterPanel from './CenterPanel';
import RightPanel from './RightPanel';
import './TenantRecruitmentWorkbench.css';

// "입주자 모집"(tenant_recruitment) 전용 워크벤치.
// 2026-10-12 재배치: 좌=원본 PDF·페이지 목록(LeftPanel) / 중=탭["문서 해석"(CenterPanel, 기본) · "신청 요건 한눈에"(순위 사다리)]
// / 우=RightPanel. 다른 카테고리와 같은 3분할에, 순위 사다리는 교육·행사의 "첨부 번역"처럼 탭으로 넘겨 본다.
// 사다리의 모든 박스는 itemId로 acidResults의 항목을 가리키고, 누르면 세 패널이 같은 항목을 가리킨다.

const CENTER_TABS = [
    { key: 'reader', label: '문서 해석' },
    { key: 'ladder', label: '신청 요건 한눈에' },
];

// ── 중: 순위 사다리 ──
const LadderBox = ({ box, variant, selected, onSelect }) => (
    <button
        type="button"
        className={`trw-box ${variant} ${selected ? 'selected' : ''}`}
        onClick={() => onSelect(box.itemId)}
        disabled={!box.itemId}
    >
        <span className="trw-box-title">{box.title}</span>
        {box.sub && <span className="trw-box-sub">{box.sub}</span>}
    </button>
);

const Ladder = ({ ladder, selectedItemId, onSelect, whyText }) => (
    <div className="trw-ladder">
        <section className="trw-stage">
            <div className="trw-stage-label">공통 관문 · 모두 통과해야 함</div>
            <div className="trw-row">
                {ladder.gates.map((g) => (
                    <LadderBox key={g.itemId || g.title} box={g} variant="gate" selected={selectedItemId === g.itemId} onSelect={onSelect} />
                ))}
            </div>
        </section>

        <div className="trw-arrow" aria-hidden="true">↓</div>

        <div className="trw-mid">
            <section className="trw-stage">
                <div className="trw-stage-label">순위</div>
                <div className="trw-row">
                    {ladder.ranks.map((r) => (
                        <LadderBox key={r.itemId || r.title} box={r} variant="rank" selected={selectedItemId === r.itemId} onSelect={onSelect} />
                    ))}
                </div>
            </section>

            <section className="trw-stage trw-exit-stage">
                <div className="trw-stage-label">탈락·제한 사유</div>
                <div className="trw-col">
                    {ladder.exits.map((x) => (
                        <LadderBox key={x.itemId || x.title} box={x} variant="exit" selected={selectedItemId === x.itemId} onSelect={onSelect} />
                    ))}
                </div>
            </section>
        </div>

        <div className="trw-bottom">
            <section className="trw-card">
                <div className="trw-card-title">신청 일정</div>
                <table className="trw-table">
                    <tbody>
                        {ladder.schedule.map(([label, value]) => (
                            <tr key={label}>
                                <td className="trw-td-label">{label}</td>
                                <td className="trw-td-value">{value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section
                className={`trw-card trw-card--clickable ${selectedItemId === ladder.points.itemId ? 'selected' : ''}`}
                onClick={() => ladder.points.itemId && onSelect(ladder.points.itemId)}
                role="button"
                tabIndex={0}
            >
                <div className="trw-card-title">{ladder.points.title}</div>
                <table className="trw-table">
                    <tbody>
                        {ladder.points.rows.map(([label, value]) => (
                            <tr key={label}>
                                <td className="trw-td-label">{label}</td>
                                <td className="trw-td-value">{value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {ladder.points.tiebreak && <p className="trw-tiebreak">{ladder.points.tiebreak}</p>}
            </section>
        </div>

        <div className="trw-why">
            {whyText || '박스를 누르면 해당 항목이 왜 중요한지 여기에 표시됩니다.'}
        </div>
    </div>
);

const TenantRecruitmentWorkbench = ({
    ladder,
    pages,
    pdfUrl,
    acidResults,
    analysisItems,
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
    const [selectedItemId, setSelectedItemId] = useState(null);
    // 같은 박스를 다시 눌러도 우측 선택·좌측 스크롤이 다시 일어나도록 하는 값.
    const [selectNonce, setSelectNonce] = useState(0);
    const [activeTab, setActiveTab] = useState('reader');

    const acidById = useMemo(
        () => new Map((acidResults || []).map((r) => [r.id, r])),
        [acidResults]
    );

    // 공고문 쪽수가 1부터 시작하지 않을 수 있어(SH는 5쪽부터) 범위 밖이면 첫 페이지로 맞춘다.
    useEffect(() => {
        if (!pages?.length) return;
        if (!pages.some((p) => p.page === currentPage)) onPageChange(pages[0].page);
    }, [pages, currentPage, onPageChange]);

    // 박스·토큰 클릭 → 우측 항목 선택 + ACID 필터 전환(RightPanel), 좌측 원문·문서 해석은 해당 쪽으로 이동.
    const handleSelect = useCallback((itemId) => {
        if (!itemId) return;
        setSelectedItemId(itemId);
        setSelectNonce((n) => n + 1);
        const item = acidById.get(itemId);
        if (item?.pageNumber) onPageChange(item.pageNumber);
    }, [acidById, onPageChange]);

    const whyText = selectedItemId ? acidById.get(selectedItemId)?.why : '';

    return (
        <main className="wb-panels trw-panels">
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

            <section className="panel-center trw-center">
                <div className="trw-tabs-head">
                    {CENTER_TABS.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            className={`trw-tab-btn ${activeTab === t.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(t.key)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className={`trw-tabs-body ${activeTab === 'reader' ? 'is-reader' : ''}`}>
                    {activeTab === 'reader' ? (
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
                    ) : (
                        <Ladder
                            ladder={ladder}
                            selectedItemId={selectedItemId}
                            onSelect={handleSelect}
                            whyText={whyText}
                        />
                    )}
                </div>
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
                        // 우측에서 고른 항목도 문서 해석 본문 강조·사다리 박스 선택으로 이어지게 한다(페이지 이동은 RightPanel이 처리).
                        setSelectedItemId(item.id);
                        setSelectNonce((n) => n + 1);
                    }}
                />
            </aside>
        </main>
    );
};

export default TenantRecruitmentWorkbench;
