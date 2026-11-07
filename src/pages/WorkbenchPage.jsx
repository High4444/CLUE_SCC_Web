import { keyboardAction } from '../utils/keyboardAction';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LeftPanel from '../components/LeftPanel';
import CenterPanel from '../components/CenterPanel';
import RightPanel from '../components/RightPanel';
import EducationEventWorkbench from '../components/EducationEventWorkbench';
import TenantRecruitmentWorkbench from '../components/TenantRecruitmentWorkbench';
import RecruitmentWorkbench from '../components/RecruitmentWorkbench';
import AnalysisProgress from '../components/AnalysisProgress';
import { useNavigate, useParams } from 'react-router-dom';
import { useAnalysis, getDocObjectUrl, ensureDocObjectUrl } from '../contexts/AnalysisContext';
import { getDocument, updateStatus, updateReview } from '../store/documentStore';
import { focusTokens } from '../utils/focusTokens';
import { buildFallbackEducationEventData } from '../constants/educationEventData';
import { getDemoById, getDemoStats } from '../data/demo';
import logoImg from '../assets/logo.png';
import './WorkbenchPage.css';

// ACID 태그 → 우측 패널 카테고리 라벨 (정본: docs/PRODUCT.md §4)
const CAT_LABEL = { A: '행정 용어', C: '문맥 참조', I: '핵심 정보', D: '자격 논리' };

// 백엔드 실응답 → 패널이 소비하는 형태로 변환.
// 목데이터 모드와 동일한 필드 자리에 맞춰 매핑(마크업 불변).
function buildRealData(analysis) {
    if (!analysis) return null;

    const rp = Array.isArray(analysis.reconstructedPages) ? analysis.reconstructedPages : [];
    const pages = rp
        .slice()
        .sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0))
        .map(p => ({
            page: p.pageNumber,
            title: p.title || `페이지 ${p.pageNumber}`,
            sub: p.sub || '',
            // 데모 공고는 JSON에 이미 최종 토큰만 들어 있으므로 재필터하지 않는다.
            contentHtml: analysis.isDemo
                ? (p.contentHtml || '')
                : focusTokens(p.contentHtml || '', analysis.acidResults, p.pageNumber),
        }));

    const analysisItems = { A: [], C: [], I: [], D: [] };
    (Array.isArray(analysis.acidResults) ? analysis.acidResults : []).forEach((r, i) => {
        const tag = (r.tag || '').toUpperCase();
        if (!analysisItems[tag]) return; // A/C/I/D 외 태그 무시
        const label = CAT_LABEL[tag];
        analysisItems[tag].push({
            id: r.id || `${tag}-${i}`,
            pageRef: `P.${r.pageNumber || 1}`,
            title: r.title || label,
            sub: label,
            riskType: label,
            riskTitle: r.title || label,
            why: r.why || r.evidenceText || '',
            impact: r.impact || '',
            checkQ: r.check || '',
            needsCheck: !!r.needsCheck, // 공고문만으로 판단이 안 되는 항목 → 목록에 "확인 필요" 배지
        });
    });

    // quiz는 공고 JSON에 따라 객체 1개(지원사업)거나 문항 배열(입주자 모집)이라 항상 배열로 맞춘다.
    // 공고에 퀴즈가 없으면 빈 배열 → 다른 공고 문제를 대신 띄우지 않고 "이해 점검" 탭 자체를 숨긴다.
    const rawQuiz = Array.isArray(analysis.quiz) ? analysis.quiz : analysis.quiz ? [analysis.quiz] : [];
    const quiz = rawQuiz
        .filter(q => q && q.question && Array.isArray(q.options) && q.options.length > 0)
        .map(q => ({
            question: q.question,
            options: q.options,
            answer: typeof q.answerIndex === 'number' ? q.answerIndex : 0,
            feedback: q.feedback || '',
        }));

    return { pages, analysisItems, quiz, fileName: analysis.fileName || '' };
}

// 분석 과정 화면을 이미 본 공고 기록 — 같은 세션(탭) 안에서만 유지된다.
const DEMO_SEEN_KEY = 'clue_demo_seen';

