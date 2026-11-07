import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSettings, saveSettings } from '../store/settingsStore';
import { clearProfile } from '../store/profileStore';
import './ServiceSettingsPage.css';

function ServiceSettingsPage() {
    // 마케팅 동의만 실토글(localStorage clue_settings + P4-2 가입 동의와 양방향 동기화).
    // 알림(push/kakao/night)·다크모드는 발송/테마 시스템 부재로 "준비 중" 비활성 처리(P4-4).
    const [toggles, setToggles] = useState(() => getSettings());
    const [toast, setToast] = useState('');

    const flashToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    const handleToggle = (key) => {
        setToggles(prev => {
            const next = { ...prev, [key]: !prev[key] };
            saveSettings(next);
            return next;
        });
    };

    // P4-5: 진단 기록(프로필) 전체 삭제.
    // confirm 후 profileStore.clearProfile() → 로컬 삭제 + 로그인 상태면 syncLayer 경유 서버 프로필 DELETE.
    const handleClearProfile = () => {
        if (typeof confirm === 'function' &&
            !confirm('내 진단 기록(프로필)을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) {
            return;
        }
        clearProfile();
        flashToast('진단 기록이 삭제되었습니다.');
    };

    return (
        <div className="ss-wrapper">
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="ss-toast"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="ss-main">
                <div className="ss-content-inner">

                    {/* Notification Section — P4-4: 발송 시스템 부재로 비활성("발송 준비 중"). */}
                    <section className="ss-section">
                        <h3 className="ss-section-title">알림 설정</h3>
                        <div className="ss-card">
                            <div className="ss-toggle-item">
                                <div className="ss-item-text">
                                    <span className="ss-item-label">앱 푸시 알림</span>
                                    <span className="ss-item-sub">발송 준비 중</span>
                                </div>
                                <div className="ss-toggle off" style={{ opacity: 0.4, cursor: 'not-allowed' }}></div>
                            </div>
                            <div className="ss-toggle-item">
                                <div className="ss-item-text">
                                    <span className="ss-item-label">카카오톡 알림톡</span>
                                    <span className="ss-item-sub">발송 준비 중</span>
                                </div>
                                <div className="ss-toggle off" style={{ opacity: 0.4, cursor: 'not-allowed' }}></div>
                            </div>
                            <div className="ss-toggle-item">
                                <div className="ss-item-text">
                                    <span className="ss-item-label">야간 알림 수신</span>
                                    <span className="ss-item-sub">발송 준비 중</span>
                                </div>
                                <div className="ss-toggle off" style={{ opacity: 0.4, cursor: 'not-allowed' }}></div>
                            </div>
                        </div>
                    </section>

                    {/* Display Section — 다크모드만 유지(준비 중). 글자크기·언어·포인트색상 제거(P4-7). */}
                    <section className="ss-section">
                        <h3 className="ss-section-title">화면 및 테마</h3>
                        <div className="ss-card">
                            <div className="ss-toggle-item">
                                <div className="ss-item-text">
                                    <span className="ss-item-label">다크 모드</span>
                                    <span className="ss-item-sub">준비 중입니다</span>
                                </div>
                                <div className="ss-toggle off" style={{ opacity: 0.4, cursor: 'not-allowed' }}></div>
                            </div>
                        </div>
                    </section>

                    {/* Privacy & Data — 마케팅 동의(실토글) + 진단 기록 삭제(실배선). 검색기록 자동삭제 제거(P4-7). */}
                    <section className="ss-section">
                        <h3 className="ss-section-title">데이터 및 개인정보</h3>
                        <div className="ss-card">
                            <div className="ss-toggle-item">
                                <div className="ss-item-text">
                                    <span className="ss-item-label">마케팅 정보 활용 동의</span>
                                    <span className="ss-item-sub">이벤트 및 맞춤 컨텐츠 추천</span>
                                </div>
                                <div
                                    className={`ss-toggle ${toggles.marketing ? 'on' : 'off'}`}
                                    onClick={() => handleToggle('marketing')}
                                ></div>
                            </div>
                            <div className="ss-menu-item danger" onClick={handleClearProfile} style={{ cursor: 'pointer' }}>
                                <span className="ss-menu-label">내 진단 기록 전체 삭제</span>
                            </div>
                        </div>
                    </section>

                    <p className="ss-info-footer">
                        마케팅 동의는 이 브라우저(로그인 시 계정)에 저장됩니다. 알림 발송 등 외부 연동 기능은 준비 중입니다.
                    </p>
                </div>
            </main>
        </div>
    );
}

export default ServiceSettingsPage;
