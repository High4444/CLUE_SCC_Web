import React, { useState, useRef, useEffect } from 'react';
import './CenterPanel.css';
import { PAGE_DATA } from '../constants/pageData';
import { sanitizeContentHtml } from '../utils/sanitizeHtml';
import { getDrawings, saveDrawings } from '../store/drawingStore';

const CenterPanel = ({ currentPage, onPageChange, onForcePdfSync, onTokenSelect, pages, docId, focusAcidId, focusNonce }) => {
    // 실데이터 모드: 전달된 pages 사용 / 목데이터 모드: 기존 PAGE_DATA
    const isReal = Array.isArray(pages) && pages.length > 0;
    const source = isReal ? pages : PAGE_DATA;
    const totalPages = source.length;
    // 쪽 번호가 1부터 연속이 아닐 수 있어(입주자 모집 공고: 5,6,…,14,15,19) 번호로 찾고, 없으면 순서로 폴백.
    const foundIdx = source.findIndex((p) => p.page === currentPage);
    const pageIdx = foundIdx >= 0 ? foundIdx : Math.min(Math.max(currentPage - 1, 0), totalPages - 1);
    const current = source[pageIdx];

    const canvasRef = useRef(null);
    const contentRef = useRef(null);
    const [drawMode, setDrawMode] = useState('none'); // 'none' | 'pen' | 'highlighter' | 'eraser'
    const [penSize, setPenSize] = useState(3);
    const [highlighterSize, setHighlighterSize] = useState(24);
    const [eraserSize, setEraserSize] = useState(20);
    const [isPenPopoverOpen, setIsPenPopoverOpen] = useState(false);
    const [isHighlighterPopoverOpen, setIsHighlighterPopoverOpen] = useState(false);
    const [isEraserPopoverOpen, setIsEraserPopoverOpen] = useState(false);
    const isDrawingRef = useRef(false);
    const lastXRef = useRef(0);
    const lastYRef = useRef(0);
    const [savedDrawings, setSavedDrawings] = useState({});
    const savedDrawingsRef = useRef(savedDrawings);
    // 실문서(docId) 복원 완료 시 bump → 캔버스 초기화 effect 재실행 트리거.
    const [restoreTick, setRestoreTick] = useState(0);

    // 외부(채용 전형 타임라인 등)에서 특정 ACID 항목을 가리키면 본문의 해당 토큰으로 스크롤하고 잠깐 강조한다.
    useEffect(() => {
        if (!focusAcidId || !contentRef.current) return;
        const el = contentRef.current.querySelector(`[data-acid-id="${CSS.escape(focusAcidId)}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('cp-token-focus');
        const t = setTimeout(() => el.classList.remove('cp-token-focus'), 1600);
        return () => clearTimeout(t);
    }, [focusAcidId, focusNonce, currentPage]);

    // Close popovers when drawMode changes
    useEffect(() => {
        if (drawMode !== 'pen') setIsPenPopoverOpen(false);
        if (drawMode !== 'highlighter') setIsHighlighterPopoverOpen(false);
        if (drawMode !== 'eraser') setIsEraserPopoverOpen(false);
    }, [drawMode]);

    // Keep ref in sync
    useEffect(() => {
        savedDrawingsRef.current = savedDrawings;
    }, [savedDrawings]);

    // 실문서 필기 복원: 마운트/문서 변경 시 IndexedDB에서 로드.
    // docId 없는 목데이터 데모 모드는 기존 메모리 동작 유지(로드 안 함).
    // IndexedDB 실패 시 getDrawings가 null 반환 → 조용히 메모리 동작 유지.
    useEffect(() => {
        if (!docId) return;
        let cancelled = false;
        getDrawings(docId).then(d => {
            if (cancelled) return;
            if (d && typeof d === 'object' && Object.keys(d).length > 0) {
                savedDrawingsRef.current = d;
                setSavedDrawings(d);
                setRestoreTick(t => t + 1); // 현재 페이지 캔버스 다시 그리기
                console.info(`[drawing] 복원됨 doc=${docId} pages=[${Object.keys(d).join(',')}]`);
            }
        });
        return () => { cancelled = true; };
    }, [docId]);

    // 실문서 필기 저장 — 즉시 IndexedDB 반영(디바운스 없음).
    // 디바운스는 긋고 곧바로 페이지를 떠날 때 마지막 저장을 유실시켰다. 획이
    // 끝나는 stopDrawing 시점에 바로 저장해 유실 창을 없앤다. dataURL은 획 종료
    // 시 1회만 생성되므로 비용도 낮다. 목데이터 모드(docId 없음)는 저장 skip.
    const persistDrawings = (next) => {
        if (!docId) return;
        saveDrawings(docId, next); // 실패해도(미지원 등) 메모리 동작엔 영향 없음
    };

    // Handle page transitions & initialization
    useEffect(() => {
        const initCanvas = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
                
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                const dataUrl = savedDrawingsRef.current[currentPage];
                if (dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.drawImage(img, 0, 0);
                    };
                    img.src = dataUrl;
                }
            }
        };

        const timer = setTimeout(initCanvas, 100);
        return () => clearTimeout(timer);
    }, [currentPage, restoreTick]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const parent = canvas.parentElement;
            if (parent) {
                const dataUrl = canvas.toDataURL();
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
                
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                if (dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.drawImage(img, 0, 0);
                    };
                    img.src = dataUrl;
                }
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const getCoordinates = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        
        if (e.touches && e.touches.length > 0) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }
        
        return {
            x: e.nativeEvent.offsetX ?? (e.clientX - rect.left),
            y: e.nativeEvent.offsetY ?? (e.clientY - rect.top)
        };
    };

    const startDrawing = (e) => {
        if (drawMode === 'none') return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        isDrawingRef.current = true;
        const { x, y } = getCoordinates(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        lastXRef.current = x;
        lastYRef.current = y;
    };

    const draw = (e) => {
        if (!isDrawingRef.current || drawMode === 'none') return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { x, y } = getCoordinates(e);
        
        ctx.beginPath();
        ctx.moveTo(lastXRef.current, lastYRef.current);
        ctx.lineTo(x, y);
        if (drawMode === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = eraserSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        } else if (drawMode === 'highlighter') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(255, 235, 59, 0.45)'; // Translucent yellow highlighter
            ctx.lineWidth = highlighterSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#EF4444'; // Red pen color
            ctx.lineWidth = penSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
        ctx.stroke();
        
        lastXRef.current = x;
        lastYRef.current = y;
    };

    const stopDrawing = () => {
        if (isDrawingRef.current) {
            isDrawingRef.current = false;
            const canvas = canvasRef.current;
            if (canvas) {
                const next = { ...savedDrawingsRef.current, [currentPage]: canvas.toDataURL() };
                savedDrawingsRef.current = next;
                setSavedDrawings(next);
                persistDrawings(next); // 즉시 저장(실문서만)
            }
        }
    };

    const handleClearAll = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const next = { ...savedDrawingsRef.current };
            delete next[currentPage];
            savedDrawingsRef.current = next;
            setSavedDrawings(next);
            persistDrawings(next); // 즉시 저장(실문서만)
        }
        setIsEraserPopoverOpen(false);
        setDrawMode('none');
    };

    // 이전/다음은 쪽 번호가 아니라 pages 배열 순서로 이동한다.
    const handleNext = () => {
        if (pageIdx < totalPages - 1) onPageChange(source[pageIdx + 1].page);
    };

    const handlePrev = () => {
        if (pageIdx > 0) onPageChange(source[pageIdx - 1].page);
    };

    return (
        <div className="center-panel-outer">
            <div className="panel-header">
                <div className="cp-h-left">
                    <span>CLUE 문서 해석</span>
                    <span className="cp-h-hint">
                        요약 없이 원문 구조를 유지하고 핵심 조건만 강조합니다.
                    </span>
                </div>
                <div className="cp-h-btns">
                    <div className="cp-draw-tools">
                        {/* Pen Button with Popover */}
                        <div className="cp-tool-btn-wrapper" style={{ position: 'relative' }}>
                            <button
                                className={`cp-tool-btn ${drawMode === 'pen' ? 'active' : ''}`}
                                onClick={() => {
                                    if (drawMode === 'pen') {
                                        if (isPenPopoverOpen) {
                                            setDrawMode('none');
                                        } else {
                                            setIsPenPopoverOpen(true);
                                        }
                                    } else {
                                        setDrawMode('pen');
                                        setIsPenPopoverOpen(true);
                                    }
                                }}
                                title="펜 그리기"
                            >
                                ✏️ 펜
                            </button>
                            {isPenPopoverOpen && (
                                <div className="cp-size-popover">
                                    <button className={`cp-size-preset ${penSize === 2 ? 'active' : ''}`} onClick={() => { setPenSize(2); setIsPenPopoverOpen(false); }}>
                                        <span className="dot dot-s"></span>
                                        얇게 (2px)
                                    </button>
                                    <button className={`cp-size-preset ${penSize === 6 ? 'active' : ''}`} onClick={() => { setPenSize(6); setIsPenPopoverOpen(false); }}>
                                        <span className="dot dot-m"></span>
                                        보통 (6px)
                                    </button>
                                    <button className={`cp-size-preset ${penSize === 12 ? 'active' : ''}`} onClick={() => { setPenSize(12); setIsPenPopoverOpen(false); }}>
                                        <span className="dot dot-l"></span>
                                        두껍게 (12px)
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Highlighter Button with Popover */}
                        <div className="cp-tool-btn-wrapper" style={{ position: 'relative' }}>
                            <button
                                className={`cp-tool-btn ${drawMode === 'highlighter' ? 'active' : ''}`}
                                onClick={() => {
                                    if (drawMode === 'highlighter') {
                                        if (isHighlighterPopoverOpen) {
                                            setDrawMode('none');
                                        } else {
                                            setIsHighlighterPopoverOpen(true);
                                        }
                                    } else {
                                        setDrawMode('highlighter');
                                        setIsHighlighterPopoverOpen(true);
                                    }
                                }}
                                title="형광펜 그리기"
                            >
                                🖋️ 형광펜
                            </button>
                            {isHighlighterPopoverOpen && (
                                <div className="cp-size-popover">
                                    <button className={`cp-size-preset ${highlighterSize === 12 ? 'active' : ''}`} onClick={() => { setHighlighterSize(12); setIsHighlighterPopoverOpen(false); }}>
                                        <span className="dot dot-s"></span>
                                        얇게 (12px)
                                    </button>
                                    <button className={`cp-size-preset ${highlighterSize === 24 ? 'active' : ''}`} onClick={() => { setHighlighterSize(24); setIsHighlighterPopoverOpen(false); }}>
                                        <span className="dot dot-m"></span>
                                        보통 (24px)
                                    </button>
                                    <button className={`cp-size-preset ${highlighterSize === 36 ? 'active' : ''}`} onClick={() => { setHighlighterSize(36); setIsHighlighterPopoverOpen(false); }}>
                                        <span className="dot dot-l"></span>
                                        두껍게 (36px)
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Eraser Button with Popover */}
                        <div className="cp-tool-btn-wrapper" style={{ position: 'relative' }}>
                            <button
                                className={`cp-tool-btn ${drawMode === 'eraser' ? 'active' : ''}`}
                                onClick={() => {
                                    if (drawMode === 'eraser') {
                                        if (isEraserPopoverOpen) {
                                            setDrawMode('none');
                                        } else {
                                            setIsEraserPopoverOpen(true);
                                        }
                                    } else {
                                        setDrawMode('eraser');
                                        setIsEraserPopoverOpen(true);
                                    }
                                }}
                                title="지우개"
                            >
                                🧹 지우개
                            </button>
                            {isEraserPopoverOpen && (
                                <div className="cp-size-popover">
                                    <button className={`cp-size-preset ${eraserSize === 10 ? 'active' : ''}`} onClick={() => { setEraserSize(10); setIsEraserPopoverOpen(false); }}>
                                        <span className="dot dot-s"></span>
                                        얇게 (10px)
                                    </button>
                                    <button className={`cp-size-preset ${eraserSize === 20 ? 'active' : ''}`} onClick={() => { setEraserSize(20); setIsEraserPopoverOpen(false); }}>
                                        <span className="dot dot-m"></span>
                                        보통 (20px)
                                    </button>
                                    <button className={`cp-size-preset ${eraserSize === 40 ? 'active' : ''}`} onClick={() => { setEraserSize(40); setIsEraserPopoverOpen(false); }}>
                                        <span className="dot dot-l"></span>
                                        두껍게 (40px)
                                    </button>
                                    <div className="cp-popover-divider"></div>
                                    <button className="cp-clear-all-btn" onClick={handleClearAll}>
                                        🗑️ 모두 지우기
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <button className="cp-page-btn" onClick={handlePrev} disabled={pageIdx === 0}>이전</button>
                    <span className="cp-page-num">{pageIdx + 1} / {totalPages}</span>
                    <button className="cp-page-btn" onClick={handleNext} disabled={pageIdx === totalPages - 1}>다음</button>
                </div>
            </div>


            <div className="cp-body">
                <div className="cp-viewer-card">
                    {/* Page Meta Header */}
                    <div className="cp-vh-meta-row">
                        <span className="cp-vh-page">PAGE {current.page}</span>
                        <span className="cp-vh-dot">·</span>
                        <span className="cp-vh-sub">{current.sub}</span>
                    </div>

                    {/* Main Content */}
                    <div className="cp-viewer-content" style={{ position: 'relative' }} onClick={(e) => {
                        if (drawMode !== 'none') return;
                        if (e.target.classList.contains('cp-token')) {
                            // 토큰 클래스 → 오른쪽 패널 카테고리 매핑 (정본: docs/DESIGN.md §5)
                            //   구 형식: success=A(행정) · info=C(문맥) · warning=I(핵심정보) · danger=D(자격논리)
                            //   신 형식: acid-a/-c/-i/-d (데모 데이터) — data-acid-id로 가리키는 항목까지 지정한다.
                            const TOKEN_TO_CAT = {
                                'success': 'A',
                                'info': 'C',
                                'warning': 'I',
                                'danger': 'D',
                                'acid-a': 'A',
                                'acid-c': 'C',
                                'acid-i': 'I',
                                'acid-d': 'D',
                            };
                            const tokenClasses = Array.from(e.target.classList);
                            const tokenType = tokenClasses.find(c => TOKEN_TO_CAT[c]);
                            if (tokenType && onTokenSelect) {
                                // 두 번째 인자(항목 id)는 없으면 null — 구 형식 토큰은 카테고리만 전환된다.
                                onTokenSelect(TOKEN_TO_CAT[tokenType], e.target.getAttribute('data-acid-id') || null);
                            }
                            const targetPageStr = e.target.getAttribute('data-page');
                            const targetPage = targetPageStr ? parseInt(targetPageStr, 10) : current.page;
                            if (targetPage !== currentPage) {
                                onPageChange(targetPage);
                            } else if (onForcePdfSync) {
                                onForcePdfSync();
                            }
                        }
                    }}>
                        <canvas
                            ref={canvasRef}
                            className="cp-drawing-canvas"
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                zIndex: 10,
                                pointerEvents: drawMode === 'none' ? 'none' : 'auto',
                                cursor: (drawMode === 'pen' || drawMode === 'highlighter') ? 'crosshair' : drawMode === 'eraser' ? 'cell' : 'default'
                            }}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />
                        <h1 className="cp-content-title">{current.title}</h1>
                        {isReal ? (
                            <div
                                ref={contentRef}
                                className="cp-content-para"
                                dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(current.contentHtml) }}
                            />
                        ) : (
                            <div className="cp-content-para">{current.content}</div>
                        )}
                    </div>

                </div>
            </div>

        </div>
    );
};

export default CenterPanel;