function readSeenDemos() {
    try {
        const raw = sessionStorage.getItem(DEMO_SEEN_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return []; // sessionStorage 미지원·차단 → 매번 진행 화면을 보여준다
    }
}

function wasDemoSeen(demoId) {
    return !!demoId && readSeenDemos().includes(demoId);
}

function markDemoSeen(demoId) {
    if (!demoId) return;
    try {
        const seen = readSeenDemos();
        if (!seen.includes(demoId)) sessionStorage.setItem(DEMO_SEEN_KEY, JSON.stringify([...seen, demoId]));
    } catch {
        // 저장 실패해도 화면 흐름엔 영향 없음
    }
}

const WorkbenchPage = () => {
    const navigate = useNavigate();
    const { docId } = useParams();
    const { getAnalysis, startAnalysis, reusedDocId } = useAnalysis();
    // docId + 분석 결과가 있으면 실데이터 모드, 없으면 기존 목데이터 모드(현행 유지).
    const analysis = getAnalysis(docId);
    const realData = buildRealData(analysis);
    const isRealMode = !!(docId && analysis);
    // "교육·행사" 카테고리 전용 레이아웃(실험) — AnalysisContext에서 규칙 기반으로 분류된 문서만.
    // 다른 카테고리는 category가 없어 기존 3패널 레이아웃을 그대로 탄다.
    const isEducationEvent = isRealMode && analysis.category === 'education_event';
    // 교육·행사 구조 데이터는 데모 JSON의 eduData에서 온다. 데모가 아니면 acidResults 기반 최소 구조로 대체.
    const eduData = isEducationEvent
        ? (analysis.eduData || buildFallbackEducationEventData(analysis))
        : null;
    // "입주자 모집" — 가운데만 순위 사다리로 바뀌고 좌(원문 해석)·우(ACID 항목)는 지원사업과 같은 3분할.
    const isTenantRecruitment = isRealMode && analysis.category === 'tenant_recruitment' && !!analysis.ladder;
    // "채용" — 지원사업 3분할 그대로 쓰고 가운데 맨 위에 전형 흐름 블록만 더한다.
    const isRecruitment = isRealMode && analysis.category === 'recruitment' && !!analysis.recruitment;

    // ── 분석 과정 화면(데모 공고 전용) ──
    // 공고를 열면 결과 대신 진행 화면을 먼저 보여주고, 같은 세션에서 다시 열면 바로 결과를 보여준다.
    const demo = isRealMode && analysis.demoId ? getDemoById(analysis.demoId) : null;
    const [showProgress, setShowProgress] = useState(() => !!demo && !wasDemoSeen(demo.id));
    const finishProgress = useCallback(() => {
        if (demo) markDemoSeen(demo.id);
        setShowProgress(false);
    }, [demo]);

    // 원본 미리보기용 objectURL: 메모리 맵 우선, 없으면 pdfStore(IndexedDB)에서 재생성.
    // 재진입·재시작 후에도 좌측 패널 원본이 살아나도록 async 로드.
    const [pdfUrl, setPdfUrl] = useState(() => getDocObjectUrl(docId));
    useEffect(() => {
        if (!isRealMode) return;
        let cancelled = false;
        ensureDocObjectUrl(docId).then(url => {
            if (!cancelled && url) setPdfUrl(url);
        });
        return () => { cancelled = true; };
    }, [docId, isRealMode]);

    // 검토 진행(review) 복원용 초기값 + 저장 시 캡처할 최신 상태 ref.
    const initialReview = useMemo(
        () => (isRealMode ? getDocument(docId)?.review || null : null),
        [docId, isRealMode]
    );
    const reviewRef = useRef({});
    useEffect(() => {
        reviewRef.current = { ...(initialReview || {}) };
    }, [initialReview]);

    // 재진입 시각 기록.
    useEffect(() => {
        if (isRealMode) updateReview(docId, { lastViewedAt: Date.now() });
    }, [docId, isRealMode]);

    // RightPanel(실데이터 모드)이 퀴즈를 풀면 진행 상태를 즉시 store에 반영.
    const handleReviewChange = useCallback((r) => {
        reviewRef.current = { ...reviewRef.current, ...r };
        if (isRealMode) updateReview(docId, r);
    }, [docId, isRealMode]);

    // 문서 실상태(B1/B2): 마운트 시 1회 로드. docId 전환 시 라우트 key로 강제 리마운트(A1)되어 갱신됨.
    const [docStatus, setDocStatus] = useState(() =>
        isRealMode ? (getDocument(docId)?.status || 'reviewing') : 'demo'
    );

    const [currentPage, setCurrentPage] = useState(1);
    const [isPdfExpanded, setIsPdfExpanded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveType, setSaveType] = useState('');
    const [demoNotice, setDemoNotice] = useState(false); // 데모 문서 저장 시도 안내(B6)
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState(null);
    const uploadTimerRef = useRef(null);
    const fileInputRef = useRef(null);
    const [selectedTokenCategory, setSelectedTokenCategory] = useState(null);
    // 본문 토큰이 data-acid-id로 특정 항목을 가리키면 그 항목까지 선택한다.
    // nonce는 같은 토큰을 다시 눌렀을 때도 우측 패널이 다시 반응하도록 하는 용도.
    const [tokenItemId, setTokenItemId] = useState(null);
    const [tokenNonce, setTokenNonce] = useState(0);

    const handleTokenSelect = useCallback((category, acidId) => {
        setSelectedTokenCategory(category);
        if (acidId) {
            setTokenItemId(acidId);
            setTokenNonce((n) => n + 1);
        }
    }, []);

    // 진행바 타이머 정리(언마운트).
    useEffect(() => () => {
        if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    }, []);

    // 파일 교체: 실분석(ACID 엔진) → 새 문서로 이동. 대시보드 업로드와 동일 흐름.
    // 성공 시 새 docId 워크벤치로 navigate, 실패 시 에러 표시 + 현재 문서 유지.
    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // 같은 파일 재선택 허용
        if (!file) return;

        // 서버와 동일 기준: PDF만, 20MB 이하.
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (!isPdf) { setUploadError('PDF 파일만 업로드할 수 있습니다.'); return; }
        if (file.size > 20 * 1024 * 1024) { setUploadError('파일이 너무 큽니다. 20MB 이하 PDF를 올려주세요.'); return; }

        setUploadError(null);
        setIsUploading(true);
        setUploadProgress(0);

        // 진행바: 업로드 구간(빠르게 ~15%) → 분석 구간(90% 상한 대기).
        // 백엔드 분석 60~120초 → 완료 전까지 100% 금지(대시보드와 동일 규칙).
        if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
        uploadTimerRef.current = setInterval(() => {
            setUploadProgress(p => {
                if (p < 15) return p + 3;
                if (p < 70) return p + 1;
                if (p < 90) return Math.random() < 0.5 ? p + 1 : p;
                return p;
            });
        }, 400);

        try {
            const newDocId = await startAnalysis(file);
            if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
            setUploadProgress(100);
            setTimeout(() => {
                setIsUploading(false);
                navigate(`/workbench/${newDocId}`);
            }, 500);
        } catch (err) {
            if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
            setIsUploading(false);
            setUploadProgress(0);
            setUploadError(err?.message || '분석 중 오류가 발생했습니다.');
        }
    };

    const handleSave = (type) => {
        // 데모 모드(고아 /workbench 등): 저장 대상 문서가 없음 → 안내만(무동작 스피너 제거, B6).
        if (!isRealMode) {
            setDemoNotice(true);
            return;
        }

        setSaveType(type);
        setIsSaving(true);

        const review = { ...reviewRef.current, lastViewedAt: Date.now() };
        // B1: 완료(completed) 문서는 상태 역행 금지.
        //  - 검토완료(complete): completed로 승격(또는 유지).
        //  - 검토 내용 저장(temp): 이미 completed면 상태 유지, review만 갱신. 아니면 saved.
        if (type === 'complete') {
            updateStatus(docId, 'completed');
            setDocStatus('completed');
        } else if (docStatus !== 'completed') {
            updateStatus(docId, 'saved');
            setDocStatus('saved');
        }
        updateReview(docId, review);

        setTimeout(() => {
            setIsSaving(false);
            navigate('/history');
        }, 1500);
    };

    return (
        <div className="workbench-layout">
            {/* Top Global Header */}
            <header className="wb-global-header">
                <div className="wb-gh-left">
                    <div {...keyboardAction}
                        className="wb-gh-logo"
                        onClick={() => navigate('/dashboard')}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '28px' }} />
                    </div>
                    <span className="wb-gh-workspace-label">워크스페이스</span>
                    {/* 상태 칩(임시저장/검토완료/데모 문서)은 2026-10-12 모든 공고에서 삭제 */}
                    {reusedDocId && reusedDocId === docId && (
                        <span
                            className="wb-reuse-chip"
                            title="같은 파일을 이전에 분석한 결과를 다시 열었어요. 새로 분석하려면 문서함에서 이전 문서를 삭제하고 다시 업로드하세요."
                        >
                            이전 분석 결과
                        </span>
                    )}
                </div>

                <div className="wb-gh-right">
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept=".pdf"
                        onChange={handleFileChange}
                    />
                    <button
                        className="wb-header-btn secondary"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        새 공고 분석
                    </button>
                    <button className="wb-header-btn exit" onClick={() => navigate('/dashboard')}>
                        나가기
                    </button>
                </div>
            </header>

            {/* 데모 공고는 분석 과정 화면을 먼저 보여준 뒤 결과 화면으로 전환한다. */}
            {showProgress && demo ? (
                <AnalysisProgress
                    fileName={realData?.fileName || demo.title}
                    stats={getDemoStats(demo)}
                    onDone={finishProgress}
                />
            ) : isRecruitment ? (
                <RecruitmentWorkbench
                    recruitment={analysis.recruitment}
                    pages={realData?.pages}
                    acidResults={analysis.acidResults}
                    analysisItems={realData?.analysisItems}
                    docTitle={realData?.fileName}
                    pdfUrl={pdfUrl}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    isPdfExpanded={isPdfExpanded}
                    onToggleExpand={() => setIsPdfExpanded(!isPdfExpanded)}
                    quiz={realData?.quiz}
                    onSave={handleSave}
                    selectedTokenCategory={selectedTokenCategory}
                    initialReview={initialReview}
                    onReviewChange={handleReviewChange}
                    isCompleted={docStatus === 'completed'}
                    docId={isRealMode ? docId : null}
                />
            ) : isTenantRecruitment ? (
                <TenantRecruitmentWorkbench
                    ladder={analysis.ladder}
                    pages={realData?.pages}
                    pdfUrl={pdfUrl}
                    acidResults={analysis.acidResults}
                    analysisItems={realData?.analysisItems}
                    docTitle={realData?.fileName}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    isPdfExpanded={isPdfExpanded}
                    onToggleExpand={() => setIsPdfExpanded(!isPdfExpanded)}
                    quiz={realData?.quiz}
                    onSave={handleSave}
                    selectedTokenCategory={selectedTokenCategory}
                    initialReview={initialReview}
                    onReviewChange={handleReviewChange}
                    isCompleted={docStatus === 'completed'}
                    docId={isRealMode ? docId : null}
                />
            ) : isEducationEvent ? (
                <EducationEventWorkbench
                    eduData={eduData}
                    pdfUrl={pdfUrl}
                    pages={realData?.pages}
                    docTitle={realData?.fileName}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    isPdfExpanded={isPdfExpanded}
                    onToggleExpand={() => setIsPdfExpanded(!isPdfExpanded)}
                    quiz={realData?.quiz}
                    onSave={handleSave}
                    selectedTokenCategory={selectedTokenCategory}
                    initialReview={isRealMode ? initialReview : null}
                    onReviewChange={isRealMode ? handleReviewChange : null}
                    isCompleted={docStatus === 'completed'}
                    docId={isRealMode ? docId : null}
                />
            ) : (
                <main className="wb-panels">
                    {/* Left Panel */}
                    <aside className={`panel-left ${isPdfExpanded ? 'expanded' : ''}`}>
                        <LeftPanel
                            currentPage={currentPage}
                            onPageChange={setCurrentPage}
                            isExpanded={isPdfExpanded}
                            onToggleExpand={() => setIsPdfExpanded(!isPdfExpanded)}
                            pages={realData?.pages}
                            pdfUrl={pdfUrl}
                            docTitle={realData?.fileName}
                        />
                    </aside>

                    {/* Center Panel */}
                    <section className="panel-center">
                        <CenterPanel
                            currentPage={currentPage}
                            onPageChange={setCurrentPage}
                            onForcePdfSync={() => {}}
                            onTokenSelect={handleTokenSelect}
                            pages={realData?.pages}
                            docId={isRealMode ? docId : null}
                        />
                    </section>

                    {/* Right Panel */}
                    <aside className="panel-right">
                        <RightPanel
                            onSave={handleSave}
                            onPageChange={setCurrentPage}
                            currentPage={currentPage}
                            selectedTokenCategory={selectedTokenCategory}
                            highlightItemId={tokenItemId}
                            highlightNonce={tokenNonce}
                            analysisItems={realData?.analysisItems}
                            quiz={realData?.quiz}
                            initialReview={isRealMode ? initialReview : null}
                            onReviewChange={isRealMode ? handleReviewChange : null}
                            isCompleted={docStatus === 'completed'}
                        />
                    </aside>
                </main>
            )}

            {/* Saving Animation Overlay */}
            <AnimatePresence>
                {isSaving && (
                    <motion.div
                        className="wb-saving-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="wb-saving-modal"
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                        >
                            <div className="wb-sm-spinner">
                                <svg width="40" height="40" viewBox="0 0 50 50">
                                    <circle cx="25" cy="25" r="20" fill="none" stroke="#E2E8F0" strokeWidth="4"></circle>
                                    <circle cx="25" cy="25" r="20" fill="none" stroke="#2563EB" strokeWidth="4" strokeDasharray="31.4 125.6" strokeLinecap="round">
                                        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                                    </circle>
                                </svg>
                            </div>
                            <h3>{saveType === 'temp' ? '임시 저장 중...' : '검토 완료 처리 중...'}</h3>
                            <p>{saveType === 'temp' ? '업로드 내역에 임시저장 중입니다.' : '잠시 후 업로드 내역으로 이동합니다'}</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Uploading Animation Overlay */}
            <AnimatePresence>
                {isUploading && (
                    <motion.div
                        className="wb-saving-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="wb-saving-modal"
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                        >
                            <div className="wb-sm-spinner">
                                <svg width="40" height="40" viewBox="0 0 50 50">
                                    <circle cx="25" cy="25" r="20" fill="none" stroke="#E2E8F0" strokeWidth="4"></circle>
                                    <circle cx="25" cy="25" r="20" fill="none" stroke="#2563EB" strokeWidth="4" strokeDasharray={`${uploadProgress * 1.25} 125.6`} strokeLinecap="round">
                                    </circle>
                                </svg>
                            </div>
                            <h3>새로운 파일 분석 중... {uploadProgress}%</h3>
                            <p>잠시만 기다려 주세요</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 새 공고 분석 실패 안내 — 현재 문서는 그대로 유지. 기존 오버레이 스타일 재사용. */}
            <AnimatePresence>
                {uploadError && (
                    <motion.div
                        className="wb-saving-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="wb-saving-modal"
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                        >
                            <h3>새 공고 분석 실패</h3>
                            <p>{uploadError}</p>
                            <button className="wb-header-btn secondary" onClick={() => setUploadError(null)}>닫기</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 데모 문서 저장 시도 안내(B6) — 데모는 저장 대상이 없으므로 스피너 없이 안내만. */}
            <AnimatePresence>
                {demoNotice && (
                    <motion.div
                        className="wb-saving-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="wb-saving-modal"
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                        >
                            <h3>데모 문서는 저장되지 않아요</h3>
                            <p>실제 공고문을 업로드하면 검토 내용을 저장할 수 있어요.</p>
                            <button className="wb-header-btn secondary" onClick={() => setDemoNotice(false)}>닫기</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default WorkbenchPage;
