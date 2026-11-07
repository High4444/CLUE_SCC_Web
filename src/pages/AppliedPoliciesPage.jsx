import { keyboardAction } from '../utils/keyboardAction';
import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '../assets/logo.png';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PersonaWidget from '../components/PersonaWidget';
import HeaderAuthButton from '../components/HeaderAuthButton';
import { listDocuments } from '../store/documentStore';
import {
    getChecklistState, setItemDone, setApplied,
    listManualEntries, saveManualEntry, deleteManualEntry,
} from '../store/checklistStore';
import { buildEntriesFromDocs } from '../utils/checklistAdapter';
import { withDemoAnalysis } from '../data/demo';
import './AppliedPoliciesPage.css';

const fmtDate = (s) => (s ? s.replace(/-/g, '.') : '');

const getResolvedUrl = (url) => {
    if (!url) return '';
    if (url.includes('youth.seoul.go.kr') || url === 'https://youth.seoul.go.kr') {
        return 'https://plus.gov.kr/portal/benefitV2/benefitTotalSrvcList/benefitSrvcDtl?svcSeq=1002457&bnefType=all&svcId=611000000127';
    }
    if (url === '복지로' || url.includes('bokjiro.go.kr')) {
        return 'https://plus.gov.kr/portal/benefitV2/benefitTotalSrvcList/benefitSrvcDtl?svcSeq=805494&bnefType=all&svcId=135200005013';
    }
    return url;
};

const EMPTY_FORM = { title: '', agency: '', appliedAt: '', deadline: '', amount: '', memo: '', isApplied: false, applyUrl: '', autoChecklist: true };

// 실데이터: (1) 검토완료 문서 파생 엔트리 + (2) 사용자가 직접 추가한 수동 내역(B5).
//  - 문서 파생: ACID I(제출·기한)/D(자격 확인) 항목 변환, 진행 상태는 clue_checklist에서 복원.
//  - 수동 내역: 엔트리 전체를 clue_manual_entries에서 복원(새로고침 생존).
function loadEntries() {
    return [
        ...buildEntriesFromDocs(listDocuments().map(withDemoAnalysis), getChecklistState),
        ...listManualEntries(),
    ];
}

