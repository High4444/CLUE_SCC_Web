import { keyboardAction } from '../utils/keyboardAction';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import { listDocuments, deleteDocument, updateDeadline, getDocument } from '../store/documentStore';
import { deletePdf } from '../store/pdfStore';
import { deleteDrawings } from '../store/drawingStore';
import { removeEventForDoc, addEventForDoc, hasEventForDoc } from '../store/calendarStore';
import { removeChecklist, ensureChecklist } from '../store/checklistStore';
import PersonaWidget from '../components/PersonaWidget';
import HeaderAuthButton from '../components/HeaderAuthButton';
import ConfirmDialog from '../components/ConfirmDialog';
import './UploadHistoryPage.css';

// 문서 상태 → 기존 배지/필터 체계 매핑.
// bucket: 기존 status-pill/필터 CSS 클래스(done/needs-check/analyzing) 재사용.
// label: 카드 상태 배지에 표시할 실제 라벨.
const STATUS_META = {
    completed: { bucket: 'done', label: '검토완료' },
    // 2026-10-12: "검토중" 상태는 화면에서 없앤다 — 분석만 끝난 문서(reviewing)도 임시저장으로 보이고 세어진다.
    reviewing: { bucket: 'analyzing', label: '임시저장' },
    saved: { bucket: 'analyzing', label: '임시저장' },
};

