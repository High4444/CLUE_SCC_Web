import { keyboardAction } from '../utils/keyboardAction';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import PersonaWidget from '../components/PersonaWidget';
import AuthModal from '../components/AuthModal';
import PolicyDetailModal from '../components/PolicyDetailModal';
import { formatTimeAgo } from '../utils/timeAgo';
import * as authStore from '../store/authStore';
import { afterLogout, afterLogin } from '../store/syncLayer';
import './RecentlyViewedPage.css';

// 로컬스토리지 키
const STORAGE_KEY = 'clue_recently_viewed';

// 최근 본 공고 불러오기 (앱 전체에서 사용할 수 있도록 export)
export function getRecentlyViewed() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

// 정책 조회 기록 저장 (최대 20개, 중복 제거)
export function addRecentlyViewed(policy) {
    try {
        const current = getRecentlyViewed();
        // 중복 제거
        const filtered = current.filter(p => p.id !== policy.id);
        // 맨 앞에 추가 (가장 최근 것이 위에)
        const updated = [
            { ...policy, viewedAt: new Date().toISOString() },
            ...filtered,
        ].slice(0, 20); // 최대 20개
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
        // 저장 실패 시 무시
    }
}

// 모두 삭제
export function clearRecentlyViewed() {
    localStorage.removeItem(STORAGE_KEY);
}

