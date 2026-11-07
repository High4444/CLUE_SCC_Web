import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as authStore from '../store/authStore';
import { setSetting } from '../store/settingsStore';

// 공용 인증 모달(로그인/회원가입). StartPage에서 추출 — 마크업·스타일·동작 완전 동일.
// 대시보드·자가진단 헤더에서도 현재 페이지 위에 즉시 오픈해 재사용한다(랜딩 이동 없음).
//
// props:
//   isOpen        모달 표시 여부
//   onClose       배경/닫기 버튼 클릭 시 호출
//   onSuccess     로그인/가입 성공 후처리(async). 호출 후 모달을 닫는다.
//                 StartPage=afterLogin+대시보드 이동 / 대시보드·자가진단=afterLogin(현재 페이지 유지).
//   initialMode   'login' | 'signup' (열릴 때 초기 탭)
const AuthModal = ({ isOpen, onClose, onSuccess, initialMode = 'login' }) => {
    const [authMode, setAuthMode] = useState(initialMode);
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    // 가입 폼 축소(P4-2): 서버로 전송되는 필드(이메일·비밀번호)만 수집. 이름·성별·휴대폰·생년월일·직업 제거.
    // 약관 동의는 필수(이용약관·개인정보) 검증 대상, 마케팅 동의는 선택(settingsStore.marketing에 반영).
    const [signUpForm, setSignUpForm] = useState({
        email: '', password: '', passwordConfirm: '',
        agreements: { all: false, terms: false, privacy: false, marketing: false }
    });
    const [authError, setAuthError] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    // 열릴 때마다 초기 탭·에러 리셋(폼 값은 유지되지 않도록 정리).
    useEffect(() => {
        if (isOpen) {
            setAuthMode(initialMode);
            setAuthError('');
        }
    }, [isOpen, initialMode]);

    const switchAuthMode = (mode) => { setAuthMode(mode); setAuthError(''); };

    // 로그인/가입 성공 공통 후처리: 부모 onSuccess(병합·이동 등) → 모달 닫기.
    const finishAuth = async () => {
        if (onSuccess) await onSuccess();
        onClose();
    };

    const handleLogin = async () => {
        if (authLoading) return;
        setAuthError('');
        const email = loginForm.email.trim();
        if (!email || !loginForm.password) { setAuthError('이메일과 비밀번호를 입력해 주세요.'); return; }
        setAuthLoading(true);
        try {
            await authStore.login(email, loginForm.password);
            await finishAuth();
        } catch (err) {
            setAuthError(err?.message || '로그인에 실패했습니다.');
        } finally {
            setAuthLoading(false);
        }
    };

    const handleSignup = async () => {
        if (authLoading) return;
        setAuthError('');
        const email = signUpForm.email.trim();
        if (!email || !signUpForm.password) { setAuthError('이메일과 비밀번호를 입력해 주세요.'); return; }
        if (signUpForm.password.length < 8) { setAuthError('비밀번호는 8자 이상이어야 합니다.'); return; }
        if (signUpForm.password !== signUpForm.passwordConfirm) { setAuthError('비밀번호가 일치하지 않습니다.'); return; }
        // 필수 약관 검증(P4-2): 이용약관·개인정보 미동의 시 가입 차단(인라인 에러).
        if (!signUpForm.agreements.terms || !signUpForm.agreements.privacy) {
            setAuthError('이용약관과 개인정보 수집·이용에 동의해 주세요.');
            return;
        }
        setAuthLoading(true);
        try {
            await authStore.signup(email, signUpForm.password);
            // 마케팅 동의값을 설정에 반영(선택 동의의 실체 기록, ServiceSettings와 양방향 동기화).
            setSetting('marketing', !!signUpForm.agreements.marketing);
            await finishAuth();
        } catch (err) {
            setAuthError(err?.message || '회원가입에 실패했습니다.');
        } finally {
            setAuthLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="auth-backdrop"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(12px)',
                        zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
                    }}
                >
                    <motion.div
                        key="auth-card"
                        layout
                        initial={{ scale: 0.95, y: 40, opacity: 0 }}
                        animate={{
                            scale: 1,
                            y: 0,
                            opacity: 1,
                            maxWidth: '480px'
                        }}
                        exit={{ scale: 0.95, y: 40, opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%',
                            background: 'rgba(255, 255, 255, 0.98)',
                            border: '1px solid rgba(255, 255, 255, 0.5)', borderRadius: '40px',
                            position: 'relative',
                            boxShadow: '0 40px 100px -20px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.4)',
                            overflow: 'hidden',
                            display: 'flex',
                            minHeight: '600px'
                        }}
                    >
                        {/* Decorative liquid orb inside modal */}
                        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

                        {/* Close */}
                        <button
                            onClick={onClose}
                            style={{ position: 'absolute', top: '32px', right: '32px', background: '#F8FAFC', border: 'none', borderRadius: '14px', color: '#64748B', cursor: 'pointer', fontSize: '1.25rem', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', zIndex: 10 }}
                        >&times;</button>

                        <AnimatePresence mode="wait">
                            {authMode === 'login' ? (
                                <motion.div
                                    key="login-content"
                                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.3 }}
                                    style={{ width: '100%', padding: '56px 48px' }}
                                >
                                    {/* Header space */}
                                    <div style={{ height: '32px' }} />
                                    <div style={{ marginBottom: '32px' }}>
                                        <h2 style={{ fontSize: '1.625rem', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>다시 만나서 반가워요! 👋</h2>
                                        <p style={{ color: '#64748B', fontSize: '0.875rem', fontWeight: 500 }}>계속하시려면 로그인해 주세요.</p>
                                    </div>

                                    <div style={{ marginBottom: '20px' }}>
                                        <label style={labelStyle}>이메일</label>
                                        <input
                                            id="login-email"
                                            type="email" placeholder="example@email.com"
                                            value={loginForm.email}
                                            onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                                            style={modalInputStyle}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '32px' }}>
                                        <label style={labelStyle}>비밀번호</label>
                                        <input
                                            id="login-password"
                                            type="password" placeholder="••••••••"
                                            value={loginForm.password}
                                            onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                                            style={modalInputStyle}
                                        />
                                    </div>
                                    {authError && <div style={authErrorStyle}>{authError}</div>}
                                    <motion.button
                                        whileHover={authLoading ? undefined : { scale: 1.02, boxShadow: '0 12px 30px -4px rgba(37, 99, 235, 0.4)' }}
                                        whileTap={authLoading ? undefined : { scale: 0.98 }}
                                        onClick={handleLogin}
                                        disabled={authLoading}
                                        style={{ ...primaryButtonStyle, opacity: authLoading ? 0.6 : 1, cursor: authLoading ? 'default' : 'pointer' }}
                                    >
                                        {authLoading ? '로그인 중…' : '로그인하기'}
                                    </motion.button>

                                    {/* Divider and Redirect to Signup */}
                                    <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid #F1F5F9', textAlign: 'center' }}>
                                        <p style={{ color: '#94A3B8', fontSize: '0.875rem', marginBottom: '16px' }}>아직 계정이 없으신가요?</p>
                                        <motion.button
                                            whileHover={{ scale: 1.02, backgroundColor: '#F8FAFC' }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => switchAuthMode('signup')}
                                            style={{
                                                width: '100%', padding: '16px', borderRadius: '16px',
                                                border: '2px solid #F1F5F9', background: 'white',
                                                color: '#0F172A', fontSize: '0.9375rem', fontWeight: 800,
                                                cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                        >
                                            회원가입하기
                                        </motion.button>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="signup-content"
                                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}
                                    style={{ width: '100%', padding: '40px 48px', overflowY: 'auto', maxHeight: '80vh' }}
                                >
                                    <div style={{ marginBottom: '32px' }}>
                                        <h3 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>회원가입</h3>
                                        <p style={{ color: '#64748B', fontSize: '0.9375rem', fontWeight: 500 }}>이메일과 비밀번호만으로 바로 시작할 수 있어요.</p>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        <div>
                                            <label style={labelStyle}>이메일 주소</label>
                                            <input
                                                type="email" placeholder="clue@example.com"
                                                value={signUpForm.email}
                                                onChange={e => setSignUpForm(f => ({ ...f, email: e.target.value }))}
                                                style={modalInputStyle}
                                            />
                                        </div>

                                        {/* Password */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={labelStyle}>비밀번호</label>
                                                <input
                                                    type="password" placeholder="8자 이상"
                                                    value={signUpForm.password}
                                                    onChange={e => setSignUpForm(f => ({ ...f, password: e.target.value }))}
                                                    style={modalInputStyle}
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>비밀번호 확인</label>
                                                <input
                                                    type="password" placeholder="••••••••"
                                                    value={signUpForm.passwordConfirm}
                                                    onChange={e => setSignUpForm(f => ({ ...f, passwordConfirm: e.target.value }))}
                                                    style={modalInputStyle}
                                                />
                                            </div>
                                        </div>

                                        {/* Agreements */}
                                        <div style={{
                                            marginTop: '12px', padding: '20px', background: '#F8FAFC',
                                            borderRadius: '20px', border: '1px solid #F1F5F9'
                                        }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={signUpForm.agreements.all}
                                                    onChange={e => {
                                                        const val = e.target.checked;
                                                        setSignUpForm(f => ({
                                                            ...f,
                                                            agreements: { all: val, terms: val, privacy: val, marketing: val }
                                                        }));
                                                    }}
                                                    style={{ width: '18px', height: '18px', accentColor: '#2563EB' }}
                                                />
                                                <span style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0F172A' }}>약관 전체 동의</span>
                                            </label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '28px' }}>
                                                {[
                                                    { key: 'terms', text: '(필수) 이용약관 동의' },
                                                    { key: 'privacy', text: '(필수) 개인정보 수집 및 이용 동의' },
                                                    { key: 'marketing', text: '(선택) 마케팅 정보 수신 동의' }
                                                ].map(item => (
                                                    <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={signUpForm.agreements[item.key]}
                                                            onChange={e => setSignUpForm(f => {
                                                                const next = { ...f.agreements, [item.key]: e.target.checked };
                                                                next.all = next.terms && next.privacy && next.marketing;
                                                                return { ...f, agreements: next };
                                                            })}
                                                            style={{ width: '16px', height: '16px', accentColor: '#2563EB' }}
                                                        />
                                                        <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 500 }}>{item.text}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {authError && <div style={{ ...authErrorStyle, marginTop: '24px', marginBottom: 0 }}>{authError}</div>}
                                    <motion.button
                                        whileHover={authLoading ? undefined : { scale: 1.02, boxShadow: '0 12px 30px -4px rgba(37, 99, 235, 0.4)' }}
                                        whileTap={authLoading ? undefined : { scale: 0.98 }}
                                        onClick={handleSignup}
                                        disabled={authLoading}
                                        style={{ ...primaryButtonStyle, marginTop: '16px', opacity: authLoading ? 0.6 : 1, cursor: authLoading ? 'default' : 'pointer' }}
                                    >
                                        {authLoading ? '가입 중…' : '가입하고 시작하기'}
                                    </motion.button>

                                    <div style={{ marginTop: '24px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => switchAuthMode('login')}
                                            style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                                        >
                                            이미 계정이 있으신가요? 로그인하기
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const labelStyle = { display: 'block', color: '#475569', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '8px', marginLeft: '4px' };
const authErrorStyle = {
    background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626',
    fontSize: '0.8125rem', fontWeight: 600, borderRadius: '12px', padding: '12px 14px',
    marginBottom: '16px', textAlign: 'center', lineHeight: 1.4
};
const modalInputStyle = {
    width: '100%', padding: '16px 18px', borderRadius: '16px',
    background: '#F8FAFC', border: '1px solid #E2E8F0',
    color: '#0F172A', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
    transition: 'all 0.2s', fontFamily: 'inherit'
};
const primaryButtonStyle = {
    width: '100%', padding: '18px', backgroundColor: '#2563EB', color: '#FFFFFF',
    fontSize: '1rem', fontWeight: 800, borderRadius: '18px', border: 'none',
    cursor: 'pointer', boxShadow: '0 8px 20px -4px rgba(37, 99, 235, 0.2)'
};

export default AuthModal;
