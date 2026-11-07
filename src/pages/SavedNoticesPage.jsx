import { keyboardAction } from '../utils/keyboardAction';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import PersonaWidget from '../components/PersonaWidget';
import AuthModal from '../components/AuthModal';
import PolicyDetailModal from '../components/PolicyDetailModal';
import { listSaved, removeSaved } from '../store/savedStore';
import { addRecentlyViewed } from './RecentlyViewedPage';
import { formatTimeAgo } from '../utils/timeAgo';
import * as authStore from '../store/authStore';
import { afterLogout, afterLogin } from '../store/syncLayer';
import './SavedNoticesPage.css';

function SavedNoticesPage() {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    // 실데이터: 대시보드 추천에서 찜한 정책(savedStore, localStorage `clue_saved_policies`).
    const [savedNotices, setSavedNotices] = useState(() => listSaved());
    // 정책 상세 모달(P3-1).
    const [detailCard, setDetailCard] = useState(null);
    // 헤더 로그인/로그아웃(P3-6): 대시보드와 동일 연동.
    const [isAuthed, setIsAuthed] = useState(() => authStore.isLoggedIn());
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    useEffect(() => authStore.subscribe(() => setIsAuthed(authStore.isLoggedIn())), []);

    // 찜 해제 → 저장소에서 제거하고 목록 갱신.
    const handleUnsave = (id) => {
        removeSaved(id);
        setSavedNotices(listSaved());
    };

    // 카드 클릭(P3-1): 상세 모달 오픈 + 최근 본 기록(P3-5).
    const openDetail = (notice) => {
        addRecentlyViewed({ ...notice, dday: notice.deadline });
        setDetailCard(notice);
    };

    // "공고문 확인하기"(외부 열람): 최근 본 기록(P3-5) 후 신청 페이지 열기.
    const openApply = (notice) => {
        addRecentlyViewed({ ...notice, dday: notice.deadline });
        if (notice.link) window.open(notice.link, '_blank');
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
        setSavedNotices(listSaved());
    };

    const filteredNotices = savedNotices.filter(notice => {
        if (searchQuery.trim() === '') return true;
        const query = searchQuery.toLowerCase();
        return (
            notice.title.toLowerCase().includes(query) ||
            (notice.agency && notice.agency.toLowerCase().includes(query)) ||
            (notice.tags && notice.tags.some(tag => tag.toLowerCase().includes(query)))
        );
    });

    // Animation Variants for staggered entry
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 30, scale: 0.95 },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { duration: 0.5, ease: "easeOut" }
        }
    };

    return (
        <div className="sn-page-wrapper">
            {/* 1. Header (Matched to Dashboard) */}
            <header className="sn-header">
                <div className="sn-header-left">
                    <div {...keyboardAction} className="sn-logo cursor-pointer" onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center' }}>
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                    </div>
                </div>

                <div className="sn-header-right">
                    <PersonaWidget />
                    <button className="nav-btn primary" onClick={handleAuthClick}>{isAuthed ? '로그아웃' : '로그인'}</button>
                </div>
            </header>

            {/* Main Content Grid */}
            <main className="sn-main">
                {/* 2. Page Header & Title */}
                <div className="sn-page-header">
                    <div className="sn-title-group">
                        <div className="sn-title-row">
                            <h1>찜한 공고</h1>
                            <span className="sn-count-badge">{filteredNotices.length}</span>
                        </div>
                        <p>담아두신 소중한 공고들을 한눈에 확인하세요.</p>
                    </div>
                    <div className="sn-search-box">
                        <svg className="sn-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input 
                            type="text" 
                            placeholder="공고명, 기관, 태그 검색..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className="sn-search-clear" onClick={() => setSearchQuery('')} title="검색어 지우기">✕</button>
                        )}
                    </div>
                </div>

                <AnimatePresence mode="popLayout">
                    {filteredNotices.length > 0 ? (
                        <motion.div
                            className="sn-grid"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            key="grid"
                        >
                            {filteredNotices.map((notice) => {
                                return (
                                <motion.div
                                    key={notice.id}
                                    className="sn-card-premium"
                                    variants={cardVariants}
                                    whileHover={{ y: -6, transition: { duration: 0.2 } }}
                                    layout
                                >
                                    {/* Specular Reflection Effect */}
                                    <div className="sn-glass-shine"></div>

                                    {/* 마감 배지(빨간 날짜·회색 "마감됨")는 2026-10-12 삭제 → 찜한 시각 표시(최근 본 공고와 같은 형식). */}
                                    <div className="sn-card-header">
                                        <div className="sn-saved-time">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                            {formatTimeAgo(notice.savedAt)}
                                        </div>
                                    </div>

                                    <h3 {...keyboardAction} className="sn-card-title" style={{ cursor: 'pointer' }} onClick={() => openDetail(notice)}>{notice.title}</h3>
                                    <p className="sn-agency">{notice.agency}</p>

                                    <div className="sn-tag-group">
                                        {(notice.tags || []).map(tag => (
                                            <span key={tag} className="sn-tag">{tag}</span>
                                        ))}
                                    </div>

                                    <div className="sn-card-footer">
                                        <button
                                            className="sn-btn-primary"
                                            onClick={() => openApply(notice)}
                                        >
                                            공고문 확인하기
                                        </button>
                                        <button className="sn-btn-icon saved" title="찜 해제" onClick={() => handleUnsave(notice.id)}>
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                                        </button>
                                    </div>
                                </motion.div>
                                );
                            })}
                        </motion.div>
                    ) : (
                        <motion.div 
                            className="sn-empty-state" 
                            initial={{ opacity: 0, y: 10 }} 
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            key="empty"
                        >
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            {searchQuery.trim() ? (
                                <>
                                    <p>검색 결과에 맞는 저장된 공고가 없습니다.</p>
                                    <button className="sn-reset-filter" onClick={() => setSearchQuery('')}>전체 공고 보기</button>
                                </>
                            ) : (
                                <>
                                    <p>아직 찜한 공고가 없습니다.<br />추천 공고에서 마음에 드는 공고를 찜해보세요.</p>
                                    <button className="sn-reset-filter" onClick={() => navigate('/dashboard')}>추천 공고 보러가기</button>
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
                onAfterAction={() => setSavedNotices(listSaved())}
            />
        </div>
    );
}

export default SavedNoticesPage;
