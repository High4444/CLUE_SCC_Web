import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import PersonaWidget from '../components/PersonaWidget';
import { getProfile, saveProfile } from '../store/profileStore';
import { getPolicies } from '../api/client';
import { computeVerdict, countEligible } from '../utils/verdictEngine';
import { regionToZipCd, LCLSF, deriveAgeRange, deriveRegions } from '../utils/profileFilters';
import { listSaved } from '../store/savedStore';
import { listDocuments } from '../store/documentStore';
import { listUpcomingEvents } from '../store/calendarStore';
import * as authStore from '../store/authStore';
import { afterLogin, afterLogout } from '../store/syncLayer';
import AuthModal from '../components/AuthModal';
import './SelfDiagnosisPage.css';

// 자가진단 결과 게이지 3분야 정의.
// 온통청년 프록시는 lclsfNm 파라미터를 서버측 필터로 반영하지 않으므로(0건 반환),
// 지역(zipCd) 기준 샘플을 받아 각 정책의 lclsfNm(대분류)으로 클라이언트에서 분류한다.
// (실측 대분류: 일자리 / 교육･직업훈련 / 금융･복지･문화 / 주거 / 참여･기반)
// 게이지 %는 verdictEngine 통과 비율(내 조건으로 '신청 가능성 높음'인 정책 / 그 분야 정책),
// 라벨 수치는 그 통과 건수("N건 신청 가능")를 뜻한다.
// lclsf 값은 profileFilters의 LCLSF 정본 상수로 통일(대시보드 추천 분류와 동일 출처).
const CATEGORY_DEFS = [
    { key: 'housing', label: '주거 지원', color: '#60A5FA', icon: '🏠', lclsf: [LCLSF.HOUSING] },
    { key: 'finance', label: '금융/자산', color: '#34D399', icon: '📈', lclsf: [LCLSF.WELFARE] },
    { key: 'job', label: '취업/교육', color: '#FBBF24', icon: '🎓', lclsf: [LCLSF.JOB, LCLSF.EDU] },
];

// 결과 집계에 사용할 정책 샘플 크기(지역 기준 상위 N건).
const SAMPLE_SIZE = 100;

// 소득 구간(자가진단 선택지) 순서 — 본인 선택 구간의 상대적 위치 표시에만 사용.
const INCOME_ORDER = ['100만 원 이하', '100~200만 원', '200~300만 원', '300~400만 원', '400만 원 이상'];

// Animated counter hook
function useCounter(target, duration = 1200) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let start = 0;
        const step = target / (duration / 16);
        const timer = setInterval(() => {
            start += step;
            if (start >= target) { setCount(target); clearInterval(timer); }
            else setCount(Math.floor(start));
        }, 16);
        return () => clearInterval(timer);
    }, [target, duration]);
    return count;
}

function ScoreRing({ score, color, label, icon, delay = 0 }) {
    const [animate, setAnimate] = useState(false);
    const count = useCounter(animate ? score : 0, 1400);
    useEffect(() => {
        const t = setTimeout(() => setAnimate(true), delay);
        return () => clearTimeout(t);
    }, [delay]);

    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const progress = animate ? ((score / 100) * circumference) : 0;

    return (
        <div className="score-ring-item">
            <div className="score-ring-wrapper">
                <svg width="96" height="96" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r={radius} fill="none" stroke="#1E293B" strokeWidth="5" />
                    <motion.circle
                        cx="48" cy="48" r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: circumference - progress }}
                        transition={{ duration: 1.4, delay: delay / 1000, ease: 'easeOut' }}
                        transform="rotate(-90 48 48)"
                    />
                    <text x="48" y="44" textAnchor="middle" fill={color} fontSize="18" fontWeight="900" fontFamily="Inter, sans-serif">{count}</text>
                    <text x="48" y="60" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="700">/ 100</text>
                </svg>
                <div className="score-ring-icon">{icon}</div>
            </div>
            <span className="score-ring-label">{label}</span>
        </div>
    );
}

