import { keyboardAction } from '../utils/keyboardAction';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useScroll } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import logoImg from '../assets/logo.png';
import { getProfile, saveProfile } from '../store/profileStore';
import { normalizeProfileFromTags, regionsToZipCds, deriveRegions, LCLSF } from '../utils/profileFilters';
import { getPolicies } from '../api/client';
import { countEligible } from '../utils/verdictEngine';
import { afterLogin, afterLogout } from '../store/syncLayer';
import * as authStore from '../store/authStore';
import AuthModal from '../components/AuthModal';

// 즉시 결과(모달) 집계 설정 — 지역 기준 정책 샘플 상한과 분야(lclsfNm) 소계 대상.
// SelfDiagnosisPage 게이지와 동일 패턴(지역 zipCd 샘플 → 클라이언트 분야 분류 → verdict 집계).
const INSTANT_SAMPLE_SIZE = 100;
const INSTANT_LCLSF_FIELDS = [LCLSF.JOB, LCLSF.EDU, LCLSF.WELFARE, LCLSF.HOUSING, LCLSF.PARTICIPATION];

const StartPage = () => {
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    // 헤더 로그인/로그아웃 상태(authStore 구독으로 라벨 즉시 갱신, P4-3).
    const [isAuthed, setIsAuthed] = useState(() => authStore.isLoggedIn());
    const [selectedTags, setSelectedTags] = useState([]); // No default tags selected
    const [showScrollTop, setShowScrollTop] = useState(false);
    // 진단 모달 단계: 'select'(태그 선택) | 'loading'(집계 중) | 'result'(즉시 결과 뷰).
    const [modalStage, setModalStage] = useState('select');
    const [resultAgg, setResultAgg] = useState(null); // { total, breakdown:[{label,eligible}] }

    const resetModal = () => { setModalStage('select'); setResultAgg(null); };
    const closeModal = () => { setIsModalOpen(false); resetModal(); };

    // 선택 태그 → 프로필 저장(기존 계약) → 지역 샘플 실집계 → 결과 뷰 전환.
    // 프로필 저장은 결과 뷰 표시와 무관하게 항상 수행한다.
    // :3002 미기동/에러/무데이터/집계 0건 → 결과 뷰 생략하고 기존처럼 대시보드로(온보딩 차단 금지).
    const runInstantDiagnosis = async () => {
        const existing = getProfile() || {};
        const merged = normalizeProfileFromTags(existing, selectedTags);
        const profile = { ...merged, interests: selectedTags };
        saveProfile(profile); // 저장은 항상(결과 뷰 표시 여부와 무관).

        setModalStage('loading');
        try {
            const zips = regionsToZipCds(deriveRegions(merged));
            const zip = zips[0] || '';
            const base = { pageNum: 1, pageSize: INSTANT_SAMPLE_SIZE, rtnType: 'json' };
            // 1) 지역(zipCd) 샘플. 2) 0건이면 무필터로 재조회(빈 집계 방지, SelfDiagnosisPage와 동일).
            let res = await getPolicies(zip ? { ...base, zipCd: zip } : base);
            let policies = Array.isArray(res?.policies) ? res.policies : [];
            if (policies.length === 0 && zip) {
                res = await getPolicies(base);
                policies = Array.isArray(res?.policies) ? res.policies : [];
            }
            if (policies.length === 0) { closeModal(); navigate('/dashboard'); return; }

            const total = countEligible(policies, profile, null).eligible;
            if (total === 0) { closeModal(); navigate('/dashboard'); return; }

            const breakdown = INSTANT_LCLSF_FIELDS
                .map((label) => ({ label, eligible: countEligible(policies, profile, label).eligible }))
                .filter((b) => b.eligible > 0)
                .sort((a, b) => b.eligible - a.eligible)
                .slice(0, 3);
            setResultAgg({ total, breakdown });
            setModalStage('result');
        } catch {
            closeModal();
            navigate('/dashboard');
        }
    };

    // 로그인/가입 성공 공통 후처리: 게스트 데이터 병합(confirm) → 풀다운 → 대시보드.
    // (모달 닫기는 AuthModal이 담당 — 여기서는 병합·이동만.)
    const handleAuthSuccess = async () => {
        await afterLogin();
        navigate('/dashboard');
    };

    // 헤더 로그인/로그아웃 상태 구독(로그인/로그아웃 시 즉시 라벨 갱신).
    useEffect(() => authStore.subscribe(() => setIsAuthed(authStore.isLoggedIn())), []);

    // 헤더 첫 버튼: 로그인 상태면 로그아웃 실동작, 비로그인이면 로그인 모달 오픈(P4-3).
    const handleHeaderAuth = () => {
        if (isAuthed) {
            authStore.logout();   // 토큰 제거(구독 → 라벨 갱신)
            afterLogout();        // 계정 데이터 정리 + 게스트 백업 복원
        } else {
            setIsLoginModalOpen(true);
        }
    };

    // 지역·나이대는 논리상 단일 선택(한 곳 거주·한 연령대) — 같은 카테고리 내 배타 토글.
    // 현재 상태(status)는 다중 허용(구직 중이면서 창업 준비 등 병행 가능).
    const SINGLE_SELECT_KEYS = ['region', 'age'];
    const toggleTag = (tag) => {
        const key = tag.slice(0, tag.indexOf(':'));
        setSelectedTags(prev => {
            if (prev.includes(tag)) return prev.filter(t => t !== tag);
            if (SINGLE_SELECT_KEYS.includes(key)) {
                // 단일 선택: 같은 카테고리의 기존 선택을 교체.
                return [...prev.filter(t => !t.startsWith(`${key}:`)), tag];
            }
            return [...prev, tag];
        });
    };

    // Mouse Parallax Effect Setup
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const smoothX = useSpring(mouseX, { damping: 50, stiffness: 400 });
    const smoothY = useSpring(mouseY, { damping: 50, stiffness: 400 });

    // Data points (abstract particles) for premium background depth
    const dataPoints = [
        { id: 1, x: -450, y: -250, size: 8, opacity: 0.1, delay: 0 },
        { id: 2, x: 400, y: -200, size: 6, opacity: 0.15, delay: 2 },
        { id: 3, x: -350, y: 180, size: 4, opacity: 0.1, delay: 4 },
        { id: 4, x: 380, y: 280, size: 10, opacity: 0.05, delay: 1 },
        { id: 5, x: 180, y: -320, size: 5, opacity: 0.12, delay: 3 },
        { id: 6, x: -220, y: -380, size: 7, opacity: 0.08, delay: 5 }
    ];

    // 3D Tilt Logic (Refined to 2 degrees for professional subtlety)
    const rotateX = useTransform(smoothY, [-800, 800], [2, -2]);
    const rotateY = useTransform(smoothX, [-800, 800], [-2, 2]);

    useEffect(() => {
        const handleMouseMove = (e) => {
            const { clientX, clientY } = e;
            const x = clientX - window.innerWidth / 2;
            const y = clientY - window.innerHeight / 2;
            mouseX.set(x);
            mouseY.set(y);
        };

        const handleScroll = () => {
            if (window.scrollY > 500) setShowScrollTop(true);
            else setShowScrollTop(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('scroll', handleScroll);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [mouseX, mouseY]);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Animation Variants
    const fadeInUp = {
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
    };

    const slideInLeft = {
        hidden: { opacity: 0, x: -60, filter: 'blur(10px)' },
        visible: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 1, ease: [0.16, 1, 0.3, 1] } }
    };

    const slideInRight = {
        hidden: { opacity: 0, x: 60, filter: 'blur(10px)' },
        visible: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 1, ease: [0.16, 1, 0.3, 1] } }
    };

    const popIn = {
        hidden: { opacity: 0, scale: 0.85, y: 40, filter: 'blur(10px)' },
        visible: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transition: { duration: 1, type: 'spring', bounce: 0.4 } }
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.2, // Increased stagger for more dramatic effect
                delayChildren: 0.3,
            }
        }
    };

    return (
        <div style={{
            width: '100%',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Pretendard, sans-serif',
            color: '#1E293B',
            overflowX: 'hidden'
        }}>
            {/* 1. Global Header - Fixed at top for all sections */}
            <header style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                padding: '0 40px', height: '70px', backgroundColor: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderBottom: '1px solid #E2E8F0', boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
            }}>
                <div {...keyboardAction} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
                    <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={handleHeaderAuth}
                        style={{
                            background: 'none', border: 'none', color: '#64748B',
                            padding: '10px 20px', borderRadius: '12px',
                            fontSize: '0.9375rem', fontWeight: '700', cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={e => e.target.style.color = '#2563EB'}
                        onMouseOut={e => e.target.style.color = '#64748B'}
                    >
                        {isAuthed ? '로그아웃' : '로그인'}
                    </button>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        style={{
                            background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', border: 'none', color: '#FFFFFF',
                            padding: '10px 28px', borderRadius: '14px',
                            fontSize: '0.9375rem', fontWeight: '800', cursor: 'pointer',
                            boxShadow: '0 8px 20px -4px rgba(37, 99, 235, 0.3)',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={e => e.target.style.transform = 'translateY(-2px)'}
                        onMouseOut={e => e.target.style.transform = 'translateY(0)'}
                    >
                        내게 맞는 정책 찾기
                    </button>
                </div>
            </header>

            {/* HERO SECTION (Light Mode Premium) */}
            <motion.section style={{
                position: 'relative',
                width: '100%',
                minHeight: '100vh',
                paddingTop: '70px',
                background: '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Subtle animated background orbs */}
                <motion.div
                    animate={{ scale: [1, 1.05, 1], opacity: [0.1, 0.15, 0.1] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                    style={{
                        position: 'absolute', top: '-10%', left: '20%',
                        width: '600px', height: '600px',
                        background: 'radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, rgba(255,255,255,0) 70%)',
                        borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none'
                    }}
                />

                {/* Main Hero Content */}
                <main style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', textAlign: 'center', padding: '100px 24px 0',
                    zIndex: 10, position: 'relative', perspective: '1200px'
                }}>
                    {/* Background Spotlight following cursor */}
                    <motion.div
                        style={{
                            position: 'absolute', top: -100, left: -100, width: '400px', height: '400px',
                            background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)',
                            borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none',
                            x: smoothX, y: smoothY, zIndex: 1
                        }}
                    />

                    {/* Floating Data Points (Sophisticated particles) */}
                    {dataPoints.map((item) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{
                                opacity: [item.opacity, item.opacity * 2.5, item.opacity],
                                scale: [1, 1.2, 1],
                                y: [item.y, item.y - 60, item.y]
                            }}
                            transition={{ duration: 12 + item.delay, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                position: 'absolute', left: '50%', top: '50%',
                                x: useMotionValue(item.x + smoothX.get() * 0.02),
                                y: useMotionValue(item.y + smoothY.get() * 0.02),
                                width: `${item.size}px`, height: `${item.size}px`,
                                background: '#2563EB', borderRadius: '50%', blur: '2px',
                                pointerEvents: 'none', zIndex: 1
                            }}
                        />
                    ))}

                    {/* Background Orbs (Premium liquid depth) */}
                    <motion.div
                        style={{
                            position: 'absolute', top: '10%', left: '10%', width: '600px', height: '600px',
                            background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)',
                            borderRadius: '50%', filter: 'blur(100px)', pointerEvents: 'none',
                            x: smoothX, y: smoothY
                        }}
                        animate={{
                            scale: [1, 1.3, 1],
                            opacity: [0.3, 0.6, 0.3],
                            borderRadius: ["40% 60% 70% 30% / 40% 50% 60% 50%", "60% 40% 30% 70% / 50% 60% 40% 50%", "40% 60% 70% 30% / 40% 50% 60% 50%"]
                        }}
                        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                        style={{
                            position: 'absolute', bottom: '20%', right: '5%', width: '500px', height: '500px',
                            background: 'radial-gradient(circle, rgba(37,99,235,0.04) 0%, transparent 60%)',
                            borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none',
                            x: useMotionValue(smoothX.get() * -0.5), y: useMotionValue(smoothY.get() * -0.5)
                        }}
                        animate={{
                            scale: [1, 1.1, 1],
                            opacity: [0.2, 0.5, 0.2],
                            borderRadius: ["30% 70% 50% 50% / 50% 30% 70% 50%", "70% 30% 50% 50% / 30% 50% 50% 70%", "30% 70% 50% 50% / 50% 30% 70% 50%"]
                        }}
                        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                        style={{
                            display: 'inline-block', background: 'rgba(239, 246, 255, 0.8)', backdropFilter: 'blur(10px)',
                            padding: '10px 20px', borderRadius: '100px', marginBottom: '32px',
                            border: '1px solid rgba(37, 99, 235, 0.1)', boxShadow: '0 4px 20px rgba(37, 99, 235, 0.05)',
                            zIndex: 10
                        }}
                    >
                        <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#2563EB', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            공고문, 읽다가 포기하셨나요?
                        </span>
                    </motion.div>

                    {/* Headline (Word-by-word reveal) */}
                    <motion.h1
                        style={{
                            fontSize: '4.5rem', fontWeight: '800', lineHeight: '1.05', letterSpacing: '-4px',
                            marginBottom: '40px', color: '#0F172A', wordBreak: 'keep-all', position: 'relative',
                            zIndex: 10
                        }}
                    >
                        {["복잡한", "공고문,", "CLUE가", "한눈에", "정리합니다."].map((word, i) => (
                            <motion.span
                                key={i}
                                initial={{ opacity: 0, filter: 'blur(10px)', y: 20 }}
                                animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                                transition={{ duration: 1, delay: i * 0.12 + 0.3, ease: [0.2, 0.65, 0.3, 0.9] }}
                                style={{
                                    display: 'inline-block',
                                    marginRight: '0.24em',
                                    color: i > 1 ? '#2563EB' : 'inherit',
                                    fontWeight: i > 1 ? '700' : '400'
                                }}
                            >
                                {word}
                            </motion.span>
                        ))}
                    </motion.h1>

                    {/* Subheadline */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        style={{
                            fontSize: '1.25rem', lineHeight: '1.6', color: '#475569',
                            marginBottom: '48px', maxWidth: '640px', wordBreak: 'keep-all'
                        }}
                    >
                        수십 페이지의 정책 공고문에서 내게 필요한 핵심 정보만 쏙쏙<br />
                        <strong>CLUE</strong>와 함께라면 단 하나의 지원금도 놓치지 않습니다.
                    </motion.p>

                    {/* CTA Button (Enhanced with Pulsing Glow) */}
                    <motion.button
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.6, type: 'spring' }}
                        onClick={() => setIsModalOpen(true)}
                        whileHover={{ scale: 1.05, boxShadow: '0 12px 40px rgba(37,99,235,0.4)' }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            padding: '24px 50px', fontSize: '1.25rem', fontWeight: 'bold',
                            backgroundColor: '#2563EB', color: 'white', border: 'none',
                            borderRadius: '20px', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            display: 'flex', alignItems: 'center', gap: '16px', position: 'relative', overflow: 'hidden'
                        }}
                    >
                        {/* Shining effect on button hover */}
                        <motion.div
                            animate={{ x: ['100%', '-100%'] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                            style={{ position: 'absolute', top: 0, left: 0, width: '40%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)', skewX: -20, pointerEvents: 'none' }}
                        />
                        내게 맞는 정책 찾기 <span style={{ fontSize: '1.5rem' }}>→</span>
                    </motion.button>

                    {/* Screen Mockup Area (Centered - 3D Tilt Enhanced) */}
                    <motion.div
                        initial={{ opacity: 0, y: 120 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1.4, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            width: '94%', maxWidth: '1200px', height: '400px', background: 'rgba(255, 255, 255, 0.5)',
                            borderRadius: '48px 48px 0 0', margin: '100px auto 0', border: '1px solid rgba(226, 232, 240, 0.8)',
                            borderBottom: 'none', boxShadow: '0 50px 150px -40px rgba(15, 23, 42, 0.12)', position: 'relative',
                            overflow: 'hidden', backdropFilter: 'blur(30px)',
                            rotateX, rotateY, transformStyle: 'preserve-3d', zIndex: 10
                        }}
                    >
                        {/* Internal depth elements */}
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 100%)', pointerEvents: 'none' }} />

                        {/* Scanning Line Effect */}
                        <motion.div
                            animate={{ y: [0, 440, 0] }}
                            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: '120px',
                                background: 'linear-gradient(to bottom, transparent, rgba(37, 99, 235, 0.08), transparent)',
                                borderTop: '1px solid rgba(37, 99, 235, 0.15)',
                                zIndex: 5, pointerEvents: 'none'
                            }}
                        />
                        <div style={{ padding: '32px 48px 0' }}>
                            {/* Top row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                                {/* 히어로 목업은 제품 화면 연출 — 개별 수치(match %)는 실데이터가 아니므로 "예시 화면" 표기로 정직화(P5-3). */}
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <div style={{ padding: '6px 14px', background: '#EFF6FF', borderRadius: '10px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#2563EB' }}>📁 공고문_분석.pdf</span>
                                    </div>
                                    <div style={{ padding: '6px 14px', background: '#F0FDF4', borderRadius: '10px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#059669' }}>✓ 분석 완료</span>
                                    </div>
                                    <div style={{ padding: '6px 14px', background: '#F1F5F9', borderRadius: '10px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>예시 화면</span>
                                    </div>
                                </div>
                                <div style={{ padding: '8px 20px', background: '#2563EB', borderRadius: '12px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#FFFFFF' }}>AI 리포트 보기</span>
                                </div>
                            </div>

                            {/* Cards row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                                {[
                                    { title: '노인일자리 지원', tag: '✓ 적합', tagColor: '#059669', tagBg: '#ECFDF5', score: '99%', scoreColor: '#2563EB', bars: [90, 70, 50] },
                                    { title: '장애인 보장구 지원', tag: '✓ 적합', tagColor: '#059669', tagBg: '#ECFDF5', score: '87%', scoreColor: '#3B82F6', bars: [75, 60, 40] },
                                    { title: '청년도약계좌', tag: '⚠ 검토', tagColor: '#D97706', tagBg: '#FFFBEB', score: '61%', scoreColor: '#F59E0B', bars: [55, 45, 30] },
                                ].map((card, i) => (
                                    <div key={i} style={{ padding: '20px', background: '#FFFFFF', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: '1px solid #F1F5F9' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#0F172A', lineHeight: 1.3 }}>{card.title}</div>
                                            <div style={{ padding: '3px 8px', background: card.tagBg, borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                                <span style={{ fontSize: '0.625rem', fontWeight: '700', color: card.tagColor }}>{card.tag}</span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.375rem', fontWeight: '900', color: card.scoreColor, marginBottom: '12px' }}>{card.score}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {card.bars.map((w, j) => (
                                                <div key={j} style={{ height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${w}%`, height: '100%', background: `linear-gradient(90deg, #2563EB, #60A5FA)`, borderRadius: '3px' }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Soft fade out at bottom */}
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0, height: '150px',
                            background: 'linear-gradient(to bottom, transparent, #F8FAFC)'
                        }}></div>
                    </motion.div>
                </main>
            </motion.section>

            {/* Section 1: The Problem (RESTORED INTELLIGENCE REPORT) */}
            <motion.section
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1 }}
                style={{
                    padding: '160px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    backgroundColor: '#F8FAFC', position: 'relative', overflow: 'hidden'
                }}
            >
                {/* Background decorative elements */}
                <div style={{
                    position: 'absolute', top: '20%', right: '-10%', width: '600px', height: '600px',
                    background: 'radial-gradient(circle, rgba(37,99,235,0.03) 0%, transparent 70%)',
                    borderRadius: '50%', pointerEvents: 'none'
                }}></div>

                <div style={{ maxWidth: '1200px', width: '100%', position: 'relative', zIndex: 2 }}>
                    <div style={{ textAlign: 'left', marginBottom: '80px' }}>
                        <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            style={{ fontSize: '3.5rem', fontWeight: '800', color: '#0F172A', letterSpacing: '-2px', lineHeight: '1.2' }}
                        >
                            공고문 앞에서<br />
                            <span style={{ color: '#2563EB' }}>헤매지 마세요</span>
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            style={{ fontSize: '1.25rem', color: '#475569', marginTop: '24px', maxWidth: '600px', lineHeight: '1.6' }}
                        >
                            공고문을 읽어도 무슨 소리인지 모르겠다면, CLUE가 도와드릴게요.
                        </motion.p>
                    </div>

                    {/* The Intelligence Report Card (3D Tilt) */}
                    <motion.div
                        initial={{ opacity: 0, y: 60 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            background: '#FFFFFF', borderRadius: '56px', padding: '56px 80px',
                            boxShadow: '0 60px 120px -30px rgba(15, 23, 42, 0.1)',
                            border: '1px solid rgba(226, 232, 240, 1)', position: 'relative',
                            overflow: 'hidden', rotateX, rotateY, transformStyle: 'preserve-3d'
                        }}
                    >
                        {/* Spotlight following cursor inside card */}
                        <motion.div
                            style={{
                                position: 'absolute', top: 0, left: 0, width: '600px', height: '600px',
                                background: 'radial-gradient(circle, rgba(37,99,235,0.05) 0%, transparent 70%)',
                                borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none',
                                x: smoothX, y: smoothY
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '60px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#2563EB' }}></div>
                                    <span style={{ fontSize: '0.875rem', fontWeight: '800', color: '#2563EB', letterSpacing: '2px' }}>INTELLIGENCE REPORT</span>
                                </div>
                                <h3 style={{ fontSize: '2.25rem', fontWeight: '800', color: '#0F172A', letterSpacing: '-1px' }}>정책 정보 격차 분석</h3>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1.5fr', gap: '80px', alignItems: 'center' }}>
                            {/* Left: Huge Gauge */}
                            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ position: 'relative', width: '280px', height: '280px' }}>
                                    <svg width="280" height="280" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="45" fill="none" stroke="#F1F5F9" strokeWidth="8" />
                                        <motion.circle
                                            cx="50" cy="50" r="45" fill="none" stroke="#2563EB" strokeWidth="8"
                                            strokeDasharray="282.7"
                                            initial={{ strokeDashoffset: 282.7 }}
                                            whileInView={{ strokeDashoffset: 282.7 * (1 - 0.34) }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 2, ease: "easeOut" }}
                                            strokeLinecap="round"
                                            transform="rotate(-90 50 50)"
                                        />
                                    </svg>
                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            style={{ fontSize: '4.5rem', fontWeight: '900', color: '#0F172A', lineHeight: 1 }}
                                        >
                                            34<span style={{ fontSize: '2rem', fontWeight: '700', color: '#2563EB' }}>%</span>
                                        </motion.div>
                                        {/* 실측: 온통청년 등록 청년정책 2,633건 전수 분석 — 자격 조건의 34%가 공고문 원문에만 존재(docs/plans/DIAGNOSIS_REDESIGN.md·PRODUCT.md §4). */}
                                        <div style={{ fontSize: '1rem', fontWeight: '700', color: '#64748B', marginTop: '8px' }}>원문에만 있는 자격 조건</div>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Analysis Bars */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                                {/* 아래 요인별 비중 막대는 정성적 장벽 유형을 보여주는 예시 구성(정확한 %는 실측 아님). "(예시 구성)" 표기는 사용자 요청으로 제거(2026-10-12). 실측 수치는 게이지(34%)와 하단 인용을 참조. */}
                                <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#0F172A', marginBottom: '10px' }}>주요 진입 장벽 유형</div>
                                {[
                                    { label: '행정 전문 용어의 난해성', value: 88 },
                                    { label: '방대한 필수 서류 준비 부담', value: 64 },
                                    { label: '중복 수혜 배제 조항의 불확실성', value: 42 }
                                ].map((item, i) => (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                                            <div>
                                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>{item.label}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '2px' }}>{item.sub}</div>
                                            </div>
                                            <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#2563EB' }}>{item.value}%</div>
                                        </div>
                                        <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                whileInView={{ width: `${item.value}%` }}
                                                viewport={{ once: true }}
                                                transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                                                style={{ height: '100%', background: '#2563EB', borderRadius: '4px' }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Bottom Quote section */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.8 }}
                            style={{
                                marginTop: '60px', padding: '32px', background: 'rgba(37, 99, 235, 0.04)',
                                borderRadius: '24px', border: '1px solid rgba(37, 99, 235, 0.1)',
                                position: 'relative'
                            }}
                        >
                            <div style={{ fontSize: '2.5rem', position: 'absolute', top: '10px', left: '20px', opacity: 0.1, color: '#2563EB', fontFamily: 'serif' }}>"</div>
                            {/* 실측 인용(P5-3): 온통청년 등록 2,633건 전수 분석. 출처: docs/plans/DIAGNOSIS_REDESIGN.md·PRODUCT.md §4. */}
                            <p style={{ fontSize: '1rem', color: '#475569', lineHeight: 1.8, textAlign: 'center', fontWeight: '500' }}>
                                온통청년에 등록된 <span style={{ color: '#2563EB', fontWeight: '800' }}>청년정책 2,633건을 전수 분석</span>한 결과, 자격 조건의 34%가 공고문 원문에만 존재했습니다.
                            </p>
                        </motion.div>
                    </motion.div>
                </div>
            </motion.section>

            {/* Section 2: How It Works (RESTORED VISUAL STEPS) */}
            <motion.section
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1 }}
                style={{
                    padding: '160px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    backgroundColor: '#FFFFFF', borderTop: '1px solid #F1F5F9', position: 'relative',
                    overflow: 'hidden'
                }}
            >
                {/* Timeline Vertical Line with shimmer */}
                <div style={{
                    position: 'absolute', left: '50%', top: '350px', bottom: '160px',
                    width: '2px', transform: 'translateX(-50%)', zIndex: 1,
                    background: 'linear-gradient(to bottom, #E2E8F0, #BFDBFE, #E2E8F0)',
                    overflow: 'hidden'
                }}>
                    <motion.div
                        animate={{ y: ['-100%', '300%'] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.3 }}
                        style={{
                            position: 'absolute', top: 0, left: 0,
                            width: '100%', height: '25%',
                            background: 'linear-gradient(to bottom, transparent, #2563EB, #60A5FA, transparent)',
                            boxShadow: '0 0 12px rgba(37,99,235,1)',
                        }}
                    />
                </div>



                <div style={{ maxWidth: '1200px', width: '100%', position: 'relative', zIndex: 10 }}>
                    <div style={{ textAlign: 'center', marginBottom: '120px' }}>
                        <span style={{ color: '#2563EB', fontWeight: '800', letterSpacing: '2px', fontSize: '0.875rem' }}>HOW IT WORKS</span>
                        <h2 style={{ fontSize: '3rem', fontWeight: '800', marginTop: '16px', color: '#0F172A', letterSpacing: '-1.5px', lineHeight: 1.2 }}>
                            CLUE가 가장 똑똑하게 공고문을<br />정리하는 3단계
                        </h2>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '140px' }}>
                        {/* Step 01 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '140px', position: 'relative' }}>
                            {/* Timeline Node */}
                            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 5 }}>
                                <motion.div animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }} style={{ position: 'absolute', inset: '-8px', borderRadius: '50%', border: '2px solid #2563EB', pointerEvents: 'none' }} />
                                <motion.div animate={{ scale: [1, 2.4, 1], opacity: [0.2, 0, 0.2] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.4 }} style={{ position: 'absolute', inset: '-8px', borderRadius: '50%', border: '1px solid #93C5FD', pointerEvents: 'none' }} />
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FFFFFF', border: '2px solid #2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(37, 99, 235, 0.2)' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#2563EB' }}></div>
                                </div>
                            </div>

                            <div style={{ flex: 1, textAlign: 'right', position: 'relative' }}>
                                {/* Ghost Number */}
                                <span style={{ position: 'absolute', top: '-40px', right: '-20px', fontSize: '8.75rem', fontWeight: '900', color: '#F1F5F9', zIndex: -1, lineHeight: 1 }}>01</span>
                                <div style={{
                                    display: 'inline-block', padding: '8px 16px', background: '#EFF6FF',
                                    borderRadius: '12px', color: '#2563EB', fontWeight: '700', fontSize: '0.875rem', marginBottom: '24px'
                                }}>
                                    STEP 01
                                </div>
                                <h3 style={{ fontSize: '2.25rem', fontWeight: '800', color: '#0F172A', marginBottom: '24px', letterSpacing: '-0.5px' }}>
                                    스마트 업로드 및 구조화
                                </h3>
                                <p style={{ fontSize: '1.125rem', color: '#64748B', lineHeight: 1.6, wordBreak: 'keep-all', maxWidth: '500px', marginLeft: 'auto' }}>
                                    복잡한 형태의 PDF 공고문도 즉시 분석 가능한 데이터로 인식합니다.<br />누락된 정보 없이 모든 조항을 정확하게 읽어냅니다.
                                </p>
                            </div>

                            <div style={{ flex: 1 }}>
                                <motion.div
                                    initial={{ opacity: 0, x: 40 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    style={{
                                        background: '#FFFFFF',
                                        borderRadius: '28px', padding: '28px',
                                        border: '1px solid #E2E8F0',
                                        boxShadow: '0 25px 50px rgba(15, 23, 42, 0.08)',
                                        position: 'relative', overflow: 'hidden'
                                    }}
                                >
                                    <div style={{ position: 'absolute', top: 0, right: 0, width: '180px', height: '180px', background: 'radial-gradient(circle, rgba(37,99,235,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
                                    {/* Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', position: 'relative' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#0F172A' }}>공고문_분석.pdf</div>
                                                <div style={{ fontSize: '0.6875rem', color: '#94A3B8', marginTop: '2px' }}>생애주기별 맞춤 복지 통합 공고 · 47p</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '6px 12px' }}>
                                            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB' }} />
                                            <span style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#2563EB', letterSpacing: '1px' }}>STRUCTURING</span>
                                        </div>
                                    </div>
                                    {/* Progress bar */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: '600' }}>문서 분석 진행률</span>
                                            <span style={{ fontSize: '0.6875rem', color: '#2563EB', fontWeight: '800' }}>87%</span>
                                        </div>
                                        <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                                            <motion.div animate={{ width: ['0%', '87%'] }} transition={{ duration: 2.5, ease: 'easeOut' }} style={{ height: '100%', background: 'linear-gradient(90deg, #2563EB, #60A5FA)', borderRadius: '3px' }} />
                                        </div>
                                    </div>
                                    {/* Clause detection list */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {[
                                            { label: '지원 자격 조항', count: '12개', status: 'done', color: '#059669' },
                                            { label: '서류 요건 조항', count: '8개', status: 'active', color: '#2563EB' },
                                            { label: '예외 조항 분석', count: '—', status: 'pending', color: '#CBD5E1' },
                                        ].map((item, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: item.status === 'active' ? '#EFF6FF' : '#F8FAFC', borderRadius: '10px', border: `1px solid ${item.status === 'active' ? '#BFDBFE' : '#F1F5F9'}` }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.color }} />
                                                    <span style={{ fontSize: '0.75rem', color: item.status === 'pending' ? '#CBD5E1' : '#334155', fontWeight: '500' }}>{item.label}</span>
                                                </div>
                                                <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: item.color }}>{item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            </div>
                        </div>

                        {/* Step 02 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '140px', flexDirection: 'row-reverse', position: 'relative' }}>
                            {/* Timeline Node */}
                            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 5 }}>
                                <motion.div animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.6 }} style={{ position: 'absolute', inset: '-8px', borderRadius: '50%', border: '2px solid #2563EB', pointerEvents: 'none' }} />
                                <motion.div animate={{ scale: [1, 2.4, 1], opacity: [0.2, 0, 0.2] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 1 }} style={{ position: 'absolute', inset: '-8px', borderRadius: '50%', border: '1px solid #93C5FD', pointerEvents: 'none' }} />
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FFFFFF', border: '2px solid #2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(37, 99, 235, 0.2)' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#2563EB' }}></div>
                                </div>
                            </div>

                            <div style={{ flex: 1, textAlign: 'left', position: 'relative' }}>
                                {/* Ghost Number */}
                                <span style={{ position: 'absolute', top: '-40px', left: '-20px', fontSize: '8.75rem', fontWeight: '900', color: '#F1F5F9', zIndex: -1, lineHeight: 1 }}>02</span>
                                <div style={{
                                    display: 'inline-block', padding: '8px 16px', background: '#EFF6FF',
                                    borderRadius: '12px', color: '#2563EB', fontWeight: '700', fontSize: '0.875rem', marginBottom: '24px'
                                }}>
                                    STEP 02
                                </div>
                                <h3 style={{ fontSize: '2.25rem', fontWeight: '800', color: '#0F172A', marginBottom: '24px', letterSpacing: '-0.5px' }}>
                                    지능형 분석 및 요약
                                </h3>
                                <p style={{ fontSize: '1.125rem', color: '#64748B', lineHeight: 1.6, wordBreak: 'keep-all', maxWidth: '500px' }}>
                                    수십 페이지의 문서를 단숨에 요약하고, 핵심 위험 요소를 도출합니다.<br />사용자가 꼭 알아야 할 예외 조항까지 꼼꼼히 살핍니다.
                                </p>
                            </div>
                            <div style={{ flex: 1 }}>
                                <motion.div
                                    initial={{ opacity: 0, x: -40 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    style={{
                                        background: '#FFFFFF',
                                        borderRadius: '28px', padding: '28px',
                                        border: '1px solid #E2E8F0',
                                        boxShadow: '0 25px 50px rgba(15, 23, 42, 0.08)',
                                        position: 'relative', overflow: 'hidden'
                                    }}
                                >
                                    <div style={{ position: 'absolute', top: 0, right: 0, width: '180px', height: '180px', background: 'radial-gradient(circle, rgba(37,99,235,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
                                    {/* Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #2563EB, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" /><path d="M12 6v6l4 2" /></svg>
                                            </div>
                                            <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#0F172A' }}>실시간 AI 분석 엔진</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '4px 8px', borderRadius: '6px', letterSpacing: '1px' }}>
                                            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB' }} />
                                            <span style={{ fontSize: '0.625rem', fontWeight: '800', color: '#2563EB' }}>ACID</span>
                                        </div>
                                    </div>
                                    {/* Statistics row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                                        {[
                                            { label: '분석 조항', value: '243', color: '#1D4ED8', labelColor: '#64748B', bg: '#DBEAFE', border: '#93C5FD' },
                                            { label: '위험 감지', value: '7', color: '#2563EB', labelColor: '#64748B', bg: '#EFF6FF', border: '#BFDBFE' },
                                            { label: '핵심 조건', value: '19', color: '#3B82F6', labelColor: '#94A3B8', bg: '#FFFFFF', border: '#E2E8F0' },
                                        ].map((stat, i) => (
                                            <div key={i} style={{ background: stat.bg, borderRadius: '12px', padding: '12px', textAlign: 'center', border: `1px solid ${stat.border}` }}>
                                                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                                                <div style={{ fontSize: '0.625rem', color: stat.labelColor, marginTop: '4px', fontWeight: '600' }}>{stat.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Analysis stream */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <motion.div
                                            animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 3.5 }}
                                            style={{ padding: '12px 16px', background: '#DBEAFE', borderRadius: '12px', borderLeft: '4px solid #1E3A8A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#1E3A8A', flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.75rem', color: '#1E3A8A', fontWeight: '700' }}>위험 조항: 거주 기간 제한 예외 사항</span>
                                            </div>
                                            <span style={{ fontSize: '0.625rem', color: '#1E3A8A', fontWeight: '800', background: '#93C5FD', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>RISK</span>
                                        </motion.div>
                                        <motion.div
                                            animate={{ x: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 3.5, delay: 0.8 }}
                                            style={{ padding: '12px 16px', background: '#EFF6FF', borderRadius: '12px', borderLeft: '4px solid #2563EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.75rem', color: '#1E40AF', fontWeight: '600' }}>적합: 가구 소득 기준 충족 확인됨</span>
                                            </div>
                                            <span style={{ fontSize: '0.625rem', color: '#2563EB', fontWeight: '700', background: '#BFDBFE', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>PASS</span>
                                        </motion.div>
                                        <motion.div
                                            animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 3.5, delay: 1.6 }}
                                            style={{ padding: '12px 16px', background: '#F0F9FF', borderRadius: '12px', borderLeft: '4px solid #93C5FD', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#60A5FA', flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.75rem', color: '#3B82F6', fontWeight: '600' }}>재산 기준 항목 검증 중...</span>
                                            </div>
                                            <span style={{ fontSize: '0.625rem', color: '#60A5FA', fontWeight: '700', background: '#E0F2FE', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>SCAN</span>
                                        </motion.div>
                                    </div>
                                </motion.div>
                            </div>
                        </div>

                        {/* Step 03 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '140px', position: 'relative' }}>
                            {/* Timeline Node */}
                            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 5 }}>
                                <motion.div animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 1.2 }} style={{ position: 'absolute', inset: '-8px', borderRadius: '50%', border: '2px solid #2563EB', pointerEvents: 'none' }} />
                                <motion.div animate={{ scale: [1, 2.4, 1], opacity: [0.2, 0, 0.2] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 1.6 }} style={{ position: 'absolute', inset: '-8px', borderRadius: '50%', border: '1px solid #93C5FD', pointerEvents: 'none' }} />
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FFFFFF', border: '2px solid #2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(37, 99, 235, 0.2)' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#2563EB' }}></div>
                                </div>
                            </div>

                            <div style={{ flex: 1, textAlign: 'right', position: 'relative' }}>
                                {/* Ghost Number */}
                                <span style={{ position: 'absolute', top: '-40px', right: '-20px', fontSize: '8.75rem', fontWeight: '900', color: '#F1F5F9', zIndex: -1, lineHeight: 1 }}>03</span>
                                <div style={{
                                    display: 'inline-block', padding: '8px 16px', background: '#EFF6FF',
                                    borderRadius: '12px', color: '#2563EB', fontWeight: '700', fontSize: '0.875rem', marginBottom: '24px'
                                }}>
                                    STEP 03
                                </div>
                                <h3 style={{ fontSize: '2.25rem', fontWeight: '800', color: '#0F172A', marginBottom: '24px', letterSpacing: '-0.5px' }}>
                                    맞춤형 결과 대시보드
                                </h3>
                                <p style={{ fontSize: '1.125rem', color: '#64748B', lineHeight: 1.6, wordBreak: 'keep-all', maxWidth: '500px', marginLeft: 'auto' }}>
                                    나에게 꼭 필요한 핵심 정보만 쏙쏙.<br />신청 가능 여부부터 캘린더까지 한눈에 자료로 확인 가능합니다.
                                </p>
                            </div>
                            <div style={{ flex: 1 }}>
                                <motion.div
                                    initial={{ opacity: 0, x: 40 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    style={{
                                        background: '#FFFFFF', borderRadius: '28px', padding: '28px',
                                        border: '1px solid #E2E8F0', boxShadow: '0 25px 50px rgba(15,23,42,0.08)',
                                        position: 'relative', overflow: 'hidden'
                                    }}
                                >
                                    <div style={{ position: 'absolute', top: 0, right: 0, width: '180px', height: '180px', background: 'radial-gradient(circle, rgba(37,99,235,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
                                    {/* Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                                            </div>
                                            <div>
                                                {/* 예시 리포트 카드(92점 등은 실데이터 아님) — "예시" 표기로 정직화(P5-3). */}
                                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0F172A' }}>AI 진단 리포트</div>
                                                <div style={{ fontSize: '0.625rem', color: '#94A3B8', marginTop: '1px' }}>예시 · 청년 월세 지원</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '6px 12px' }}>
                                            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB' }} />
                                            <span style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#2563EB', letterSpacing: '1px' }}>REPORT</span>
                                        </div>
                                    </div>
                                    {/* Score gauge */}
                                    <div style={{ background: 'linear-gradient(135deg, #EFF6FF, #F8FAFC)', borderRadius: '16px', padding: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '20px', border: '1px solid #DBEAFE' }}>
                                        <div style={{ position: 'relative', width: '72px', height: '72px', flexShrink: 0 }}>
                                            <svg width="72" height="72" viewBox="0 0 36 36">
                                                <circle cx="18" cy="18" r="15" fill="none" stroke="#DBEAFE" strokeWidth="3" />
                                                <motion.circle
                                                    cx="18" cy="18" r="15" fill="none" stroke="#2563EB" strokeWidth="3"
                                                    strokeDasharray="94.2"
                                                    initial={{ strokeDashoffset: 94.2 }}
                                                    whileInView={{ strokeDashoffset: 94.2 * (1 - 0.92) }}
                                                    viewport={{ once: true }}
                                                    transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
                                                    strokeLinecap="round"
                                                    transform="rotate(-90 18 18)"
                                                />
                                            </svg>
                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '1rem', fontWeight: '900', color: '#1D4ED8', lineHeight: 1 }}>92</span>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: '600', marginBottom: '4px' }}>수혜 적합도 점수</div>
                                            <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#0F172A' }}>최우선 신청 대상</div>
                                            <div style={{ fontSize: '0.6875rem', color: '#059669', fontWeight: '700', marginTop: '2px' }}>92점 · 상위 8%</div>
                                        </div>
                                    </div>
                                    {/* Policy cards */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {[
                                            { name: '청년 월세 한시 특별지원', amount: '월 20만원', match: '99%', color: '#2563EB' },
                                            { name: '청년 주거급여 분리지급', amount: '월 14만원', match: '87%', color: '#2563EB' },
                                        ].map((policy, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #F1F5F9' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: policy.color, flexShrink: 0 }} />
                                                    <div>
                                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#334155' }}>{policy.name}</div>
                                                        <div style={{ fontSize: '0.625rem', color: '#94A3B8', marginTop: '1px' }}>{policy.amount}</div>
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: policy.color }}>{policy.match}</div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.section>

            {/* Section 3: Bottom CTA (RESTORED PREMIUM) */}
            <motion.section
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1 }}
                style={{
                    padding: '160px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 40%, #2563EB 100%)',
                    position: 'relative', overflow: 'hidden'
                }}
            >
                {/* Grid pattern overlay */}
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

                {/* Glowing orbs */}
                <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ position: 'absolute', top: '-15%', left: '-5%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(96,165,250,0.3) 0%, transparent 60%)', borderRadius: '50%', pointerEvents: 'none' }}
                />
                <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                    style={{ position: 'absolute', bottom: '-20%', right: '-5%', width: '700px', height: '700px', background: 'radial-gradient(circle, rgba(37,99,235,0.4) 0%, transparent 60%)', borderRadius: '50%', pointerEvents: 'none' }}
                />


                <div style={{ maxWidth: '900px', textAlign: 'center', zIndex: 10, position: 'relative' }}>
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '100px', padding: '8px 20px', marginBottom: '32px' }}
                    >
                        <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#60A5FA' }} />
                        <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: '1px' }}>AI 기반 내게 맞는 정책 찾기</span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        style={{ fontSize: '4rem', fontWeight: '900', color: '#FFFFFF', marginBottom: '24px', letterSpacing: '-3px', lineHeight: 1.1 }}
                    >
                        내게 맞는 정책 정보,<br />이제 헤매지 마세요
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        style={{ fontSize: '1.25rem', color: 'rgba(255,255,255,0.7)', marginBottom: '56px', fontWeight: '400', maxWidth: '600px', margin: '0 auto 56px', lineHeight: 1.7 }}
                    >
                        지금 바로 CLUE와 함께 첫 번째 정책 지원을<br />완벽하게 성공해보세요.
                    </motion.p>
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsModalOpen(true)}
                        style={{
                            padding: '22px 64px', backgroundColor: '#FFFFFF', color: '#1D4ED8',
                            fontSize: '1.25rem', fontWeight: '900', borderRadius: '20px', border: 'none',
                            cursor: 'pointer', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                            display: 'inline-flex', alignItems: 'center', gap: '12px',
                            position: 'relative', overflow: 'hidden'
                        }}
                    >
                        <motion.div
                            animate={{ x: ['100%', '-100%'] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                            style={{ position: 'absolute', top: 0, left: 0, width: '40%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(37,99,235,0.08), transparent)', pointerEvents: 'none' }}
                        />
                        내게 맞는 정책 찾기
                        <span style={{ fontSize: '1.375rem' }}>→</span>
                    </motion.button>
                </div>
            </motion.section>

            {/* ===== Premium Auth Modal (Login/Signup) — 공용 컴포넌트로 추출(src/components/AuthModal.jsx) ===== */}
            <AuthModal
                isOpen={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
                onSuccess={handleAuthSuccess}
                initialMode="login"
            />
            {/* Persona Selection Modal */}
            <AnimatePresence>
                {isModalOpen && (() => {
                    const renderChip = ({ id, label, isSelected, onClick }) => (
                        <motion.button
                            key={id}
                            onClick={onClick}
                            whileHover={{ scale: 1.04, y: -2 }}
                            whileTap={{ scale: 0.96 }}
                            style={{
                                padding: '10px 20px', borderRadius: '12px',
                                border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                                background: isSelected ? 'var(--color-primary-50)' : 'var(--color-bg-base)',
                                color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                fontSize: '0.875rem', fontWeight: isSelected ? 800 : 700,
                                cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: isSelected ? '0 4px 12px rgba(59, 130, 246, 0.15)' : '0 2px 4px rgba(0,0,0,0.02)'
                            }}
                        >
                            {isSelected && <span style={{ marginRight: '5px' }}>✓</span>}
                            {label}
                        </motion.button>
                    );
                    const specCategories = [
                        {
                            // 도 단위로 간소화(2026-10-12): '충청'·'전라'·'경상'은 그 도의 광역시까지 묶은 다지역 태그 → profileFilters.LANDING_REGION_PROVINCE
                            key: 'region', label: '지역', icon: '📍', columns: 4,
                            options: ['서울', '경기', '인천', '강원', '충청', '전라', '경상', '제주']
                        },
                        {
                            key: 'age', label: '나이대', icon: '🎂',
                            options: ['만 18세 이하', '만 19~34세', '만 35~39세', '만 40~64세', '만 65세 이상']
                        },
                        {
                            key: 'status', label: '현재 상태', icon: '💼',
                            options: ['구직 중', '재학 중', '창업 준비·운영', '재직 중', '프리랜서·자영업']
                        },
                    ];
                    return (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={closeModal}
                            style={{
                                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(16px)',
                                zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
                                overflowY: 'auto'
                            }}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 30, opacity: 0 }}
                                animate={{ scale: 1, y: 0, opacity: 1 }}
                                exit={{ scale: 0.9, y: 30, opacity: 0 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                    width: '100%', maxWidth: '540px',
                                    background: '#FFFFFF',
                                    border: '1px solid #E2E8F0', borderRadius: '32px', padding: '44px 40px 36px',
                                    position: 'relative', boxShadow: '0 30px 100px -15px rgba(0,0,0,0.08), 0 0 50px rgba(59,130,246,0.04)',
                                    maxHeight: '92vh', overflowY: 'auto',
                                    display: 'flex', flexDirection: 'column'
                                }}
                            >
                                {/* Close */}
                                <button
                                    onClick={closeModal}
                                    style={{ position: 'absolute', top: '24px', right: '24px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', color: '#64748B', cursor: 'pointer', fontSize: '1.25rem', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', zIndex: 2 }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}
                                >
                                    ×
                                </button>

                                {modalStage === 'loading' ? (
                                    /* Loading View — 집계 중 스피너(기존 framer-motion 톤 재사용) */
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0 56px', gap: '20px' }}>
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                                            style={{ width: '44px', height: '44px', borderRadius: '50%', border: '4px solid #EFF6FF', borderTopColor: '#2563EB' }}
                                        />
                                        <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0F172A' }}>지금 신청 가능한 정책을 찾고 있어요</div>
                                        <div style={{ fontSize: '0.8125rem', color: '#64748B' }}>선택하신 조건으로 공공데이터를 집계 중입니다…</div>
                                    </div>
                                ) : modalStage === 'result' && resultAgg ? (
                                    /* Result View — 즉시 결과(모달 내 전환). 기존 모달 디자인 토큰 재사용. */
                                    <div>
                                        <h3 style={{ fontSize: '1.625rem', fontWeight: '900', marginBottom: '10px', color: '#0F172A', lineHeight: 1.3, letterSpacing: '-0.5px' }}>
                                            지금 신청 가능한 정책 <span style={{ color: '#2563EB' }}>{resultAgg.total}건</span>
                                        </h3>
                                        <p style={{ color: '#64748B', fontSize: '0.90625rem', lineHeight: 1.5, fontWeight: 500, marginBottom: '24px' }}>
                                            선택하신 조건으로 온통청년 공공데이터를 실시간 집계했어요.
                                        </p>
                                        {resultAgg.breakdown.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
                                                {resultAgg.breakdown.map((b) => (
                                                    <div key={b.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                                                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#475569' }}>{b.label}</span>
                                                        <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#2563EB' }}>{b.eligible}건</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <motion.button
                                            whileHover={{ scale: 1.02, boxShadow: '0 15px 35px -5px rgba(59, 130, 246, 0.4)' }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => navigate('/dashboard')}
                                            style={{
                                                width: '100%', padding: '18px', borderRadius: '16px', border: 'none',
                                                background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#FFFFFF',
                                                fontSize: '1rem', fontWeight: 800, cursor: 'pointer',
                                                transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                                boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.3)'
                                            }}
                                        >
                                            맞춤 공고 보러 가기 →
                                        </motion.button>
                                    </div>
                                ) : (
                                <>
                                {/* Header */}
                                <div style={{ marginBottom: '32px' }}>
                                    <h3 style={{ fontSize: '1.625rem', fontWeight: '900', marginBottom: '8px', color: '#0F172A', lineHeight: 1.3, letterSpacing: '-0.5px' }}>
                                        사용자님은 어떤 분이신가요?
                                    </h3>
                                    <p style={{ color: '#64748B', fontSize: '0.90625rem', lineHeight: 1.5, fontWeight: 500 }}>
                                        선택하신 조건에 꼭 맞는 혜택들만 선별해 드릴게요.
                                    </p>
                                </div>

                                {/* Category Sections */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '32px' }}>
                                    {specCategories.map(({ key, label, icon, options, columns }) => (
                                        <div key={key}>
                                            <div style={{ fontSize: '0.8125rem', color: '#3B82F6', fontWeight: 800, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '1rem' }}>{icon}</span> {label}
                                            </div>
                                            <div style={columns
                                                ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '8px' }
                                                : { display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {options.map(opt => {
                                                    const tag = `${key}:${opt}`;
                                                    return renderChip({ id: opt, label: opt, isSelected: selectedTags.includes(tag), onClick: () => toggleTag(tag) });
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* CTA */}
                                <motion.button
                                    whileHover={{ scale: 1.02, boxShadow: '0 15px 35px -5px rgba(59, 130, 246, 0.4)' }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => { if (selectedTags.length > 0) runInstantDiagnosis(); }}
                                    style={{
                                        width: '100%', padding: '18px', borderRadius: '16px', border: 'none',
                                        background: selectedTags.length > 0 ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : '#F1F5F9',
                                        color: selectedTags.length > 0 ? '#FFFFFF' : '#94A3B8',
                                        fontSize: '1rem', fontWeight: 800, cursor: 'pointer',
                                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                        boxShadow: selectedTags.length > 0 ? '0 10px 25px -5px rgba(59, 130, 246, 0.3)' : 'none'
                                    }}
                                >
                                    {selectedTags.length > 0
                                        ? `${selectedTags.length}개 조건으로 분석 시작하기 →`
                                        : '조건을 선택하면 활성화됩니다'}
                                </motion.button>
                                </>
                                )}
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* SCROLL TO TOP BUTTON (Framer Motion Enhanced) */}
            <AnimatePresence>
                {showScrollTop && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.5, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.5, y: 20 }}
                        whileHover={{
                            y: -5,
                            boxShadow: '0 12px 30px rgba(59, 130, 246, 0.25)',
                            backgroundColor: '#3B82F6',
                            color: '#FFFFFF'
                        }}
                        whileTap={{ scale: 0.9 }}
                        onClick={scrollToTop}
                        style={{
                            position: 'fixed',
                            bottom: '40px',
                            right: '40px',
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            color: '#3B82F6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.08)',
                            cursor: 'pointer',
                            zIndex: 9999,
                            padding: 0,
                            outline: 'none'
                        }}
                    >
                        <motion.svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            animate={{ y: [0, -2, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                        >
                            <polyline points="18 15 12 9 6 15"></polyline>
                        </motion.svg>
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StartPage;