// 개별 삭제
export function removeRecentlyViewed(id) {
    try {
        const current = getRecentlyViewed();
        const updated = current.filter(p => p.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
}

function RecentlyViewedPage() {
    const navigate = useNavigate();
    const [recentList, setRecentList] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    // 정책 상세 모달(P3-1).
    const [detailCard, setDetailCard] = useState(null);
    // 헤더 로그인/로그아웃(P3-6).
    const [isAuthed, setIsAuthed] = useState(() => authStore.isLoggedIn());
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    // 마운트 시 로컬스토리지에서 불러오기
    useEffect(() => {
        setRecentList(getRecentlyViewed());
    }, []);

    useEffect(() => authStore.subscribe(() => setIsAuthed(authStore.isLoggedIn())), []);

    // 카드 클릭(P3-1): 상세 모달 오픈 + 최근 본 갱신(재열람 → 최상단 bump, P3-5).
    const openDetail = (notice) => {
        addRecentlyViewed({ ...notice });
        setDetailCard(notice);
        setRecentList(getRecentlyViewed());
    };

    // "공고문 보기"(외부 열람): 재열람 기록 후 신청 페이지 열기(P3-5).
    const openApply = (notice) => {
        const url = notice.link || `https://www.gov.kr/portal/main?srchTxt=${encodeURIComponent(notice.title)}`;
        addRecentlyViewed({ ...notice });
        setRecentList(getRecentlyViewed());
        window.open(url, '_blank');
    };

    // 헤더 로그인/로그아웃(P3-6).
    const handleAuthClick = () => {
        if (isAuthed) {
            authStore.logout();
            afterLogout();
            navigate('/');
        } else {
            setIsAuthModalOpen(true);
        }
    };
    const handleAuthSuccess = async () => {
        await afterLogin();
        setRecentList(getRecentlyViewed());
    };

    const handleRemove = (id) => {
        removeRecentlyViewed(id);
        setRecentList(prev => prev.filter(p => p.id !== id));
    };

    const handleClearAll = () => {
        clearRecentlyViewed();
        setRecentList([]);
        setShowClearConfirm(false);
    };

    const filtered = recentList.filter(notice => {
        if (searchQuery.trim() === '') return true;
        const q = searchQuery.toLowerCase();
        return (
            notice.title?.toLowerCase().includes(q) ||
            notice.agency?.toLowerCase().includes(q) ||
            notice.tags?.some(t => t.toLowerCase().includes(q))
        );
    });

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
    };
    const cardVariants = {
        hidden: { opacity: 0, y: 24, scale: 0.97 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } },
    };

    return (
        <div className="rv-page-wrapper">
            {/* Header */}
            <header className="rv-header">
                <div className="rv-header-left">
                    <div {...keyboardAction} className="rv-logo cursor-pointer" onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center' }}>
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                    </div>
                </div>
                <div className="rv-header-right">
                    <PersonaWidget />
                    <button className="nav-btn primary" onClick={handleAuthClick}>{isAuthed ? '로그아웃' : '로그인'}</button>
                </div>
            </header>

            <main className="rv-main">
                {/* Page Header */}
                <div className="rv-page-header">
                    <div className="rv-title-group">
                        <div className="rv-title-row">
                            <span className="rv-page-icon">👁️</span>
                            <h1>최근 본 공고</h1>
                            <span className="rv-count-badge">{filtered.length}</span>
                        </div>
                        <p>최근에 확인한 정책들을 다시 살펴보세요. 저장을 깜빡했어도 괜찮아요.</p>
                    </div>

                    <div className="rv-header-actions">
                        <div className="rv-search-box">
                            <svg className="rv-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input
                                type="text"
                                placeholder="공고명, 기관, 태그 검색..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button className="rv-search-clear" onClick={() => setSearchQuery('')}>✕</button>
                            )}
                        </div>

                        {recentList.length > 0 && (
                            <button className="rv-clear-btn" onClick={() => setShowClearConfirm(true)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
                                전체 삭제
                            </button>
                        )}
                    </div>
                </div>

                {/* Clear Confirm Toast */}
                <AnimatePresence>
                    {showClearConfirm && (
                        <motion.div
                            className="rv-confirm-toast"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <span>최근 본 목록을 모두 지울까요?</span>
                            <div className="rv-confirm-actions">
                                <button className="rv-confirm-yes" onClick={handleClearAll}>삭제</button>
                                <button className="rv-confirm-no" onClick={() => setShowClearConfirm(false)}>취소</button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Content */}
                <AnimatePresence mode="popLayout">
                    {filtered.length > 0 ? (
                        <motion.div
                            className="rv-list"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            key="list"
                        >
                            {filtered.map((notice) => {
                                return (
                                <motion.div
                                    key={notice.id}
                                    className="rv-card"
                                    variants={cardVariants}
                                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                                    layout
                                >
                                    {/* Shine */}
                                    <div className="rv-glass-shine"></div>

                                    {/* Viewed time badge */}
                                    <div className="rv-viewed-time">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                        {formatTimeAgo(notice.viewedAt)}
                                    </div>

                                    <div className="rv-card-inner">
                                        <div className="rv-card-left">
                                            {/* 마감 배지(빨간 날짜·회색 "마감됨")는 2026-10-12 전부 삭제. */}

                                            <h3 {...keyboardAction} className="rv-card-title" style={{ cursor: 'pointer' }} onClick={() => openDetail(notice)}>{notice.title}</h3>
                                            <p className="rv-card-agency">{notice.agency}</p>

                                            {notice.tags && notice.tags.length > 0 && (
                                                <div className="rv-tag-group">
                                                    {notice.tags.map(tag => (
                                                        <span key={tag} className="rv-tag">{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="rv-card-actions">
                                            <button
                                                className="rv-btn-primary"
                                                onClick={() => openApply(notice)}
                                            >
                                                공고문 보기
                                            </button>
                                            <button
                                                className="rv-btn-remove"
                                                title="목록에서 제거"
                                                onClick={() => handleRemove(notice.id)}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                                );
                            })}
                        </motion.div>
                    ) : (
                        <motion.div
                            className="rv-empty-state"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            key="empty"
                        >
                            <div className="rv-empty-icon">
                                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </div>
                            {searchQuery ? (
                                <>
                                    <p>검색 결과에 맞는 최근 본 공고가 없습니다.</p>
                                    <button className="rv-reset-btn" onClick={() => setSearchQuery('')}>전체 보기</button>
                                </>
                            ) : (
                                <>
                                    <p>아직 조회한 정책이 없어요.</p>
                                    <span className="rv-empty-sub">대시보드에서 정책을 클릭하면 여기에 자동으로 기록됩니다.</span>
                                    <button className="rv-reset-btn" onClick={() => navigate('/dashboard')}>대시보드로 가기</button>
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onSuccess={handleAuthSuccess}
                initialMode="login"
            />

            <PolicyDetailModal
                isOpen={!!detailCard}
                plcyNo={detailCard?.id}
                fallbackCard={detailCard}
                onClose={() => setDetailCard(null)}
                onAfterAction={() => setRecentList(getRecentlyViewed())}
            />
        </div>
    );
}

export default RecentlyViewedPage;
