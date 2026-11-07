import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Outlet, Navigate, useLocation, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import StartPage from './pages/StartPage';
import DashboardPage from './pages/DashboardPage';
import WorkbenchPage from './pages/WorkbenchPage';
import WorkbenchRecruitmentPage from './pages/WorkbenchRecruitmentPage';
import ChatPage from './pages/ChatPage';
import UploadHistoryPage from './pages/UploadHistoryPage';
import SavedNoticesPage from './pages/SavedNoticesPage';
import RecentlyViewedPage from './pages/RecentlyViewedPage';
import AppliedPoliciesPage from './pages/AppliedPoliciesPage';
import CalendarPage from './pages/CalendarPage';
import SelfDiagnosisPage from './pages/SelfDiagnosisPage';
import MyPage from './pages/MyPage';
import PolicyComparePage from './pages/PolicyComparePage';
import { AnalysisProvider } from './contexts/AnalysisContext';
import './index.css';
import Sidebar from './components/Sidebar';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import ErrorBoundary from './components/ErrorBoundary';
import { isLoggedIn } from './store/authStore';
import { pullDown } from './store/syncLayer';

// 페이지 전환 애니메이션 래퍼 (기존 App.jsx의 motion.div 그대로)
const pageMotionProps = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2 },
    style: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', width: '100%' },
};

// 사이드바 + 헤더가 있는 대시보드 계열 레이아웃
function AppLayout({ openChat }) {
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    return (
        <div className="app-container with-sidebar-content">
            <Sidebar
                isOpen={isSidebarOpen}
                onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            />
            <AnimatePresence mode="wait">
                <motion.div key={location.pathname} {...pageMotionProps}>
                    <Outlet context={{ openChat }} />
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

// 워크벤치 라우트 래퍼: docId를 key로 부여해 문서 전환(파일 교체 등) 시 강제 리마운트.
// (A1) 리마운트가 없으면 RightPanel 퀴즈 상태·CenterPanel 필기가 새 문서에 잔존한다.
function WorkbenchRoute() {
    const { docId } = useParams();
    return <WorkbenchPage key={docId || 'demo'} />;
}

// 워크벤치 전체화면 레이아웃
function FullscreenLayout() {
    const location = useLocation();
    return (
        <div className="app-fixed">
            <AnimatePresence mode="wait">
                <motion.div key={location.pathname} {...pageMotionProps}>
                    <Outlet />
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

function App() {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const toggleChat = () => setIsChatOpen(v => !v);

    // 앱 시작 시 토큰 있으면 서버 → localStorage 백그라운드 풀다운 1회(캐시 갱신).
    useEffect(() => {
        if (isLoggedIn()) pullDown().catch(() => {});
    }, []);

    return (
        <AnalysisProvider>
            <HashRouter>
                <AccessibilityProvider>
                    <Routes>
                        {/* 레이아웃 없는 랜딩 */}
                        <Route path="/" element={<StartPage />} />

                        {/* 워크벤치 전체화면 (정적 세그먼트 recruitment 우선) */}
                        <Route element={<FullscreenLayout />}>
                            <Route path="/workbench" element={<WorkbenchRoute />} />
                            <Route path="/workbench/recruitment" element={<WorkbenchRecruitmentPage />} />
                            <Route path="/workbench/:docId" element={<WorkbenchRoute />} />
                        </Route>

                        {/* 사이드바 + 헤더 계열 */}
                        <Route element={<AppLayout openChat={toggleChat} />}>
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/history" element={<UploadHistoryPage />} />
                            <Route path="/saved" element={<SavedNoticesPage />} />
                            <Route path="/recent" element={<RecentlyViewedPage />} />
                            <Route path="/applied" element={<AppliedPoliciesPage />} />
                            <Route path="/calendar" element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
                            <Route path="/compare" element={<PolicyComparePage />} />
                            <Route path="/diagnosis" element={<SelfDiagnosisPage />} />
                            <Route path="/my" element={<MyPage />} />
                            <Route path="/my/:section" element={<MyPage />} />
                        </Route>

                        {/* 미매칭 → 대시보드 */}
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>

                    {/* Global Chat Popup Overlay (URL 아님, 전역 상태 유지) */}
                    {isChatOpen && (
                        <div style={{ position: 'fixed', bottom: '40px', left: '40px', zIndex: 10000 }}>
                            <ChatPage onClose={() => setIsChatOpen(false)} />
                        </div>
                    )}
                            </AccessibilityProvider>
            </HashRouter>
        </AnalysisProvider>
    );
}

export default App;