function SelfDiagnosisPage() {
    const navigate = useNavigate();
    // 헤더 로그인/로그아웃(결정 C·D): 대시보드와 동일한 auth 연동 + 공용 AuthModal.
    const [isAuthed, setIsAuthed] = useState(() => authStore.isLoggedIn());
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    useEffect(() => authStore.subscribe(() => setIsAuthed(authStore.isLoggedIn())), []);
    const handleAuthClick = () => {
        if (isAuthed) {
            authStore.logout();
            afterLogout();
            navigate('/');
        } else {
            setIsAuthModalOpen(true); // 현재 페이지 위에 로그인 모달 오픈(랜딩 이동 없음)
        }
    };
    const handleAuthSuccess = async () => { await afterLogin(); };
    // 재방문 시 저장된 프로필로 프리필(없으면 기본값).
    const savedProfile = getProfile();
    // 랜딩→자가진단 프리필(D3): 정밀 age 없으면 랜딩 ageRange 중앙값으로, 정밀 region 없으면
    // 랜딩 regions가 "단일일 때만" 프리필. (derive 헬퍼로 소비 — 원시 필드 직접 접근 금지)
    const dAge = deriveAgeRange(savedProfile);
    // 열린 구간("만 65세 이상" = 65~100)은 중앙값이 비현실적이라 하한으로 프리필.
    const prefAge = dAge ? (dAge.max >= 100 ? dAge.min : Math.round((dAge.min + dAge.max) / 2)) : 25;
    const dRegions = deriveRegions(savedProfile);
    const prefRegion = dRegions.length === 1 ? dRegions[0] : '서울';
    const [step, setStep] = useState(0);
    const [ageStr, setAgeStr] = useState(() => String(prefAge));
    const [formData, setFormData] = useState(() => ({
        targetGroup: '청년', // 문항 미노출(D4) — 스키마 하위호환용 고정값. 신규 판정 미사용.
        employment: '미취업',
        income: '200~300만 원',        // 공고문 대조용(향후 워크벤치 대조) — API 판정 미사용
        householdSize: '1인 가구',      // 공고문 대조용(향후 워크벤치 대조)
        household: '1인 가구(독립)',     // 공고문 대조용(향후 워크벤치 대조)
        marriage: '미혼', // 하위호환용 스키마 필드(문항은 제거) — 기존 저장값 파괴 방지
        assets: '1.5억 이하',          // 공고문 대조용(향후 워크벤치 대조)
        education: '대학 졸업',
        special: [],                   // 공고문 대조용(향후 워크벤치 대조)
        ...(savedProfile || {}),
        // 프리필은 마지막에 덮어써 항상 적용(랜딩 승격값 우선; 자가진단 저장분이면 동일값으로 무해).
        age: prefAge,
        region: prefRegion,
    }));

    // 랜딩과 일관: 17개 시·도 전체 커버(regionToZipCd가 시·도명 → zipCd 매핑).
    const regions = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
    const employmentStatus = ['재학중', '미취업', '중소기업 재직', '대기업 재직', '창업자', '기타'];
    // 학력(schoolCd 대응) — 재학·졸업 조건 정책 대조용. profile.education에 저장.
    const educationLevels = ['고졸 이하', '대학 재학', '대학 졸업', '대학원 이상'];
    const incomeLevels = ['100만 원 이하', '100~200만 원', '200~300만 원', '300~400만 원', '400만 원 이상', '잘 모르겠어요'];
    const householdSizes = ['1인 가구', '2인 가구', '3인 이상'];
    const householdTypes = ['부모와 동거', '배우자/자녀와 거주', '비가족과 동거', '1인 가구(독립)', '기타'];
    const specialConditions = [
        { id: 'low_income', label: '기초생활수급/차상위', icon: '🛡️' },
        { id: 'veteran', label: '국가유공자/보훈대상', icon: '🏅' },
        { id: 'disability', label: '장애 등록 대상', icon: '♿' },
        { id: 'family_care', label: '가족 돌봄', icon: '👨‍👩‍👧' },
        { id: 'multi_child', label: '다자녀 가구', icon: '👶' },
        { id: 'self_reliance', label: '자립준비청년', icon: '🌱' }
    ];

    const handleToggleSpecial = (id) => {
        setFormData(prev => ({
            ...prev,
            special: prev.special.includes(id)
                ? prev.special.filter(s => s !== id)
                : [...prev.special, id]
        }));
    };

    const handleStartDiagnosis = () => {
        // 설문 입력값을 실프로필로 저장(위젯·추천·판정에서 사용).
        saveProfile(formData);
        setStep(1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const userSpecsSummary = [
        { label: '거주', value: formData.region, icon: '📍' },
        { label: '상태', value: formData.employment, icon: '💼' },
        { label: '소득', value: formData.income, icon: '💰' },
    ];

    // 분야별 실집계(프록시 :3002 실호출). null=집계 중, 이후 [{key,ok,total,eligible,pct}].
    const [categoryStats, setCategoryStats] = useState(null);

    // 결과 단계 진입 시 지역 기준 정책 샘플을 실호출 → 분야별로 분류하고
    // verdictEngine 통과 비율/건수를 집계. 프록시 미기동·에러 → 전체 "집계 불가"(고정값 부활 없음).
    useEffect(() => {
        if (step !== 1) return;
        let cancelled = false;
        const zip = regionToZipCd(formData.region);
        (async () => {
            try {
                const base = { pageNum: 1, pageSize: SAMPLE_SIZE, rtnType: 'json' };
                // 1) 지역(zipCd)으로 조회. 2) 0건이면 무필터로 재조회(빈 집계 방지).
                let res = await getPolicies(zip ? { ...base, zipCd: zip } : base);
                let policies = Array.isArray(res?.policies) ? res.policies : [];
                if (policies.length === 0 && zip) {
                    res = await getPolicies(base);
                    policies = Array.isArray(res?.policies) ? res.policies : [];
                }
                const stats = CATEGORY_DEFS.map((c) => {
                    const { total, eligible } = countEligible(policies, formData, c.lclsf);
                    const pct = total ? Math.round((eligible / total) * 100) : 0;
                    return { key: c.key, ok: true, total, eligible, pct };
                });
                if (!cancelled) setCategoryStats(stats);
            } catch {
                if (!cancelled) setCategoryStats(CATEGORY_DEFS.map(c => ({ key: c.key, ok: false })));
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    // 집계 조회 헬퍼.
    const statOf = (key) => (categoryStats ? categoryStats.find(s => s.key === key) : null);
    const pctOf = (key) => { const s = statOf(key); return s && s.ok ? s.pct : 0; };
    const countLabel = (key) => {
        const s = statOf(key);
        if (categoryStats === null) return '집계 중';
        return s && s.ok ? `${s.eligible}건` : '집계 불가';
    };
    const totalEligible = categoryStats
        ? categoryStats.reduce((a, s) => a + (s.ok ? s.eligible : 0), 0)
        : null;
    // 신청 가능 건수가 가장 많은 분야(결론 문구용).
    const topCat = categoryStats
        ? CATEGORY_DEFS
            .map(c => ({ c, s: statOf(c.key) }))
            .filter(x => x.s && x.s.ok && x.s.eligible > 0)
            .sort((a, b) => b.s.eligible - a.s.eligible)[0]?.c || null
        : null;

    // 본인 선택 소득 구간의 상대적 위치(또래 비교 아님 — 실계산 불가 명시).
    const incomeIdx = INCOME_ORDER.indexOf(formData.income);
    const incomePos = incomeIdx >= 0 ? Math.round(((incomeIdx + 0.5) / INCOME_ORDER.length) * 100) : 50;

    // 진단 기반 실카운트(store 실데이터). 렌더 시 localStorage 1회 집계.
    const storeCounts = useMemo(() => {
        const docs = listDocuments();
        return {
            saved: listSaved().length,
            analyzed: docs.length,
            completed: docs.filter(d => d.status === 'completed').length,
            upcoming: listUpcomingEvents(new Date(), 99).length,
        };
    }, []);

    // 사이드바 지표: 실측 가능한 store 카운트로 대체(가짜 데이터 제거).
    const aiMetrics = [
        { label: '내가 찜한 공고', value: `${storeCounts.saved}건` },
        { label: '분석한 문서', value: `${storeCounts.analyzed}건` },
        { label: '검토 완료', value: `${storeCounts.completed}건` },
    ];

    return (
        <div className="sd-page-wrapper">
            {/* Header */}
            <header className="sd-header">
                <div className="sd-header-left">
                    <div className="sd-logo" onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                    </div>
                </div>

                <div className="sd-header-right">
                    <PersonaWidget />
                    <button className="nav-btn primary" onClick={handleAuthClick}>{isAuthed ? '로그아웃' : '로그인'}</button>
                </div>
            </header>

            {/* 로그인 모달(결정 D): 현재 페이지 위에 오픈 — 성공 시 페이지 유지. */}
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onSuccess={handleAuthSuccess}
                initialMode="login"
            />

            <AnimatePresence mode="wait">
                {step === 0 ? (
                    <motion.main
                        key="step1"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="sd-main input-step"
                    >
                        <div className="sd-page-header">
                            <div className="sd-title-group">
                                <div className="sd-title-badge">
                                    <span className="badge-dot" />
                                    공공데이터 매칭
                                </div>
                                <h1>맞춤서비스</h1>
                                <p>나이, 소득, 가구 형태, 거주 조건을 바탕으로 나에게 유리한 정책군을 진단하세요.</p>
                            </div>
                        </div>

                        <div className="input-layout">
                            {/* LEFT: Input Sections */}
                            <div className="input-main">
                                {/* Basic Info */}
                                <section className="input-section">
                                    <div className="section-header-compact">
                                        <div className="section-label-row">
                                            <span className="section-step-badge">01</span>
                                            <h3 className="section-title">기본 정보</h3>
                                        </div>
                                        <p className="section-desc">연령과 거주 지역, 학력을 기준으로 정책 범위를 점검합니다.</p>
                                    </div>
                                    <div className="input-card-group">
                                        <div className="input-row">
                                            <label>나이 (만)</label>
                                            <div className="age-slider-box">
                                                <input
                                                    type="range" min="15" max="100" value={formData.age}
                                                    onChange={(e) => {
                                                        setFormData({ ...formData, age: e.target.value });
                                                        setAgeStr(e.target.value);
                                                    }}
                                                />
                                                <div className="age-display">
                                                    <input
                                                        type="number"
                                                        min="15"
                                                        max="100"
                                                        value={ageStr}
                                                        onChange={(e) => {
                                                            const valStr = e.target.value;
                                                            setAgeStr(valStr);
                                                            const valNum = Number(valStr);
                                                            if (valNum >= 15 && valNum <= 100) {
                                                                setFormData({ ...formData, age: valNum });
                                                            }
                                                        }}
                                                        onBlur={(e) => {
                                                            const val = Math.min(100, Math.max(15, Number(e.target.value) || 25));
                                                            setFormData({ ...formData, age: val });
                                                            setAgeStr(String(val));
                                                        }}
                                                        className="age-input"
                                                    />
                                                    <span className="age-unit">세</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="input-row">
                                            <label>거주 지역</label>
                                            <div className="tag-group">
                                                {regions.map(r => (
                                                    <motion.button
                                                        key={r}
                                                        whileTap={{ scale: 0.95 }}
                                                        className={`tag-item ${formData.region === r ? 'active' : ''}`}
                                                        onClick={() => setFormData({ ...formData, region: r })}
                                                    >
                                                        {r}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="input-row">
                                            <label>학력</label>
                                            <div className="tag-group">
                                                {educationLevels.map(e => (
                                                    <motion.button
                                                        key={e}
                                                        whileTap={{ scale: 0.95 }}
                                                        className={`tag-item ${formData.education === e ? 'active' : ''}`}
                                                        onClick={() => setFormData({ ...formData, education: e })}
                                                    >
                                                        {e}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Financial Info */}
                                <section className="input-section">
                                    <div className="section-header-compact">
                                        <div className="section-label-row">
                                            <span className="section-step-badge">02</span>
                                            <h3 className="section-title">경제적 상황</h3>
                                        </div>
                                        <p className="section-desc">취업 상태와 소득 수준에 따라 지원 우선순위가 달라집니다.</p>
                                    </div>
                                    <div className="input-card-group">
                                        <div className="input-row">
                                            <label>취업 상태</label>
                                            <div className="tag-group">
                                                {employmentStatus.map(s => (
                                                    <motion.button
                                                        key={s}
                                                        whileTap={{ scale: 0.95 }}
                                                        className={`tag-item ${formData.employment === s ? 'active' : ''}`}
                                                        onClick={() => setFormData({ ...formData, employment: s })}
                                                    >
                                                        {s}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="input-row">
                                            <label>소득 수준 (월 평균 실링액)</label>
                                            <div className="select-box-group">
                                                {['100만 원 이하', '100~200만 원', '200~300만 원', '300~400만 원', '400만 원 이상', '잘 모르겠어요'].map(i => (
                                                    <motion.div
                                                        key={i}
                                                        whileHover={{ translateY: -2 }}
                                                        whileTap={{ scale: 0.98 }}
                                                        className={`select-card ${formData.income === i ? 'active' : ''}`}
                                                        onClick={() => setFormData({ ...formData, income: i })}
                                                    >
                                                        <span className="sc-label">{i}</span>
                                                        {formData.income === i && <span className="sc-check">✓</span>}
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Household Info */}
                                <section className="input-section">
                                    <div className="section-header-compact">
                                        <div className="section-label-row">
                                            <span className="section-step-badge">03</span>
                                            <h3 className="section-title">가구 형태</h3>
                                        </div>
                                        <p className="section-desc">가구 구성과 주거 형태는 주거·복지 정책의 지원 기준이 됩니다.</p>
                                    </div>
                                    <div className="input-card-group">
                                        <div className="input-row">
                                            <label>가구원 수</label>
                                            <div className="tag-group">
                                                {householdSizes.map(s => (
                                                    <motion.button
                                                        key={s}
                                                        whileTap={{ scale: 0.95 }}
                                                        className={`tag-item ${formData.householdSize === s ? 'active' : ''}`}
                                                        onClick={() => setFormData({ ...formData, householdSize: s })}
                                                    >
                                                        {s}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="input-row">
                                            <label>가구 형태 (구성)</label>
                                            <div className="tag-group">
                                                {householdTypes.map(h => (
                                                    <motion.button
                                                        key={h}
                                                        whileTap={{ scale: 0.95 }}
                                                        className={`tag-item ${formData.household === h ? 'active' : ''}`}
                                                        onClick={() => setFormData({ ...formData, household: h })}
                                                    >
                                                        {h}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Special Conditions */}
                                <section className="input-section">
                                    <div className="section-header-compact">
                                        <div className="section-label-row">
                                            <span className="section-step-badge">04</span>
                                            <h3 className="section-title">특수 조건</h3>
                                        </div>
                                        <p className="section-desc">해당하는 조건을 모두 선택하세요. 가산점 및 우선 지원 대상 여부에 반영됩니다.</p>
                                    </div>
                                    <div className="input-card-group">
                                        <div className="input-row">
                                            <div className="tag-group">
                                                {specialConditions.map(s => (
                                                    <motion.button
                                                        key={s.id}
                                                        whileTap={{ scale: 0.95 }}
                                                        className={`tag-item special ${formData.special.includes(s.id) ? 'active' : ''}`}
                                                        onClick={() => handleToggleSpecial(s.id)}
                                                    >
                                                        {s.icon} {s.label}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* RIGHT: Summary + CTA Panel */}
                            <aside className="input-sidebar">
                                <div className="sidebar-panel">
                                    {/* AI Engine Badge */}
                                    <div className="ai-engine-badge-section">
                                        <div className="ai-engine-badge">
                                            <div className="ai-engine-pulse">
                                                <span className="ae-dot" />
                                                <span className="ae-ring" />
                                            </div>
                                            <div className="ai-engine-text">
                                                <div className="ae-title">CLUE 매칭 엔진 · 가동 중</div>
                                                <div className="ae-sub">온통청년 공공데이터 기반 정책 매칭</div>
                                            </div>
                                        </div>
                                        <div className="ai-metrics-row">
                                            {aiMetrics.map((m, i) => (
                                                <div key={i} className="ai-metric-item">
                                                    <div className="ami-value">{m.value}</div>
                                                    <div className="ami-label">{m.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Condition Summary */}
                                    <div className="summary-section">
                                        <div className="summary-header">
                                            <span className="summary-icon">🗂️</span>
                                            <h4>내 조건 요약</h4>
                                        </div>
                                        <div className="summary-items">
                                            <div className="summary-item">
                                                <span className="si-label">나이</span>
                                                <span className="si-value">{formData.age}세</span>
                                            </div>
                                            <div className="summary-item">
                                                <span className="si-label">거주</span>
                                                <span className="si-value">{formData.region}</span>
                                            </div>
                                            <div className="summary-item">
                                                <span className="si-label">학력</span>
                                                <span className="si-value">{formData.education}</span>
                                            </div>
                                            <div className="summary-item">
                                                <span className="si-label">취업</span>
                                                <span className="si-value">{formData.employment}</span>
                                            </div>
                                            <div className="summary-item">
                                                <span className="si-label">소득</span>
                                                <span className="si-value">{formData.income || '미선택'}</span>
                                            </div>
                                            <div className="summary-item">
                                                <span className="si-label">가구</span>
                                                <div className="si-value">
                                                    <div style={{ fontWeight: '700' }}>{formData.householdSize}</div>
                                                    <div style={{ fontWeight: '700' }}>({formData.household})</div>
                                                </div>
                                            </div>
                                            {formData.special.length > 0 && (
                                                <div className="summary-item summary-item--special">
                                                    <span className="si-label">특수</span>
                                                    <div className="si-tags">
                                                        {formData.special.map(id => {
                                                            const found = specialConditions.find(s => s.id === id);
                                                            return found ? <span key={id} className="si-tag">{found.icon} {found.label}</span> : null;
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Policy Type Preview */}
                                    <div className="policy-preview-section">
                                        <div className="summary-header">
                                            <span className="summary-icon">🎯</span>
                                            <h4>진단될 정책군</h4>
                                        </div>
                                        <div className="policy-tags">
                                            <span className="policy-tag">주거 지원</span>
                                            <span className="policy-tag">취업·교육</span>
                                            <span className="policy-tag">금융·자산</span>
                                            <span className="policy-tag">복지·생활</span>
                                        </div>
                                        <p className="policy-hint">입력 조건에 따라 우선 적합 정책군이 자동 분류됩니다.</p>
                                    </div>

                                    {/* CTA */}
                                    <div className="sidebar-cta">
                                        <button className="diagnosis-start-btn" onClick={handleStartDiagnosis}>
                                            <span className="dsb-icon">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 8v4l3 3" /><circle cx="18" cy="6" r="4" fill="currentColor" stroke="none" />
                                                </svg>
                                            </span>
                                            AI 자가진단 시작하기
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                                        </button>
                                        <div className="sidebar-cta-hints">
                                            <span className="cta-hint-item">⚡ 실시간 공공데이터 집계</span>
                                            <span className="cta-hint-dot">·</span>
                                            <span className="cta-hint-item">🔒 브라우저에만 저장</span>
                                        </div>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </motion.main>
                ) : (
                    <motion.main
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="sd-main result-step"
                    >
                        <div className="sd-page-header">
                            <div className="sd-title-group">
                                <div className="sd-title-badge result">
                                    <span className="badge-dot green" />
                                    AI 분석 완료 · {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 기준
                                </div>
                                <h1>맞춤서비스</h1>
                                <p>온통청년 공공데이터를 실시간 집계한 결과입니다. 분야별 신청 가능 정책 수를 확인하세요.</p>
                            </div>
                        </div>

                        {/* Top Conclusion Card */}
                        <section className="sd-card-premium report-banner">
                            <div className="report-banner-content">
                                <div className="report-text-side">
                                    <div className="ai-tag highlight">
                                        <span className="ai-tag-dot" />
                                        진단 결과: {formData.region} 거주 {formData.employment} 기준 분석 결과
                                    </div>
                                    <h1 className="report-main-title">
                                        {topCat
                                            ? <>회원님 조건으로 <span className="highlight-blue">{topCat.label}</span> 분야에<br />신청 가능한 정책이 가장 많습니다.</>
                                            : <>회원님 조건으로 신청 가능한<br />정책을 <span className="highlight-blue">집계</span>하고 있습니다.</>}
                                    </h1>
                                    <div className="evidence-summary">
                                        {userSpecsSummary.map((spec, i) => (
                                            <div key={i} className="evidence-pill">
                                                <span className="e-icon">{spec.icon}</span>
                                                <span className="e-label">{spec.label}:</span>
                                                <span className="e-val">{spec.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="report-score-side">
                                    {CATEGORY_DEFS.map((def, i) => {
                                        const s = statOf(def.key);
                                        const loading = categoryStats === null;
                                        const score = s && s.ok ? s.pct : 0;
                                        const label = loading
                                            ? `${def.label} · 집계 중`
                                            : s && s.ok
                                                ? `${def.label} · ${s.eligible}건 신청 가능`
                                                : `${def.label} · 집계 불가`;
                                        return <ScoreRing key={def.key} score={score} color={def.color} label={label} icon={def.icon} delay={i * 200} />;
                                    })}
                                </div>
                            </div>
                            <div className="glass-glow" />
                        </section>

                        <div className="sd-grid">
                            {/* Left: Actionable Insights */}
                            <section className="sd-status-section">
                                <div className="section-header">
                                    <h3 className="section-title">핵심 진단 근거 및 분석</h3>
                                    <span className="status-complete">
                                        <span className="status-dot" />
                                        AI 분석 완료
                                    </span>
                                </div>
                                <div className="analysis-box">
                                    <motion.div className="analysis-item" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                                        <div className="a-bullet">1</div>
                                        <div className="a-content">
                                            <strong>{formData.region} 주거 분야 {countLabel('housing')} 신청 가능</strong>
                                            <p>{formData.region} 지역 주거 정책 중 회원님 조건(연령·소득 기준)으로 신청 가능성이 높은 공고를 집계했습니다.</p>
                                            <div className="a-confidence">
                                                <div className="conf-bar"><div className="conf-fill" style={{ width: `${pctOf('housing')}%`, background: '#60A5FA' }} /></div>
                                                <span>신청 가능 비율 {pctOf('housing')}%</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                    <motion.div className="analysis-item" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                        <div className="a-bullet">2</div>
                                        <div className="a-content">
                                            <strong>금융·자산 분야 {countLabel('finance')} 신청 가능</strong>
                                            <p>{formData.household} 조건 기준 금융·복지 분야에서 신청 가능성이 높은 지원 정책을 집계했습니다.</p>
                                            <div className="a-confidence">
                                                <div className="conf-bar"><div className="conf-fill" style={{ width: `${pctOf('finance')}%`, background: '#34D399' }} /></div>
                                                <span>신청 가능 비율 {pctOf('finance')}%</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                    <motion.div className="analysis-item" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                                        <div className="a-bullet">3</div>
                                        <div className="a-content">
                                            <strong>취업·교육 분야 {countLabel('job')} 신청 가능</strong>
                                            <p>{formData.employment} 상태 기준 일자리·교육 분야에서 신청 가능성이 높은 공고를 집계했습니다.</p>
                                            <div className="a-confidence">
                                                <div className="conf-bar"><div className="conf-fill" style={{ width: `${pctOf('job')}%`, background: '#FBBF24' }} /></div>
                                                <span>신청 가능 비율 {pctOf('job')}%</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                </div>

                                <div className="action-button-group">
                                    <button className="primary-action-btn" onClick={() => navigate('/dashboard')}>추천 정책 리스트 바로보기</button>
                                    <button className="secondary-action-btn" onClick={() => setStep(0)}>내 조건 다시 수정하기</button>
                                </div>
                            </section>

                            {/* Right: Supplementary Data */}
                            <section className="sd-insight-section">
                                {/* AI Briefing */}
                                <div className="sd-card-premium ai-briefing">
                                    <div className="briefing-header">
                                        <div className="briefing-header-left">
                                            <div className="briefing-ai-icon">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h4>진단 요약</h4>
                                                <p className="briefing-model-tag">온통청년 공공데이터 기준</p>
                                            </div>
                                        </div>
                                        <span className="pulsing-dot-brief" />
                                    </div>
                                    <div className="briefing-divider" />
                                    <p className="briefing-content">
                                        회원님이 입력하신 <strong>{formData.income}</strong> 소득 구간과 <strong>{formData.region}</strong> 거주 조건으로, 주거·금융·취업 분야에서 신청 가능성이 높은 정책 <strong>{totalEligible === null ? '집계 중' : `${totalEligible}건`}</strong>을 확인했습니다. 아래 게이지에서 분야별 신청 가능 비율을 확인하고, 추천 리스트에서 실제 공고를 살펴보세요.
                                    </p>
                                    <div className="briefing-footer">
                                        <span className="bf-item">📊 온통청년 공공데이터 기준</span>
                                        <span className="bf-sep">|</span>
                                        <span className="bf-item">🕐 방금 집계됨</span>
                                    </div>
                                </div>

                                {/* Peer Income Position */}
                                <div className="sd-card-premium insight-box mini">
                                    <div className="insight-header-row">
                                        <h4 className="insight-title small">선택한 소득 구간 위치</h4>
                                        <span className="insight-badge">입력 기준</span>
                                    </div>
                                    <div className="peer-gauge-wrapper">
                                        <div className="gauge-track">
                                            <div className="gauge-fill-bar" style={{ width: `${incomePos}%` }} />
                                            <div className="gauge-marker" style={{ left: `${incomePos}%` }} />
                                        </div>
                                        <div className="gauge-labels-row">
                                            <span>낮음</span>
                                            <span className="gauge-center-label">소득 구간</span>
                                            <span>높음</span>
                                        </div>
                                        <div className="gauge-desc">선택하신 소득 구간(<strong>{formData.income}</strong>)의 상대적 위치입니다. 또래 비교 통계는 아직 제공되지 않습니다.</div>
                                    </div>
                                </div>

                                {/* Quick Stats */}
                                <div className="sd-card-premium quick-stats-card">
                                    <h4 className="qs-title">진단 기반 데이터</h4>
                                    <div className="qs-grid">
                                        <div className="qs-item">
                                            <div className="qs-val">{totalEligible === null ? '—' : `${totalEligible}개`}</div>
                                            <div className="qs-label">신청 가능 정책</div>
                                        </div>
                                        <div className="qs-item">
                                            <div className="qs-val">{storeCounts.saved}개</div>
                                            <div className="qs-label">찜한 공고</div>
                                        </div>
                                        <div className="qs-item">
                                            <div className="qs-val">{storeCounts.upcoming}개</div>
                                            <div className="qs-label">다가오는 마감</div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </motion.main>
                )}
            </AnimatePresence>
        </div>
    );
}

export default SelfDiagnosisPage;
