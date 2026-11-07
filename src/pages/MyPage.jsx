import { keyboardAction } from '../utils/keyboardAction';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AccountSettingsPage from './AccountSettingsPage';
import ServiceSettingsPage from './ServiceSettingsPage';
import SupportPage from './SupportPage';
import SubscriptionPage from './SubscriptionPage';
import { useNavigate, useParams } from 'react-router-dom';
import { getProfile } from '../store/profileStore';
import { getDisplayProfile } from '../utils/displayProfile';
import { listSaved } from '../store/savedStore';
import { listDocuments } from '../store/documentStore';
import * as authStore from '../store/authStore';
import { afterLogout } from '../store/syncLayer';
import ProfileEditModal from '../components/ProfileEditModal';
import './MyPage.css';

function MyPage() {
    const navigate = useNavigate();
    const { section } = useParams();
    // 내 조건 수정 창(2026-10-12) — 자가진단 페이지로 이동하지 않고 이 자리에서 수정. 저장하면 다시 그려 최신값 표시.
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [, setProfileVersion] = useState(0);
    // 프로필·실카운트(F4-d): 이름 하드코딩 제거, profileStore/store 기반.
    // 표시는 전량 표시 전용 셀렉터(D1)로 — 원시 필드 직접 접근 금지.
    const profile = getProfile();
    const dp = getDisplayProfile(profile);
    const hasProfile = dp.hasProfile;
    // 로그인 상태(F5-d): 계정 이메일 표시·로그아웃 실동작.
    const loggedIn = authStore.isLoggedIn();
    const accountEmail = authStore.getUser()?.email || '';

    const handleAuthButton = () => {
        if (loggedIn) {
            authStore.logout();   // 토큰 제거
            afterLogout();        // 계정 데이터 키 클리어 + 게스트 백업 복원
        }
        navigate('/');            // 로그아웃/로그인 유도 모두 랜딩으로
    };
    const savedCount = listSaved().length;
    const docs = listDocuments();
    const analyzedCount = docs.length;
    const completedCount = docs.filter(d => d.status === 'completed').length;
    // URL 세그먼트 → 기존 subView 값으로 매핑 (화면 분기 동일)
    const subView = section === 'account' ? 'account_settings'
        : section === 'service' ? 'service_settings'
        : section === 'support' ? 'support'
        : section === 'subscription' ? 'subscription'
        : 'my_page';
    const [activeCategory, setActiveCategory] = useState('profile');
    const scrollContainerRef = useRef(null);

    const categories = [
        { id: 'profile', label: '내 프로필', icon: '👤' },
        { id: 'diagnosis', label: '나의 진단 정보', icon: '📍' },
        { id: 'account', label: '계정 설정', icon: '🔒' },
        { id: 'service', label: '서비스 설정', icon: '🔔' },
        { id: 'billing', label: '구독 및 결제', icon: '💳' },
        { id: 'support', label: '고객지원', icon: '💬' },
    ];

    const menuData = {
        account: [
            { label: '이메일 정보', icon: '📧' },
            { label: '비밀번호 변경', icon: '🔑' },
        ],
        service: [
            { label: '알림 설정', icon: '📢' },
            { label: '마케팅 정보 활용 동의', icon: '📩' },
            { label: '내 진단 기록 관리', icon: '📑' },
        ],
        support: [
            { label: '1:1 문의하기', icon: '✍️' },
            { label: '자주 묻는 질문 (FAQ)', icon: '❓' },
            { label: '서비스 이용약관', icon: '📄' },
        ]
    };

    // 진단 정보 4행: 나이/거주/상태/가구원. 값 없으면 "미설정"(수정은 아래 "내 조건 수정하기" 창).
    const myDiagnosis = hasProfile ? [
        { label: '나이', value: dp.age || '미설정' },
        { label: '거주', value: dp.region || '미설정' },
        { label: '상태', value: dp.status || '미설정' },
        { label: '가구원', value: dp.household || '미설정' },
        // 학력·관심분야·소득은 2026-10-12 표시에서 제외(수정 창에서도 받지 않음)
    ] : [];

    // Scroll to section handler
    const scrollToSection = (id) => {
        if (subView !== 'my_page') {
            navigate('/my');
            // Wait for re-render and animation start
            setTimeout(() => {
                const element = document.getElementById(`section-${id}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
            return;
        }
        const element = document.getElementById(`section-${id}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Intersection Observer to track active section
    useEffect(() => {
        let observer;
        
        // Use a small timeout to ensure DOM sections are mounted after subView change
        const timer = setTimeout(() => {
            const observerOptions = {
                root: scrollContainerRef.current,
                rootMargin: '-10% 0px -70% 0px', // More sensitive to top area
                threshold: 0
            };

            const observerCallback = (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.id.replace('section-', '');
                        setActiveCategory(id);
                    }
                });
            };

            observer = new IntersectionObserver(observerCallback, observerOptions);
            
            categories.forEach((cat) => {
                const element = document.getElementById(`section-${cat.id}`);
                if (element) observer.observe(element);
            });
        }, 150); // Delay for AnimatePresence transition

        return () => {
            clearTimeout(timer);
            if (observer) observer.disconnect();
        };
    }, [subView]);

    // Reset scroll when entering detail subView, maintain position when returning to main list
    useEffect(() => {
        if (scrollContainerRef.current && subView !== 'my_page') {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [subView]);

    return (
        <div className="mp-wrapper">
            <header className="mp-header">
                <div className="mp-h-left">
                    <button className="mp-back-btn" onClick={() => navigate(subView === 'my_page' ? '/dashboard' : '/my')}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <h2 className="mp-title">
                        {subView === 'my_page' && '마이페이지'}
                        {subView === 'account_settings' && '계정 설정'}
                        {subView === 'service_settings' && '서비스 설정'}
                        {subView === 'support' && '고객지원'}
                        {subView === 'subscription' && '구독 및 결제 관리'}
                    </h2>
                </div>
                <div className="mp-h-right">
                    <button className="mp-logout-btn" onClick={handleAuthButton}>{loggedIn ? '로그아웃' : '로그인'}</button>
                </div>
            </header>
            <div className="mp-container">
                {/* Sidebar Navigation (Anchor) */}
                <aside className="mp-sidebar">
                    <div className="mp-side-list">
                        {categories.map((cat) => (
                            <div {...keyboardAction}
                                key={cat.id} 
                                className={`mp-side-item ${activeCategory === cat.id ? 'active' : ''}`}
                                onClick={() => scrollToSection(cat.id)}
                            >
                                <span className="mp-side-icon">{cat.icon}</span>
                                <span className="mp-side-label">&nbsp;{cat.label}</span>
                                {activeCategory === cat.id && <motion.div layoutId="active-bar" className="mp-active-bar" />}
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="mp-content-area" ref={scrollContainerRef}>
                    <div className="mp-content-inner">
                        <AnimatePresence mode="wait">
                            {subView === 'my_page' ? (
                                <motion.div 
                                    key="main-list"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    transition={{ duration: 0.4, ease: "easeOut" }}
                                >
                                    {/* 1. Profile Section */}
                                    <section id="section-profile" className="mp-section">
                                        <h3 className="mp-sec-title">내 프로필</h3>
                                        <div className="mp-profile-card">
                                            <div className="mp-profile-bg"></div>
                                            <div className="mp-profile-content">
                                                <div className="mp-avatar-container">
                                                    <div className="mp-avatar-large">나</div>
                                                </div>
                                                <div className="mp-user-info">
                                                    <div className="mp-name-row">
                                                        <h3>나의 프로필</h3>
                                                        {/* 진단 완료 배지 2단계(D6): basic="기본 설정 완료" / full="정밀 진단 완료" / none="진단 전" */}
                                                        <span className="mp-status-pill">{dp.completionLabel}</span>
                                                    </div>
                                                    <p>{loggedIn ? accountEmail : (
                                                        dp.tier === 'full' ? '내 조건으로 설정한 맞춤 프로필'
                                                        : dp.tier === 'basic' ? '기본 설정으로 시작한 프로필'
                                                        : '아직 진단 정보가 없습니다')}</p>
                                                    <div className="mp-user-tags">
                                                        <span className="mp-tag-blue">{dp.completionLabel}</span>
                                                        <span className="mp-tag-gray">{hasProfile ? (dp.region || '지역 미설정') : '조건 미설정'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mp-profile-stats">
                                                <div className="mp-stat-item">
                                                    <span className="mp-stat-val">{analyzedCount}</span>
                                                    <span className="mp-stat-label">분석 문서</span>
                                                </div>
                                                <div className="mp-stat-divider" />
                                                <div className="mp-stat-item">
                                                    <span className="mp-stat-val">{savedCount}</span>
                                                    <span className="mp-stat-label">찜한 공고</span>
                                                </div>
                                                <div className="mp-stat-divider" />
                                                <div className="mp-stat-item">
                                                    <span className="mp-stat-val">{completedCount}</span>
                                                    <span className="mp-stat-label">검토 완료</span>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <div className="mp-divider" />

                                    {/* 2. Diagnosis Section */}
                                    <section id="section-diagnosis" className="mp-section">
                                        <h3 className="mp-sec-title">나의 진단 정보</h3>
                                        <div className="mp-diagnosis-card">
                                            <div className="mp-diagnosis-grid">
                                                {myDiagnosis.length > 0 ? myDiagnosis.map((item, idx) => (
                                                    <div key={idx} className="mp-diag-item">
                                                        <span className="mp-diag-label">{item.label}</span>
                                                        <span className="mp-diag-val">{item.value}</span>
                                                    </div>
                                                )) : (
                                                    <div className="mp-diag-item">
                                                        <span className="mp-diag-label">안내</span>
                                                        <span className="mp-diag-val">조건 미설정</span>
                                                    </div>
                                                )}
                                            </div>
                                            <button className="mp-diag-edit-btn" onClick={() => setIsEditOpen(true)}>
                                                {hasProfile ? '내 조건 수정하기' : '내 조건 입력하기'}
                                            </button>
                                        </div>
                                        <p className="mp-diag-tip">💡 진단 정보를 수정하면 나에게 맞는 공고 리스트가 자동으로 업데이트됩니다.</p>
                                    </section>

                                    <div className="mp-divider" />

                                    {/* 3. Account Settings */}
                                    <section id="section-account" className="mp-section">
                                        <h3 className="mp-sec-title">계정 설정</h3>
                                        <div className="mp-menu-list">
                                            {menuData.account.map((item, idx) => (
                                                <motion.div 
                                                    key={idx} 
                                                    className="mp-menu-item" 
                                                    onClick={() => navigate('/my/account')}
                                                    whileHover={{ x: 6 }}
                                                    transition={{ type: "spring", stiffness: 300 }}
                                                >
                                                    <div className="mp-menu-left">
                                                        <span className="mp-icon-box">{item.icon}</span>
                                                        <span className="mp-menu-label">&nbsp;&nbsp;{item.label}</span>
                                                    </div>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </section>

                                    <div className="mp-divider" />

                                    {/* 4. Service Settings */}
                                    <section id="section-service" className="mp-section">
                                        <h3 className="mp-sec-title">서비스 설정</h3>
                                        <div className="mp-menu-list">
                                            {menuData.service.map((item, idx) => (
                                                <motion.div 
                                                    key={idx} 
                                                    className="mp-menu-item" 
                                                    onClick={() => navigate('/my/service')}
                                                    whileHover={{ x: 6 }}
                                                    transition={{ type: "spring", stiffness: 300 }}
                                                >
                                                    <div className="mp-menu-left">
                                                        <span className="mp-icon-box">{item.icon}</span>
                                                        <span className="mp-menu-label">&nbsp;&nbsp;{item.label}</span>
                                                    </div>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </section>

                                    <div className="mp-divider" />

                                    {/* 5. Billing & Subscription Section
                                        P4-1: 허위 PREMIUM 미리보기(결제일·₩19,900)를 제거하고 "결제 기능 준비 중" 안내로 축소.
                                        삭제가 아니라 보류 — 복원 로드맵: docs/plans/PAYMENT_LATER.md. */}
                                    <section id="section-billing" className="mp-section">
                                        <h3 className="mp-sec-title">구독 및 결제</h3>
                                        <motion.div
                                            className="mp-diagnosis-card billing-preview"
                                            onClick={() => navigate('/my/subscription')}
                                            whileHover={{ scale: 1.01 }}
                                        >
                                            <div className="mp-billing-soon">
                                                <span className="mp-billing-soon-title">💳 결제 기능 준비 중</span>
                                                <span className="mp-billing-soon-desc">유료 구독·결제 기능을 준비하고 있어요. 지금은 모든 기능을 무료로 이용하실 수 있습니다.</span>
                                            </div>
                                        </motion.div>
                                    </section>

                                    <div className="mp-divider" />

                                    {/* 6. Support Section */}
                                    <section id="section-support" className="mp-section">
                                        <h3 className="mp-sec-title">고객지원</h3>
                                        <div className="mp-menu-list">
                                            {menuData.support.map((item, idx) => (
                                                <motion.div 
                                                    key={idx} 
                                                    className="mp-menu-item" 
                                                    onClick={() => navigate('/my/support')}
                                                    whileHover={{ x: 6 }}
                                                    transition={{ type: "spring", stiffness: 300 }}
                                                >
                                                    <div className="mp-menu-left">
                                                        <span className="mp-icon-box">{item.icon}</span>
                                                        <span className="mp-menu-label">&nbsp;&nbsp;{item.label}</span>
                                                    </div>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </section>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="sub-view"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}
                                    className="mp-subview-container"
                                >
                                    {subView === 'account_settings' && <AccountSettingsPage />}
                                    {subView === 'service_settings' && <ServiceSettingsPage />}
                                    {subView === 'support' && <SupportPage />}
                                    {subView === 'subscription' && <SubscriptionPage />}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </main>
            </div>

            <ProfileEditModal
                open={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                onSaved={() => setProfileVersion((v) => v + 1)}
            />
        </div>
    );
}

export default MyPage;