function formatDateTime(ts) {
    if (!ts) return '';
    const dt = new Date(ts);
    if (isNaN(dt.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}.${p(dt.getMonth() + 1)}.${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

// 문서 레코드 → 기존 카드 마크업이 소비하는 뷰모델.
function toViewModel(doc) {
    const meta = STATUS_META[doc.status] || STATUS_META.reviewing;
    return {
        id: doc.docId,
        docId: doc.docId,
        name: doc.fileName || '분석한 공고문',
        date: formatDateTime(doc.uploadedAt),
        deadline: doc.deadline ? doc.deadline.replace(/-/g, '.') : null,
        deadlineIso: doc.deadline || '',                                   // date input value용 원본
        // 출처 표기(결정③): 'auto'=추정 라벨. 구 레코드(source 없음)는 자동 추출이었으므로 'auto'.
        deadlineSource: doc.deadline ? (doc.deadlineSource || 'auto') : null,
        status: meta.bucket,
    };
}

// 마감일 셀(결정③: "추정" 라벨 + 수동 수정). 기존 .uh-deadline-tag 스타일 재사용.
//  - source 'auto'면 날짜 옆에 작은 "추정" 배지, 'manual'이면 라벨 없음.
//  - 클릭 → 네이티브 date input(값 변경 시 즉시 커밋). "지우기"로 마감일 삭제.
function DeadlineCell({ file, onCommit }) {
    const [editing, setEditing] = useState(false);
    const inputRef = useRef(null);

    const commit = (iso) => {
        setEditing(false);
        onCommit(file.docId, iso || null);
    };

    if (editing) {
        return (
            <span className="uh-deadline-edit-wrap" onClick={(e) => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    type="date"
                    className="uh-deadline-edit"
                    defaultValue={file.deadlineIso || ''}
                    autoFocus
                    onChange={(e) => commit(e.target.value)}
                    onBlur={() => setEditing(false)}
                />
                {file.deadlineIso && (
                    <button
                        type="button"
                        className="uh-deadline-clear"
                        title="마감일 지우기"
                        onMouseDown={(e) => { e.preventDefault(); commit(''); }}
                    >
                        지우기
                    </button>
                )}
            </span>
        );
    }

    if (file.deadline) {
        return (
            <button
                type="button"
                className="uh-deadline-tag uh-deadline-editable"
                title="클릭해 마감일 수정"
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            >
                마감일: {file.deadline}
                {file.deadlineSource === 'auto' && <span className="uh-deadline-est">추정</span>}
            </button>
        );
    }

    // 마감일 없음 → 최소 추가 어포던스.
    return (
        <button
            type="button"
            className="uh-deadline-add"
            title="마감일 추가"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        >
            + 마감일
        </button>
    );
}

function UploadHistoryPage() {
    const navigate = useNavigate();
    const [sortBy, setSortBy] = useState('deadline');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'done', 'needs-check', 'analyzing'
    const [toastMsg, setToastMsg] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    // 실데이터 문서함(localStorage) — 마운트 시 로드, 삭제 시 갱신.
    const [documents, setDocuments] = useState(() => listDocuments());
    useEffect(() => {
        setDocuments(listDocuments());
    }, []);

    // 삭제 확인은 앱 자체 확인창(ConfirmDialog)으로 묻는다 — 내장 브라우저에서 window.confirm이
    // 뜨지 않고 즉시 false가 돌아와 삭제가 조용히 막히던 문제(2026-10-12) 수정.
    const [pendingDelete, setPendingDelete] = useState(null); // { docId } | null
    const handleDelete = (docId) => {
        if (!docId) return;
        setPendingDelete({ docId });
    };
    const confirmDelete = () => {
        const docId = pendingDelete?.docId;
        setPendingDelete(null);
        if (!docId) return;
        deleteDocument(docId);
        deletePdf(docId); // IndexedDB Blob 제거(비동기, 결과 대기 불필요)
        deleteDrawings(docId); // IndexedDB 드로잉 제거(비동기, 결과 대기 불필요)
        removeEventForDoc(docId); // 마감일 자동 캘린더 이벤트 동반 제거
        removeChecklist(docId); // 신청 체크리스트 진행 상태 동반 제거
        setDocuments(listDocuments());
        setToastMsg('문서를 삭제했습니다.');
        setTimeout(() => setToastMsg(''), 2500);
    };

    // 마감일 수동 수정/삭제(결정③). 스토어 갱신 → 캘린더 이벤트 동기 갱신 → (로그인 시) 서버 반영.
    // iso: 'YYYY-MM-DD' 수정, null: 삭제(마감일 없음).
    const handleDeadlineCommit = (docId, iso) => {
        if (!docId) return;
        updateDeadline(docId, iso, 'manual'); // documentStore가 syncPush('documents') 발사
        if (iso) {
            const updated = getDocument(docId);
            if (updated) addEventForDoc(updated); // 이벤트 갱신(manual → estimated=false, 라벨 없음)
        } else {
            removeEventForDoc(docId);             // 마감일 삭제 → 캘린더 이벤트 제거
        }
        setDocuments(listDocuments());
        setToastMsg(iso ? '마감일을 수정했습니다.' : '마감일을 삭제했습니다.');
        setTimeout(() => setToastMsg(''), 2500);
    };

    // 캘린더 추가(결정 B3): store 경유 단일 경로 — 이중 등록 버그 해소.
    //  ① 이미 등록(doc-<id> 존재) → 안내 / ② 미등록+마감일 있음 → addEventForDoc + 성공
    //  ③ 마감일 없음 → 마감일 먼저 입력 안내.
    const handleAddToCalendar = (file) => {
        if (hasEventForDoc(file.docId)) {
            setToastMsg('이미 캘린더에 추가되어 있습니다.');
            setTimeout(() => setToastMsg(''), 2500);
            return;
        }
        const doc = getDocument(file.docId);
        if (doc && doc.deadline) {
            addEventForDoc(doc);
            setToastMsg(`완료! [${file.name}] 마감일을 캘린더에 추가했습니다.`);
        } else {
            setToastMsg('마감일이 없어 추가할 수 없어요. 마감일을 먼저 입력해주세요.');
        }
        setTimeout(() => setToastMsg(''), 3000);
    };

    // 실데이터 문서함 → 카드 뷰모델.
    const viewModels = useMemo(() => documents.map(toViewModel), [documents]);

    // 필터·검색·정렬.
    const filtered = useMemo(() => {
        let data = [...viewModels];

        // 1. 검색어 필터링 적용
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            data = data.filter(item =>
                item.name.toLowerCase().includes(query)
            );
        }

        // 2. 필터링 적용
        if (filterStatus !== 'all') {
            data = data.filter(item => item.status === filterStatus);
        }

        // 3. 정렬 적용
        return data.sort((a, b) => {
            if (sortBy === 'latest') {
                return new Date(b.date.replace(/\./g, '-')) - new Date(a.date.replace(/\./g, '-'));
            }
            if (sortBy === 'deadline') {
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return new Date(a.deadline.replace(/\./g, '-')) - new Date(b.deadline.replace(/\./g, '-'));
            }
            if (sortBy === 'alphabetical') {
                return a.name.localeCompare(b.name, 'ko');
            }
            return 0;
        });
    }, [viewModels, filterStatus, sortBy, searchQuery]);

    const statusCount = (bucket) => viewModels.filter(item => item.status === bucket).length;

    // "전체" 보기에서는 분석완료 → 임시저장 순으로 묶고 묶음마다 제목 구분선을 넣는다(2026-10-12).
    // 각 묶음 안의 순서는 위 정렬 그대로. 상태 필터를 고른 경우에는 구분선 없이 카드만 보인다.
    const GROUPS = [
        { bucket: 'done', label: '분석완료' },
        { bucket: 'analyzing', label: '임시저장' },
    ];
    const displayRows = filterStatus === 'all'
        ? GROUPS.flatMap(({ bucket, label }) => {
            const files = filtered.filter((f) => f.status === bucket);
            if (files.length === 0) return [];
            return [{ kind: 'header', key: `group-${bucket}`, bucket, label, count: files.length },
                ...files.map((file) => ({ kind: 'card', key: file.id, file }))];
        })
        : filtered.map((file) => ({ kind: 'card', key: file.id, file }));

    return (
        <div className="uh-page-wrapper">
            {/* 1. Header (Matched to Dashboard) */}
            <header className="uh-header">
                <div className="uh-header-left">
                    <div {...keyboardAction} className="uh-logo cursor-pointer" onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center' }}>
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                    </div>
                </div>

                <div className="uh-header-right">
                    <PersonaWidget />
                    <HeaderAuthButton onLoginSuccess={() => setDocuments(listDocuments())} />
                </div>
            </header>

            <main className="uh-main">
                {/* 2. Breadcrumb & Title Section */}
                <div className="uh-page-header">
                    <div className="uh-title-group">
                        <div className="uh-title-row">
                            <h1>업로드 내역</h1>
                            <span className="uh-count-badge">{filtered.length}</span>
                        </div>
                        <p>최근 분석된 공고문 리포트 보관함입니다.</p>
                    </div>
                </div>

                <div className="uh-summary-bar">
                    <div className="uh-stats-row">
                        <div {...keyboardAction} className={`stat-item clickable ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>
                            <span className="stat-label">전체</span>
                            <span className="stat-value">{viewModels.length}</span>
                        </div>
                        <div {...keyboardAction} className={`stat-item clickable ${filterStatus === 'done' ? 'active' : ''}`} onClick={() => setFilterStatus('done')}>
                            <span className="stat-label done">분석완료</span>
                            <span className="stat-value green">{statusCount('done')}</span>
                        </div>
                        <div {...keyboardAction} className={`stat-item clickable ${filterStatus === 'analyzing' ? 'active' : ''}`} onClick={() => setFilterStatus('analyzing')}>
                            <span className="stat-label analyzing">임시저장</span>
                            <span className="stat-value orange">{statusCount('analyzing')}</span>
                        </div>
                    </div>
                    <div className="uh-header-actions">
                        <div className="uh-search-box">
                            <svg className="uh-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input 
                                type="text" 
                                placeholder="공고명 검색..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button className="uh-search-clear" onClick={() => setSearchQuery('')} title="검색어 지우기">✕</button>
                            )}
                        </div>
                        <select className="uh-sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                            <option value="latest">최신 분석순</option>
                            <option value="deadline">마감 임박순</option>
                            <option value="alphabetical">가나다순</option>
                        </select>
                    </div>
                </div>

                <div className="uh-list">
                    <AnimatePresence mode="popLayout">
                        {filtered.length === 0 && (
                            <motion.div key="empty" className="uh-empty-state" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                {viewModels.length === 0 ? (
                                    <>
                                        <p>아직 분석한 공고문이 없습니다. 공고문을 올리면 여기에 쌓입니다.</p>
                                        <button className="uh-reset-filter" onClick={() => navigate('/dashboard')}>공고문 올리러 가기</button>
                                    </>
                                ) : (
                                    <>
                                        <p>해당 상태의 내역이 없습니다.</p>
                                        <button className="uh-reset-filter" onClick={() => setFilterStatus('all')}>전체 내역 보기</button>
                                    </>
                                )}
                            </motion.div>
                        )}
                        {displayRows.map((row, idx) => row.kind === 'header' ? (
                                <motion.div
                                    key={row.key}
                                    className={`uh-group-header ${row.bucket}`}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                                >
                                    <span className="uh-group-label">{row.label}</span>
                                    <span className="uh-group-count">{row.count}</span>
                                    <span className="uh-group-line" />
                                </motion.div>
                            ) : ((file) => (
                                <motion.div
                                    key={file.id}
                                    className={`uh-card-premium ${file.status}`}
                                    layout
                                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                    transition={{ duration: 0.4, delay: idx * 0.03, ease: "easeOut" }}
                                    whileHover={{ y: -5, transition: { duration: 0.2 } }}
                                >
                                    <div className="uh-card-content">
                                        <div className="uh-card-meta-row">
                                            <div className="uh-meta-icon">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                                            </div>
                                            <div className="uh-meta-info">
                                                <div className="uh-filename-container">
                                                    <h4 className="uh-filename">{file.name}</h4>
                                                    <DeadlineCell file={file} onCommit={handleDeadlineCommit} />
                                                </div>
                                                <div className="uh-dot-divider"></div>
                                                <span className="uh-date-subtle">{file.date}</span>
                                            </div>
                                        </div>

                                        <div className="uh-card-footer">
                                            {/* 상태 배지·결과 태그(자격 조건 N건·핵심 정보 N건·압축률·분석 완료)는 2026-10-12 삭제 — 상태는 묶음 구분선·왼쪽 색 띠로 구분 */}
                                            <div className="uh-footer-right">
                                                <button 
                                                    className="btn-archive-round calendar" 
                                                    data-tooltip="캘린더에 추가"
                                                    aria-label="캘린더에 추가"
                                                    onClick={() => handleAddToCalendar(file)}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M12 14v4M10 16h4"></path></svg>
                                                </button>
                                                {/* 체크리스트에 담고 이동 — 공고문의 자격(D)·핵심 정보(I) 항목으로 체크 항목이 자동 생성된다. */}
                                                <button
                                                    className="btn-archive-round checklist"
                                                    data-tooltip="체크리스트로 이동"
                                                    aria-label="체크리스트로 이동"
                                                    onClick={() => { ensureChecklist(file.docId); navigate(`/applied?doc=${encodeURIComponent(file.docId)}`); }}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                                                </button>
                                                <button className="btn-archive-round trash" data-tooltip="문서 삭제" aria-label="문서 삭제" onClick={() => handleDelete(file.docId)}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                                <button className="btn-archive-report" onClick={() => navigate(`/workbench/${file.docId}`)}>
                                                    워크스페이스로 이동
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                        ))(row.file))}
                    </AnimatePresence>
                </div>
            </main>

            {/* Toast Overlay for Calendar Action */}
            <AnimatePresence>
                {toastMsg && (
                    <motion.div 
                        className="uh-toast"
                        initial={{ opacity: 0, y: 50, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: 20, x: '-50%' }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        {toastMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            <ConfirmDialog
                open={!!pendingDelete}
                title="문서를 삭제할까요?"
                message="분석 결과·원본 PDF·필기·캘린더 일정·체크리스트가 함께 지워지며 복구할 수 없습니다."
                confirmLabel="삭제"
                cancelLabel="취소"
                danger
                onConfirm={confirmDelete}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
}

export default UploadHistoryPage;
