import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { isLoggedIn, getUser, logout } from '../store/authStore';
import { afterLogout } from '../store/syncLayer';
import { authChangePassword, authDeleteAccount } from '../api/client';
import './AccountSettingsPage.css';

function AccountSettingsPage() {
    // 계정 상태(F5-d): 이메일 표시(읽기전용)·비밀번호 변경 실배선·회원 탈퇴(P4-6).
    // P4-7로 사진 변경·이름·휴대폰·2단계 인증·소셜 계정·로그인 기기 관리(가짜 블록) 전부 제거.
    const navigate = useNavigate();
    const loggedIn = isLoggedIn();
    const accountEmail = getUser()?.email || '';

    const [toast, setToast] = useState('');           // 표시 문구(빈 문자열이면 숨김)
    const [showPwForm, setShowPwForm] = useState(false);
    const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
    const [pwSaving, setPwSaving] = useState(false);
    const [pwError, setPwError] = useState('');

    // 회원 탈퇴(P4-6): 2단계 확인(경고 + 비밀번호 재확인) 모달.
    const [showWithdraw, setShowWithdraw] = useState(false);
    const [withdrawPw, setWithdrawPw] = useState('');
    const [withdrawError, setWithdrawError] = useState('');
    const [withdrawing, setWithdrawing] = useState(false);

    const flashToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    const handlePasswordChange = async () => {
        if (pwSaving) return;
        setPwError('');
        if (!loggedIn) { setPwError('로그인 후 이용할 수 있습니다.'); return; }
        if (!pwForm.current || !pwForm.next) { setPwError('현재 비밀번호와 새 비밀번호를 입력해 주세요.'); return; }
        if (pwForm.next.length < 8) { setPwError('새 비밀번호는 8자 이상이어야 합니다.'); return; }
        if (pwForm.next !== pwForm.confirm) { setPwError('새 비밀번호가 일치하지 않습니다.'); return; }
        setPwSaving(true);
        try {
            await authChangePassword(pwForm.current, pwForm.next);
            setPwForm({ current: '', next: '', confirm: '' });
            setShowPwForm(false);
            flashToast('비밀번호가 변경되었습니다.');
        } catch (err) {
            setPwError(err?.message || '비밀번호 변경에 실패했습니다.');
        } finally {
            setPwSaving(false);
        }
    };

    const openWithdraw = () => {
        setWithdrawPw('');
        setWithdrawError('');
        setShowWithdraw(true);
    };

    // 탈퇴 확정: 비밀번호 재확인 → DELETE /api/auth/me(전 데이터 CASCADE 삭제) → 로컬 정리 + 랜딩 이동.
    const handleWithdraw = async () => {
        if (withdrawing) return;
        setWithdrawError('');
        if (!withdrawPw) { setWithdrawError('비밀번호를 입력해 주세요.'); return; }
        setWithdrawing(true);
        try {
            await authDeleteAccount(withdrawPw);
            logout();          // 토큰 제거
            afterLogout();     // 계정 데이터 키 클리어 + 게스트 백업 복원
            navigate('/');     // 랜딩으로
        } catch (err) {
            setWithdrawError(err?.message || '탈퇴에 실패했습니다.');
            setWithdrawing(false);
        }
    };

    return (
        <div className="as-wrapper">
            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="as-toast"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="as-main">
                <div className="as-content-inner">

                    {/* Basic Info — 이메일(읽기전용)만 유지. 사진 변경·이름·휴대폰 제거(P4-7). */}
                    <section className="as-section">
                        <h3 className="as-section-title">기본 정보</h3>
                        <div className="as-card">
                            <div className="as-input-group">
                                <div className="as-input-row">
                                    <label>이메일</label>
                                    <input type="email" value={loggedIn ? accountEmail : ''} placeholder={loggedIn ? '' : '로그인이 필요합니다'} readOnly disabled />
                                    <span className="as-input-desc">{loggedIn ? '로그인 계정 이메일입니다.' : '로그인하면 계정 이메일이 표시됩니다.'}</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Security — 비밀번호 변경(실동작)만 유지. 2단계 인증 제거(P4-7). */}
                    <section className="as-section">
                        <h3 className="as-section-title">보안 및 인증</h3>
                        <div className="as-card">
                            <div className="as-menu-item" onClick={() => { if (loggedIn) { setPwError(''); setShowPwForm(v => !v); } else { flashToast('로그인 후 이용할 수 있습니다.'); } }}>
                                <div className="as-menu-text">
                                    <span className="as-menu-label">비밀번호 변경</span>
                                    <span className="as-menu-sub">{loggedIn ? '현재 비밀번호 확인 후 변경' : '로그인이 필요합니다'}</span>
                                </div>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                            {showPwForm && loggedIn && (
                                <div className="as-input-group" style={{ padding: '4px 0 16px' }}>
                                    <div className="as-input-row">
                                        <label>현재 비밀번호</label>
                                        <input type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} placeholder="현재 비밀번호" />
                                    </div>
                                    <div className="as-input-row">
                                        <label>새 비밀번호</label>
                                        <input type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} placeholder="8자 이상" />
                                    </div>
                                    <div className="as-input-row">
                                        <label>새 비밀번호 확인</label>
                                        <input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="새 비밀번호 재입력" />
                                    </div>
                                    {pwError && <span className="as-input-desc" style={{ color: '#DC2626', fontWeight: 700 }}>{pwError}</span>}
                                    <button className="as-avatar-edit-btn" style={{ alignSelf: 'flex-start', background: '#3B82F6', color: '#FFFFFF', opacity: pwSaving ? 0.6 : 1 }} onClick={handlePasswordChange} disabled={pwSaving}>
                                        {pwSaving ? '변경 중…' : '비밀번호 변경'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 회원 탈퇴(P4-6) — 비로그인 시 버튼 숨김. */}
                    {loggedIn && (
                        <div className="as-danger-zone">
                            <button className="as-withdraw-btn" onClick={openWithdraw}>서비스 탈퇴하기</button>
                        </div>
                    )}
                </div>
            </main>

            {/* 탈퇴 확인 모달(2단계: 경고 + 비밀번호 재확인) */}
            <AnimatePresence>
                {showWithdraw && (
                    <motion.div
                        className="as-modal-overlay"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => { if (!withdrawing) setShowWithdraw(false); }}
                    >
                        <motion.div
                            className="as-modal-card"
                            initial={{ scale: 0.95, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 20, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="as-modal-title">정말 탈퇴하시겠어요?</h3>
                            <p className="as-modal-warn">
                                탈퇴하면 계정과 함께 저장한 <strong>진단 정보·분석 문서·찜한 공고·체크리스트·일정</strong>이
                                모두 영구 삭제되며 <strong>되돌릴 수 없습니다.</strong>
                            </p>
                            <div className="as-input-row">
                                <label>비밀번호 확인</label>
                                <input
                                    type="password"
                                    value={withdrawPw}
                                    onChange={e => setWithdrawPw(e.target.value)}
                                    placeholder="현재 비밀번호"
                                    autoFocus
                                />
                            </div>
                            {withdrawError && <span className="as-input-desc" style={{ color: '#DC2626', fontWeight: 700 }}>{withdrawError}</span>}
                            <div className="as-modal-actions">
                                <button className="as-modal-cancel-btn" onClick={() => setShowWithdraw(false)} disabled={withdrawing}>취소</button>
                                <button className="as-modal-danger-btn" onClick={handleWithdraw} disabled={withdrawing} style={{ opacity: withdrawing ? 0.6 : 1 }}>
                                    {withdrawing ? '탈퇴 처리 중…' : '탈퇴하기'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default AccountSettingsPage;