function AppliedPoliciesPage() {
    const navigate = useNavigate();
    const [entries, setEntries] = useState(loadEntries);
    // 업로드 내역의 체크리스트 아이콘으로 들어오면(?doc=docId) 그 공고 카드로 스크롤하고 잠깐 강조한다.
    const [searchParams] = useSearchParams();
    const focusDocId = searchParams.get('doc');
    const [flashId, setFlashId] = useState(null);
    useEffect(() => {
        if (!focusDocId) return;
        const t1 = setTimeout(() => {
            const el = document.querySelector(`[data-entry-id="${CSS.escape(focusDocId)}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setFlashId(focusDocId);
        }, 400);
        const t2 = setTimeout(() => setFlashId(null), 2400);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [focusDocId]);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const [memoOpenId, setMemoOpenId] = useState(null);
    const [memoEditing, setMemoEditing] = useState(null);
    const [newItemTexts, setNewItemTexts] = useState({});
    const [toastMsg, setToastMsg] = useState('');

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(''), 2500);
    };

    const openAddModal = () => {
        setForm({ ...EMPTY_FORM, autoChecklist: true });
        setEditingId(null);
        setShowModal(true);
    };

    const openEditModal = (entry) => {
        setForm({
            title: entry.title,
            agency: entry.agency || '',
            appliedAt: entry.appliedAt || '',
            deadline: entry.deadline || '',
            amount: entry.amount || '',
            memo: entry.memo || '',
            isApplied: !!entry.isApplied,
            applyUrl: entry.applyUrl || '',
            autoChecklist: false
        });
        setEditingId(entry.id);
        setShowModal(true);
    };

    const handleSubmit = () => {
        if (!form.title.trim()) return;
        if (editingId) {
            const updatedFields = {
                title: form.title,
                agency: form.agency,
                appliedAt: form.appliedAt,
                deadline: form.deadline,
                amount: form.amount,
                memo: form.memo,
                isApplied: form.isApplied,
                applyUrl: form.applyUrl
            };
            setEntries(prev => prev.map(e => e.id === editingId ? { ...e, ...updatedFields } : e));
            // 수동 내역이면 변경 사항을 영속화(B5).
            const edited = entries.find(e => e.id === editingId);
            if (edited && edited.manual) saveManualEntry({ ...edited, ...updatedFields });
            showToast('내역이 수정되었습니다.');
        } else {
            const defaultChecklist = form.autoChecklist ? [
                { id: 1, label: '지원 자격 및 공고 요건 확인', done: false },
                { id: 2, label: '필요 제출 서류 준비', done: false },
                { id: 3, label: '외부 사이트 신청서 작성 및 접수', done: false },
                { id: 4, label: '신청 완료 확인 및 접수번호 기록', done: false }
            ] : [];
            const newEntry = {
                id: Date.now().toString(),
                title: form.title,
                agency: form.agency,
                appliedAt: form.appliedAt,
                deadline: form.deadline,
                amount: form.amount,
                memo: form.memo,
                isApplied: form.isApplied,
                applyUrl: form.applyUrl,
                manual: true,               // 수동 내역 표식(B5)
                checklistItems: defaultChecklist
            };
            setEntries(prev => [...prev, newEntry]);
            saveManualEntry(newEntry);      // 새로고침 생존
            showToast('새 내역이 추가되었습니다.');
        }
        setShowModal(false);
    };

    const handleDelete = (id) => {
        const target = entries.find(e => e.id === id);
        setEntries(prev => prev.filter(e => e.id !== id));
        if (target && target.manual) deleteManualEntry(id);
        showToast('내역이 삭제되었습니다.');
    };

    const toggleApplied = (id) => {
        setEntries(prev => prev.map(e => {
            if (e.id === id) {
                const nextApplied = !e.isApplied;
                const appliedAt = nextApplied ? (e.appliedAt || new Date().toISOString().split('T')[0]) : '';
                const updated = { ...e, isApplied: nextApplied, appliedAt };
                // 문서 파생 엔트리는 clue_checklist에, 수동 내역은 clue_manual_entries에 보존.
                if (e.fromDocument) setApplied(e.id, nextApplied, appliedAt);
                else if (e.manual) saveManualEntry(updated);
                return updated;
            }
            return e;
        }));
    };

    const toggleChecklistItem = (entryId, itemId) => {
        setEntries(prev => prev.map(e => {
            if (e.id !== entryId) return e;
            const nextItems = e.checklistItems.map(ci => ci.id === itemId ? { ...ci, done: !ci.done } : ci);
            const updated = { ...e, checklistItems: nextItems };
            // 문서 파생 엔트리의 체크 상태는 clue_checklist에, 수동 내역은 전체를 clue_manual_entries에 보존.
            if (e.fromDocument) {
                const changed = nextItems.find(ci => ci.id === itemId);
                setItemDone(entryId, itemId, changed ? changed.done : false);
            } else if (e.manual) {
                saveManualEntry(updated);
            }
            return updated;
        }));
    };

    const addChecklistItem = (entryId) => {
        const text = (newItemTexts[entryId] || '').trim();
        if (!text) return;
        setEntries(prev => prev.map(e => {
            if (e.id !== entryId) return e;
            const updated = { ...e, checklistItems: [...e.checklistItems, { id: Date.now(), label: text, done: false }] };
            if (e.manual) saveManualEntry(updated); // 수동 내역의 추가 체크항목 영속화(B5)
            return updated;
        }));
        setNewItemTexts(prev => ({ ...prev, [entryId]: '' }));
    };

    const removeChecklistItem = (entryId, itemId) => {
        setEntries(prev => prev.map(e => {
            if (e.id !== entryId) return e;
            const updated = { ...e, checklistItems: e.checklistItems.filter(ci => ci.id !== itemId) };
            if (e.manual) saveManualEntry(updated);
            return updated;
        }));
    };

    const filtered = useMemo(() => {
        let result = entries;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(d => d.title.toLowerCase().includes(q) || d.agency.toLowerCase().includes(q));
        }
        if (activeFilter === 'preparing') {
            result = result.filter(d => !d.isApplied);
        } else if (activeFilter === 'applied') {
            result = result.filter(d => d.isApplied);
        }
        return result;
    }, [entries, searchQuery, activeFilter]);

    return (
        <div className="ap-page-wrapper">
            {/* Header */}
            <header className="ap-header">
                <div className="ap-header-left">
                    <div {...keyboardAction} className="ap-logo" onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                    </div>
                </div>
                <div className="ap-header-right">
                    <PersonaWidget />
                    <HeaderAuthButton />
                </div>
            </header>

            <main className="ap-main">
                {/* Page Header */}
                <div className="ap-page-header">
                    <div className="ap-title-group">
                        <div className="ap-title-row">
                            <span className="ap-page-icon">📋</span>
                            <h1>체크리스트</h1>
                            <span className="ap-count-badge">{filtered.length}</span>
                        </div>
                        <p>검토완료한 공고가 자동으로 등록되고, 직접 추가할 수도 있어요. 준비물과 접수 단계를 체크리스트로 관리해 보세요.</p>
                    </div>
                    <div className="ap-header-actions">
                        <div className="ap-search-box">
                            <svg className="ap-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input type="text" placeholder="공고명, 기관 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                            {searchQuery && <button className="ap-search-clear" onClick={() => setSearchQuery('')}>✕</button>}
                        </div>
                        <button className="ap-add-btn" onClick={openAddModal}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            새 내역 추가
                        </button>
                    </div>
                </div>

                {/* Filter Tab Bar */}
                <div className="ap-summary-bar">
                    <div className="ap-stats-row">
                        <button
                            className={`ap-filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('all')}
                        >
                            전체 <span className="ap-tab-count">{entries.length}</span>
                        </button>
                        <button
                            className={`ap-filter-tab ${activeFilter === 'preparing' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('preparing')}
                        >
                            신청 준비 중 <span className="ap-tab-count">{entries.filter(e => !e.isApplied).length}</span>
                        </button>
                        <button
                            className={`ap-filter-tab ${activeFilter === 'applied' ? 'active' : ''}`}
                            onClick={() => setActiveFilter('applied')}
                        >
                            신청 완료 <span className="ap-tab-count">{entries.filter(e => e.isApplied).length}</span>
                        </button>
                    </div>
                </div>

                {/* Card List */}
                <AnimatePresence mode="popLayout">
                    {filtered.length > 0 ? (
                        <div className="ap-list">
                            {filtered.map((entry, idx) => {
                                const clItems = entry.checklistItems || [];
                                const doneCount = clItems.filter(c => c.done).length;
                                const totalCount = clItems.length;
                                const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
                                const isMemoOpen = memoOpenId === entry.id;

                                return (
                                    <motion.div
                                        key={entry.id}
                                        initial={{ opacity: 0, y: 18 }}
                                        animate={{ opacity: 1, y: 0, transition: { duration: 0.32, delay: idx * 0.04 } }}
                                        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
                                        layout
                                        className={`ap-card ${entry.isApplied ? 'applied-done' : ''} ${flashId === entry.id ? 'ap-card--flash' : ''}`}
                                        data-entry-id={entry.id}
                                    >
                                        <div className="ap-glass-shine" />
                                        <div className="ap-card-body">
                                            {/* Manual Application Checkbox */}
                                            <div className="ap-status-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                                                <div {...keyboardAction}
                                                    className="ap-status-toggle"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                                                    onClick={() => toggleApplied(entry.id)}
                                                >
                                                    <div
                                                        className="ap-checkbox-custom"
                                                        style={{
                                                            width: '18px',
                                                            height: '18px',
                                                            borderRadius: '4px',
                                                            border: '2px solid #CBD5E1',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            background: entry.isApplied ? '#3B82F6' : 'white',
                                                            borderColor: entry.isApplied ? '#3B82F6' : '#CBD5E1',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {entry.isApplied && (
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="20 6 9 17 4 12"></polyline>
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: '0.8125rem', fontWeight: '800', color: entry.isApplied ? '#3B82F6' : '#64748B' }}>
                                                        {entry.isApplied ? '신청 완료' : '신청 준비 중 (미신청)'}
                                                    </span>
                                                </div>
                                                {entry.isApplied && entry.appliedAt && (
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94A3B8' }}>
                                                        {fmtDate(entry.appliedAt)} 신청 완료
                                                    </span>
                                                )}
                                            </div>

                                            {/* Top */}
                                            <div className="ap-card-top">
                                                <div className="ap-card-title-area">
                                                    <h3 className="ap-card-title">{entry.title}</h3>
                                                    <p className="ap-card-agency">
                                                        {entry.agency && <>{entry.agency}</>}
                                                        {entry.deadline && <><span className="ap-dot-sep">•</span>마감 {fmtDate(entry.deadline)}</>}
                                                        {entry.amount && <><span className="ap-dot-sep">•</span><span className="ap-amount">{entry.amount}</span></>}
                                                        {entry.applyUrl && (() => {
                                                            const resolvedUrl = getResolvedUrl(entry.applyUrl);
                                                            const isLink = resolvedUrl.startsWith('http');
                                                            return (
                                                                <>
                                                                    <span className="ap-dot-sep">•</span>
                                                                    <span className="ap-apply-link-wrapper">
                                                                        신청처:{' '}
                                                                        {isLink ? (
                                                                            <a
                                                                                href={resolvedUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="ap-apply-link-anchor"
                                                                            >
                                                                                링크 바로가기 ↗
                                                                            </a>
                                                                        ) : (
                                                                            <span className="ap-apply-site-badge">{resolvedUrl}</span>
                                                                        )}
                                                                    </span>
                                                                </>
                                                            );
                                                        })()}
                                                    </p>
                                                </div>
                                                <div className="ap-card-right-actions">
                                                    <button className="ap-btn-icon" title="수정" onClick={() => openEditModal(entry)}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                    </button>
                                                    <button className="ap-btn-icon danger" title="삭제" onClick={() => handleDelete(entry.id)}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Checklist */}
                                            <div className="ap-cl-section">
                                                <div className="ap-cl-section-header">
                                                    <span className="ap-cl-section-title">체크리스트</span>
                                                    {totalCount > 0 && (
                                                        <div className="ap-cl-meta">
                                                            <span className="ap-cl-count">{doneCount}/{totalCount}</span>
                                                            <div className="ap-cl-bar-bg">
                                                                <div className="ap-cl-bar-fill" style={{
                                                                    width: `${pct}%`,
                                                                    background: pct === 100 ? 'linear-gradient(90deg,#60A5FA,#2563EB)' : 'linear-gradient(90deg,#93C5FD,#3B82F6)',
                                                                }} />
                                                            </div>
                                                            <span className="ap-cl-pct" style={{ color: pct === 100 ? '#2563EB' : '#3B82F6' }}>{pct}%</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {clItems.map(ci => (
                                                    <div key={ci.id} className={`ap-cl-item ${ci.done ? 'done' : ''}`}>
                                                        <div {...keyboardAction}
                                                            className="ap-cl-checkbox"
                                                            style={ci.done ? { background: '#3B82F6', borderColor: '#3B82F6' } : {}}
                                                            onClick={() => toggleChecklistItem(entry.id, ci.id)}
                                                        >
                                                            {ci.done && (
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <span {...keyboardAction} className="ap-cl-label" onClick={() => toggleChecklistItem(entry.id, ci.id)}>{ci.label}</span>
                                                        <button className="ap-cl-delete" onClick={() => removeChecklistItem(entry.id, ci.id)}>
                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                        </button>
                                                    </div>
                                                ))}

                                                <div className="ap-cl-add-row">
                                                    <input
                                                        className="ap-cl-add-input"
                                                        type="text"
                                                        placeholder="+ 할 일 추가..."
                                                        value={newItemTexts[entry.id] || ''}
                                                        onChange={e => setNewItemTexts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter') addChecklistItem(entry.id); }}
                                                    />
                                                    {(newItemTexts[entry.id] || '').trim() && (
                                                        <button className="ap-cl-add-confirm" onClick={() => addChecklistItem(entry.id)}>추가</button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Memo */}
                                            <div className="ap-memo-toggle-row">
                                                <button className="ap-memo-toggle-btn" onClick={() => setMemoOpenId(isMemoOpen ? null : entry.id)}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                    메모 {entry.memo ? <span className="ap-memo-dot" /> : ''}
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                                        style={{ transition: 'transform 0.25s', transform: isMemoOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                                        <polyline points="6 9 12 15 18 9"></polyline>
                                                    </svg>
                                                </button>
                                            </div>
                                            <AnimatePresence>
                                                {isMemoOpen && (
                                                    <motion.div
                                                        className="ap-memo-area"
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                                                    >
                                                        <div className="ap-memo-inner">
                                                            {memoEditing === entry.id ? (
                                                                <div className="ap-memo-edit-wrap">
                                                                    <textarea
                                                                        className="ap-memo-textarea"
                                                                        value={entry.memo}
                                                                        onChange={e => setEntries(prev => prev.map(en => en.id === entry.id ? { ...en, memo: e.target.value } : en))}
                                                                        placeholder="메모를 입력하세요..."
                                                                        autoFocus
                                                                        rows={3}
                                                                    />
                                                                    <button className="ap-memo-save-btn" onClick={() => { setMemoEditing(null); if (entry.manual) saveManualEntry(entry); showToast('메모가 저장되었습니다.'); }}>저장</button>
                                                                </div>
                                                            ) : (
                                                                <div className="ap-memo-view" onClick={() => setMemoEditing(entry.id)}>
                                                                    <p className="ap-memo-text">{entry.memo || '클릭해서 메모를 작성하세요.'}</p>
                                                                    <button className="ap-memo-edit-btn">수정</button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    ) : (
                        <motion.div className="ap-empty-state" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} key="empty">
                            <div className="ap-empty-icon">
                                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="12" y1="13" x2="12" y2="17"></line>
                                    <line x1="10" y1="15" x2="14" y2="15"></line>
                                </svg>
                            </div>
                            {searchQuery ? (
                                <>
                                    <p>검색 결과가 없어요.</p>
                                    <button className="ap-reset-btn" onClick={() => setSearchQuery('')}>전체 보기</button>
                                </>
                            ) : (
                                <>
                                    <p>검토완료한 공고가 아직 없어요.<br />공고문을 분석하고 검토완료하면 신청 체크리스트가 자동으로 만들어집니다.</p>
                                    <button className="ap-add-btn" style={{ marginTop: 8 }} onClick={openAddModal}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                        직접 내역 추가하기
                                    </button>
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Add / Edit Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div className="ap-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)}>
                        <motion.div
                            className="ap-modal"
                            initial={{ opacity: 0, y: 28, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 16, scale: 0.97 }}
                            transition={{ duration: 0.24, ease: 'easeOut' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="ap-modal-header">
                                <h2>{editingId ? '내역 수정' : '새 내역 추가'}</h2>
                                <button className="ap-modal-close" onClick={() => setShowModal(false)}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                            <div className="ap-modal-body">
                                <div className="ap-form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', userSelect: 'none' }}>
                                    <input
                                        type="checkbox"
                                        id="ap-is-applied-check"
                                        checked={form.isApplied}
                                        onChange={e => setForm(f => ({
                                            ...f,
                                            isApplied: e.target.checked,
                                            appliedAt: e.target.checked && !f.appliedAt ? new Date().toISOString().split('T')[0] : f.appliedAt
                                        }))}
                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    <label htmlFor="ap-is-applied-check" style={{ fontSize: '0.84375rem', fontWeight: '700', color: '#1E293B', cursor: 'pointer' }}>
                                        신청을 완료했습니다
                                    </label>
                                </div>

                                {editingId === null && (
                                    <div className="ap-form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', userSelect: 'none' }}>
                                        <input
                                            type="checkbox"
                                            id="ap-auto-checklist-check"
                                            checked={form.autoChecklist}
                                            onChange={e => setForm(f => ({ ...f, autoChecklist: e.target.checked }))}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <label htmlFor="ap-auto-checklist-check" style={{ fontSize: '0.84375rem', fontWeight: '700', color: '#1E293B', cursor: 'pointer' }}>
                                            기본 체크리스트 단계 자동 생성 (서류 준비, 신청 접수 등)
                                        </label>
                                    </div>
                                )}

                                <div className="ap-form-group">
                                    <label className="ap-form-label">공고명 <span className="ap-required">*</span></label>
                                    <input className="ap-form-input" type="text" placeholder="공고명을 입력하세요" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-form-label">기관명</label>
                                    <input className="ap-form-input" type="text" placeholder="예: 서울시, 보건복지부" value={form.agency} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))} />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-form-label">신청 사이트 / 링크</label>
                                    <input className="ap-form-input" type="text" placeholder="예: 정부24 또는 https://www.gov.kr" value={form.applyUrl} onChange={e => setForm(f => ({ ...f, applyUrl: e.target.value }))} />
                                </div>
                                <div className="ap-form-row-2">
                                    <div className="ap-form-group">
                                        <label className="ap-form-label">신청일</label>
                                        <input className="ap-form-input" type="date" value={form.appliedAt} onChange={e => setForm(f => ({ ...f, appliedAt: e.target.value }))} />
                                    </div>
                                    <div className="ap-form-group">
                                        <label className="ap-form-label">마감일</label>
                                        <input className="ap-form-input" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-form-label">지원 금액</label>
                                    <input className="ap-form-input" type="text" placeholder="예: 월 20만원, 최대 200만원" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                                </div>
                                <div className="ap-form-group">
                                    <label className="ap-form-label">메모</label>
                                    <textarea className="ap-form-textarea" placeholder="접수번호, 담당자 연락처, 주의사항 등" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={3} />
                                </div>
                            </div>
                            <div className="ap-modal-footer">
                                <button className="ap-modal-cancel" onClick={() => setShowModal(false)}>취소</button>
                                <button className="ap-modal-submit" onClick={handleSubmit} disabled={!form.title.trim()}>
                                    {editingId ? '수정 완료' : '추가하기'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {toastMsg && (
                    <motion.div className="ap-toast" initial={{ opacity: 0, y: 50, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        {toastMsg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default AppliedPoliciesPage;
