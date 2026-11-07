import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';
import { ViewSettingsButton, MagnifierButton } from '../contexts/AccessibilityContext';

const Sidebar = ({ isOpen, onToggle }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const menuItems = [
        { id: 'dashboard', label: '홈', icon: '🏠', path: '/dashboard' },
        { id: 'upload_history', label: '업로드 내역', icon: '📂', path: '/history' },
        { id: 'saved_notices', label: '찜한 공고', icon: '📑', path: '/saved' },
        { id: 'applied_policies', label: '체크리스트', icon: '📋', path: '/applied' },
        { id: 'calendar', label: '정책 캘린더', icon: '📅', path: '/calendar' },
        { id: 'policy_compare', label: '정책 비교', icon: '🔀', path: '/compare' },
        { id: 'recently_viewed', label: '최근 본 공고', icon: '👁️', path: '/recent' },
    ];
    const currentRoute = menuItems.find((m) => m.path === location.pathname)?.id;


    return (
        <div className="clue-sidebar-wrapper">
            <div className="clue-sidebar-pill">
                {isOpen && menuItems.map((item) => (
                    <button type="button"
                        key={item.id}
                        aria-current={currentRoute === item.id ? 'page' : undefined}
                        className={`sidebar-nav-item ${currentRoute === item.id ? 'active' : ''}`}
                        onClick={() => navigate(item.path)}
                    >
                        <div className="nav-icon">{item.icon}</div>
                        <div className="nav-text">{item.label}</div>

                        {/* 럭셔리 활성화 흐름 애니메이션 (선택 시 부드럽게 나타남) */}
                        {currentRoute === item.id && (
                            <motion.div
                                layoutId="sidebar-active-pill"
                                className="sidebar-active-indicator"
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: '100%',
                                    background: 'rgba(59, 130, 246, 0.05)',
                                    zIndex: -1
                                }}
                                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                            />
                        )}
                    </button>
                ))}

                {/* 하단 닫기/열기 버튼 (이미지와 동일하게 구현) */}
                <button type="button" className="sidebar-footer-btn" onClick={onToggle} aria-expanded={isOpen} aria-label={isOpen ? '사이드바 접기' : '사이드바 펼치기'}>
                    <span>{isOpen ? '닫기' : '열기'}</span>
                    {isOpen ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    )}
                </button>
            </div>
            <div className="clue-view-below-menu"><ViewSettingsButton /><MagnifierButton /></div>
        </div>
    );
};

export default Sidebar;
