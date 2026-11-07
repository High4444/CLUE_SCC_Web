import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '../assets/logo.png';
import { useNavigate, useLocation } from 'react-router-dom';
import PersonaWidget from '../components/PersonaWidget';
import HeaderAuthButton from '../components/HeaderAuthButton';
import { listDocuments } from '../store/documentStore';
import CompareShowcase from '../components/CompareShowcase';
import { DEMO_COMPARE, shouldSwapCompare, swapCompareSides } from '../constants/compareDemoData';
import { docToCompareModel, isComparable } from '../utils/compareAdapter';
import './PolicyComparePage.css';

/* ═══════════════════════════════════════════════════════════
   정책 비교 (P5-1)
   프리셋·가짜 진행바·적합도 점수를 제거하고, 문서함의 "분석 완료된
   내 문서 2개"를 골라 ACID 결과(D=자격 논리 / I=핵심 정보)를 실비교한다.
   데이터 파생은 utils/compareAdapter(순수, 단위 테스트 대상)에 위임.
═══════════════════════════════════════════════════════════ */

/* ── 슬롯 선택기: 문서함의 분석 완료 문서를 고르거나, 내 PDF를 바로 올려(끌어다 놓기 포함) 분석한다 ── */
const SlotPicker = ({ slot, selected, other, options, isOpen, onOpen, onClose, onPick, onUpload, uploading, uploadError }) => {
    const fileRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const badgeClass = slot === 'A' ? 'badge-a' : 'badge-b';
    const noDocs = options.length === 0;
    // 다른 슬롯에서 이미 고른 문서는 후보에서 제외(같은 문서 자기비교 방지).
    const candidates = options.filter((o) => o.docId !== other);

    const pickFile = () => fileRef.current?.click();
    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        if (uploading) return;
        const file = e.dataTransfer?.files?.[0];
        if (file) onUpload(file);
    };

    const uploadButton = (label) => (
        <button
            type="button"
            className="pcp-slot-select-btn"
            disabled={uploading}
            onClick={(e) => { e.stopPropagation(); pickFile(); }}
        >
            {label}
        </button>
    );

    return (
        <div className="pcp-select-card">
            <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onUpload(file);
                }}
            />
            <div
                className={`pcp-upload-slot ${selected ? 'slot-filled' : ''} ${isOpen ? 'slot-open' : ''} ${dragging ? 'slot-drag' : ''}`}
                onClick={() => {
                    if (uploading) return;
                    if (noDocs) { pickFile(); return; }
                    (isOpen ? onClose() : onOpen());
                }}
                onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
            >
                {uploading ? (
                    <>
                        <div className={`pcp-ab-badge ${badgeClass}`}>{slot}</div>
                        <div className="pcp-slot-title">공고문을 분석하고 있어요</div>
                        <div className="pcp-slot-sub">잠시만 기다려 주세요.</div>
                    </>
                ) : selected ? (
                    <>
                        <div className={`pcp-ab-badge ${badgeClass}`}>{slot}</div>
                        <div className="pcp-filled-name">{selected.fileName}</div>
                        <div className="pcp-filled-agency">
                            {selected.statusLabel}
                            {selected.deadline ? ` · 마감 ${selected.deadline}` : ''}
                        </div>
                        {uploadButton('내 PDF 올리기')}
                    </>
                ) : (
                    <>
                        <div className={`pcp-ab-badge ${badgeClass}`}>{slot}</div>
                        <div className="pcp-slot-arrow">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
                                <path d="M3 7h18l-1.5 12a2 2 0 0 1-2 1.8H6.5a2 2 0 0 1-2-1.8L3 7z" />
                            </svg>
                        </div>
                        {noDocs ? (
                            <>
                                <div className="pcp-slot-title">내 PDF를 올려서 비교해 보세요</div>
                                <div className="pcp-slot-sub">파일을 끌어다 놓거나 아래 버튼으로 선택하세요</div>
                                {uploadButton('내 PDF 올리기')}
                            </>
                        ) : (
                            <>
                                <div className="pcp-slot-title">문서함에서 선택</div>
                                <div className="pcp-slot-sub">분석 완료된 공고문 {slot}</div>
                                {uploadButton('내 PDF 올리기')}
                            </>
                        )}
                    </>
                )}
                {!uploading && uploadError && <div className="pcp-upload-msg error">{uploadError}</div>}
            </div>

            <AnimatePresence>
                {isOpen && !noDocs && (
                    <motion.div
                        className="pcp-dropdown"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                    >
                        <div className="pcp-dropdown-header">
                            <span>내 문서함 · 분석 완료</span>
                            <button className="pcp-dropdown-close" onClick={onClose}>닫기</button>
                        </div>
                        <div
                            className="pcp-dropdown-item pcp-dropdown-upload"
                            onClick={() => { onClose(); pickFile(); }}
                        >
                            <span className="pcp-item-emoji">⬆️</span>
                            <span className="pcp-item-info">
                                <span className="pcp-item-name">내 컴퓨터에서 PDF 선택</span>
                                <span className="pcp-item-meta">새로 분석해서 이 슬롯에 넣어요 (같은 파일은 바로 열려요)</span>
                            </span>
                        </div>
                        {candidates.length === 0 ? (
                            <div className="pcp-dropdown-item" style={{ cursor: 'default', color: '#94a3b8' }}>
                                <span className="pcp-item-info">
                                    <span className="pcp-item-meta">다른 슬롯에서 사용 중이 아닌 문서가 없습니다</span>
                                </span>
                            </div>
                        ) : (
                            candidates.map((doc) => (
                                <div
                                    key={doc.docId}
                                    className={`pcp-dropdown-item ${selected?.docId === doc.docId ? 'active' : ''}`}
                                    onClick={() => onPick(doc.docId)}
                                >
                                    <span className="pcp-item-emoji">📄</span>
                                    <span className="pcp-item-info">
                                        <span className="pcp-item-name">{doc.fileName}</span>
                                        <span className="pcp-item-meta">
                                            {doc.statusLabel}
                                            {doc.deadline ? ` · 마감 ${doc.deadline}` : ' · 마감일 미설정'}
                                            {` · 자격 ${doc.dItems.length} · 핵심 ${doc.iItems.length}`}
                                        </span>
                                    </span>
                                    {selected?.docId === doc.docId && <span className="pcp-item-check">✓</span>}
                                </div>
                            ))
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/* ── 비교 항목 행 ── */
const InfoRow = ({ label, a, b }) => (
    <div className="pcp-trow">
        <div className="pcp-trow-key" style={{ cursor: 'default' }}>
            <div className="pcp-trow-key-info">
                <span className="pcp-trow-label">{label}</span>
            </div>
        </div>
        <div className="pcp-trow-val"><span className="pcp-val-summary">{a || '—'}</span></div>
        <div className="pcp-trow-val"><span className="pcp-val-summary">{b || '—'}</span></div>
    </div>
);

const DeadlineCell = ({ model }) => {
    if (!model.deadline) return <span className="pcp-val-summary" style={{ color: '#94a3b8' }}>미설정</span>;
    return (
        <span className="pcp-val-summary">
            {model.deadline}
            {model.deadlineSource === 'auto' && (
                <span className="pcp-plus-count" style={{ marginLeft: 6 }}>추정</span>
            )}
        </span>
    );
};

const ListCell = ({ items, emptyText }) => {
    if (!items || items.length === 0) {
        return <span className="pcp-val-summary" style={{ color: '#94a3b8' }}>{emptyText}</span>;
    }
    return (
        <ul className="pcp-bullet-list">
            {items.map((it) => <li key={it.id}>{it.text}</li>)}
        </ul>
    );
};

const ListRow = ({ label, diffLabel, diffType, a, b, emptyText }) => (
    <div className="pcp-trow">
        <div className="pcp-trow-key" style={{ cursor: 'default' }}>
            <div className="pcp-trow-key-info">
                <span className="pcp-trow-label">{label}</span>
                <span className={`pcp-trow-diff ${diffType}`}>{diffLabel}</span>
            </div>
        </div>
        <div className="pcp-trow-val"><ListCell items={a} emptyText={emptyText} /></div>
        <div className="pcp-trow-val"><ListCell items={b} emptyText={emptyText} /></div>
    </div>
);

const SummaryCell = ({ model }) => (
    <div className="pcp-summary-badges">
        <span className="pcp-plus-count">ACID {model.acidCount}개</span>
        {model.quiz.hasQuiz ? (
            <span className={`pcp-status-pill ${model.quiz.passed ? 'success' : 'warning'}`}>
                <span className="pcp-pill-icon">{model.quiz.passed ? '✓' : '△'}</span>
                {model.quiz.passed ? '이해점검 통과' : model.quiz.answered ? '이해점검 오답' : '이해점검 미완료'}
            </span>
        ) : (
            <span className="pcp-plus-count">이해점검 없음</span>
        )}
    </div>
);

/* ═══════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════ */
const PolicyComparePage = () => {
    const navigate = useNavigate();

    const [uploading, setUploading] = useState({ A: false, B: false });
    // 전시용 업로드(2026-10-12): 슬롯에 PDF를 올리면 실분석 대신 ~5초 분석 연출 후 파일명만 채운다.
    // 업로드 슬롯이 하나라도 있으면 "비교 보기"는 예시 비교(청년도약계좌 vs 청년미래적금)로 연결된다.
    const [staged, setStaged] = useState({ A: null, B: null }); // { fileName } | null
    const [uploadErrors, setUploadErrors] = useState({ A: null, B: null });

    // 문서함(localStorage)에서 분석 완료 문서만 열 뷰모델로 파생.
    const docModels = useMemo(
        () => listDocuments().filter(isComparable).map(docToCompareModel).filter(Boolean),
        []
    );
    const docMap = useMemo(() => {
        const m = {};
        docModels.forEach((d) => { m[d.docId] = d; });
        return m;
    }, [docModels]);

    const [slotA, setSlotA] = useState(null); // docId
    const [slotB, setSlotB] = useState(null);
    const [openSlot, setOpenSlot] = useState(null); // 'A' | 'B' | null
    const [phase, setPhase] = useState('select'); // 'select' | 'compare' | 'demo'
    const [demoData, setDemoData] = useState(DEMO_COMPARE); // 예시 비교 데이터(업로드 순서에 따라 a↔b 뒤집힘)

    const stagedModel = (slot) => staged[slot]
        ? { docId: `staged-${slot}`, fileName: staged[slot].fileName, statusLabel: '분석 완료' }
        : null;
    const modelA = stagedModel('A') || (slotA ? docMap[slotA] : null);
    const modelB = stagedModel('B') || (slotB ? docMap[slotB] : null);
    const hasStaged = !!(staged.A || staged.B);
    const canCompare = !!modelA && !!modelB && (hasStaged || slotA !== slotB);

    const goDashboard = () => navigate('/dashboard');

    // 슬롯에서 PDF 업로드 → 분석 연출(~5초) → 그 슬롯에 파일명 표시. 실분석 서버는 호출하지 않는다.
    const STAGED_ANALYSIS_MS = 5000;
    const handleUpload = async (slot, file) => {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const setErr = (msg) => setUploadErrors((e) => ({ ...e, [slot]: msg }));
        if (!isPdf) { setErr('PDF 파일만 업로드할 수 있습니다.'); return; }
        if (file.size > 20 * 1024 * 1024) { setErr('파일이 너무 큽니다. 20MB 이하 PDF를 올려주세요.'); return; }

        setErr(null);
        setOpenSlot(null);
        setUploading((u) => ({ ...u, [slot]: true }));
        await new Promise((r) => setTimeout(r, STAGED_ANALYSIS_MS));
        setStaged((st) => ({ ...st, [slot]: { fileName: file.name.replace(/\.pdf$/i, '') } }));
        if (slot === 'A') setSlotA(null); else setSlotB(null);
        setUploading((u) => ({ ...u, [slot]: false }));
    };

    /* ── 예시 비교(청년도약계좌 vs 청년미래적금) ── */
    if (phase === 'demo') {
        return (
            <div className="pcp-wrapper">
                <header className="pcp-header">
                    <div className="pcp-header-left">
                        <div className="pcp-logo cursor-pointer" onClick={goDashboard} style={{ display: 'flex', alignItems: 'center' }}>
                            <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                        </div>
                    </div>
                    <div className="pcp-header-right">
                        <PersonaWidget />
                        <HeaderAuthButton />
                    </div>
                </header>
                <div className="pcp-main pcp-main--wide">
                    <CompareShowcase data={demoData} onBack={() => setPhase('select')} />
                </div>
            </div>
        );
    }

    /* ── Select Phase ── */
    if (phase !== 'compare' || !canCompare) {
        return (
            <div className="pcp-wrapper">
                <header className="pcp-header">
                    <div className="pcp-header-left">
                        <div className="pcp-logo cursor-pointer" onClick={goDashboard} style={{ display: 'flex', alignItems: 'center' }}>
                            <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                        </div>
                    </div>
                    <div className="pcp-header-right">
                        <PersonaWidget />
                        <HeaderAuthButton />
                    </div>
                </header>

                <div className="pcp-main">
                    <div className="pcp-title-section">
                        <div className="pcp-title-group">
                            <h1>정책 비교</h1>
                            <p>분석한 공고문 두 개를 나란히 비교해 자격 조건과 핵심 정보의 차이를 확인하세요.</p>
                        </div>
                        <div className="pcp-steps-indicator">
                            <div className="pcp-step active">
                                <span className="pcp-step-badge">1</span>
                                <span className="pcp-step-text">문서 선택</span>
                            </div>
                            <div className="pcp-step-line" />
                            <div className="pcp-step">
                                <span className="pcp-step-badge">2</span>
                                <span className="pcp-step-text">비교 보기</span>
                            </div>
                        </div>
                    </div>

                    <div className="pcp-select-row">
                        <SlotPicker
                            slot="A"
                            selected={modelA}
                            other={slotB}
                            options={docModels}
                            isOpen={openSlot === 'A'}
                            onOpen={() => setOpenSlot('A')}
                            onClose={() => setOpenSlot(null)}
                            onPick={(id) => { setSlotA(id); setStaged((st) => ({ ...st, A: null })); setOpenSlot(null); }}
                            onUpload={(file) => handleUpload('A', file)}
                            uploading={uploading.A}
                            uploadError={uploadErrors.A}
                        />

                        <div className="pcp-vs-center">
                            <div className="pcp-vs-vline" />
                            <div className="pcp-vs-badge">vs</div>
                            <div className="pcp-vs-vline" />
                        </div>

                        <SlotPicker
                            slot="B"
                            selected={modelB}
                            other={slotA}
                            options={docModels}
                            isOpen={openSlot === 'B'}
                            onOpen={() => setOpenSlot('B')}
                            onClose={() => setOpenSlot(null)}
                            onPick={(id) => { setSlotB(id); setStaged((st) => ({ ...st, B: null })); setOpenSlot(null); }}
                            onUpload={(file) => handleUpload('B', file)}
                            uploading={uploading.B}
                            uploadError={uploadErrors.B}
                        />
                    </div>

                    <div className="pcp-start-action">
                        <button
                            className="pcp-start-btn"
                            disabled={!canCompare}
                            onClick={() => {
                                if (hasStaged) {
                                    // 올린 파일명에 맞춰 A/B 방향을 정한다(반대 칸에 올려도 화면 A/B가 파일과 일치).
                                    const swap = shouldSwapCompare(DEMO_COMPARE, modelA?.fileName, modelB?.fileName);
                                    setDemoData(swap ? swapCompareSides(DEMO_COMPARE) : DEMO_COMPARE);
                                    setPhase('demo');
                                } else {
                                    setPhase('compare');
                                }
                            }}
                        >
                            비교 보기 &rarr;
                        </button>
                        {!canCompare && (
                            <p className="pcp-start-hint">
                                양쪽 슬롯에 공고문 PDF를 하나씩 올리면 활성화됩니다.
                            </p>
                        )}
                    </div>
                    {/* "예시로 먼저 볼까요?" 진입 카드는 2026-10-12 삭제 — 예시 비교 화면은 PDF 업로드 후 "비교 보기"로만 열린다 */}
                </div>
            </div>
        );
    }

    /* ── Compare Phase ── */
    return (
        <div className="pcp-wrapper">
            <header className="pcp-header">
                <div className="pcp-header-left">
                    <div className="pcp-logo cursor-pointer" onClick={goDashboard} style={{ display: 'flex', alignItems: 'center' }}>
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                    </div>
                </div>
                <div className="pcp-header-right">
                    <PersonaWidget />
                    <HeaderAuthButton />
                </div>
            </header>

            <div className="pcp-main pcp-main--wide">
                <div className="pcp-result-topbar">
                    <div className="pcp-topbar-policies">
                        <span className="pcp-topbar-policy">
                            <span className="pcp-th-label-badge badge-a">A</span>
                            {modelA.fileName}
                        </span>
                        <span className="pcp-topbar-vs">vs</span>
                        <span className="pcp-topbar-policy">
                            <span className="pcp-th-label-badge badge-b">B</span>
                            {modelB.fileName}
                        </span>
                    </div>
                    <button className="pcp-reupload-btn" onClick={() => setPhase('select')}>
                        ← 다시 선택
                    </button>
                </div>

                <div className="pcp-step-label" style={{ marginTop: 24 }}>항목별 실비교</div>

                <motion.div
                    className="pcp-compare-table"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                >
                    <div className="pcp-table-thead">
                        <div className="pcp-th-key">비교 항목</div>
                        <div className="pcp-th-val a-side">
                            <span className="pcp-th-label-badge badge-a">A</span>
                            {modelA.fileName}
                        </div>
                        <div className="pcp-th-val">
                            <span className="pcp-th-label-badge badge-b">B</span>
                            {modelB.fileName}
                        </div>
                    </div>

                    <div className="pcp-table-body">
                        <InfoRow label="분석일" a={modelA.analyzedAt} b={modelB.analyzedAt} />

                        <div className="pcp-trow">
                            <div className="pcp-trow-key" style={{ cursor: 'default' }}>
                                <div className="pcp-trow-key-info"><span className="pcp-trow-label">마감일</span></div>
                            </div>
                            <div className="pcp-trow-val"><DeadlineCell model={modelA} /></div>
                            <div className="pcp-trow-val"><DeadlineCell model={modelB} /></div>
                        </div>

                        <InfoRow label="검토 상태" a={modelA.statusLabel} b={modelB.statusLabel} />

                        <ListRow
                            label="자격 조건 대조"
                            diffLabel="자격 논리 · D"
                            diffType="danger"
                            a={modelA.dItems}
                            b={modelB.dItems}
                            emptyText="추출된 자격 조건이 없습니다"
                        />

                        <ListRow
                            label="준비·핵심 정보"
                            diffLabel="핵심 정보 · I"
                            diffType="warning"
                            a={modelA.iItems}
                            b={modelB.iItems}
                            emptyText="추출된 핵심 정보가 없습니다"
                        />

                        <div className="pcp-trow">
                            <div className="pcp-trow-key" style={{ cursor: 'default' }}>
                                <div className="pcp-trow-key-info"><span className="pcp-trow-label">요약</span></div>
                            </div>
                            <div className="pcp-trow-val"><SummaryCell model={modelA} /></div>
                            <div className="pcp-trow-val"><SummaryCell model={modelB} /></div>
                        </div>

                        <div className="pcp-trow">
                            <div className="pcp-trow-key" style={{ cursor: 'default' }}>
                                <div className="pcp-trow-key-info"><span className="pcp-trow-label">워크벤치</span></div>
                            </div>
                            <div className="pcp-trow-val">
                                <button className="pcp-reupload-btn" onClick={() => navigate(`/workbench/${modelA.docId}`)}>
                                    워크벤치에서 보기 →
                                </button>
                            </div>
                            <div className="pcp-trow-val">
                                <button className="pcp-reupload-btn" onClick={() => navigate(`/workbench/${modelB.docId}`)}>
                                    워크벤치에서 보기 →
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

// 사이드바에서 "정책 비교"를 다시 누르면(같은 경로로 재이동) 슬롯·업로드·단계를 처음 상태로 리셋한다.
// 같은 경로 이동에도 location.key는 매번 새로 발급되므로 이를 key로 주어 페이지를 다시 마운트한다.
const PolicyComparePageRoute = () => {
    const location = useLocation();
    return <PolicyComparePage key={location.key} />;
};

export default PolicyComparePageRoute;
