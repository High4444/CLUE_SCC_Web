import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './SupportPage.css';

function SupportPage() {
    const [openFaq, setOpenFaq] = useState(0);

    const [showComingSoon, setShowComingSoon] = useState(false);

    const triggerComingSoon = () => {
        setShowComingSoon(true);
        setTimeout(() => setShowComingSoon(false), 2000);
    };

    const faqs = [
        { q: '진단 결과가 실제와 다를 수 있나요?', a: 'CLUE AI는 공고문의 텍스트를 정밀 분석하지만, 최종 신청 자격은 해당 기관의 심사 결과에 따릅니다. 진단 결과는 참고용으로 활용해 주세요.' },
        { q: '서류 업로드가 되지 않아요.', a: 'PDF 형식의 파일만 지원하며, 파일 당 최대 용량은 20MB입니다. 문제가 지속될 경우 네트워크 상태를 확인하거나 1:1 문의를 남겨주세요.' },
        { q: '알림은 언제 받을 수 있나요?', a: '앱 푸시·카카오톡 알림톡 등 알림 발송 기능은 현재 준비 중입니다. 정식 오픈 시 마이페이지 > 서비스 설정에서 켜고 끌 수 있도록 제공할 예정입니다.' }
    ];

    return (
        <div className="sp-wrapper">
            <main className="sp-main">
                <div className="sp-content-inner">
                    
                    {/* Contact Section */}
                    <div className="sp-hero-card">
                        <div className="sp-hero-text">
                            <h3>무엇을 도와드릴까요?</h3>
                            <p>궁금한 점이 있다면 언제든 문의해 주세요. 전문 상담팀이 답변해 드립니다.</p>
                        </div>
                        <div className="sp-btn-row">
                            <button className="sp-btn-blue" onClick={triggerComingSoon}>1:1 문의하기</button>
                            <button className="sp-btn-outline" onClick={triggerComingSoon}>채팅 상담</button>
                        </div>
                    </div>

                    {/* FAQ Section */}
                    <section className="sp-section">
                        <h3 className="sp-section-title">자주 묻는 질문</h3>
                        <div className="sp-faq-list">
                            {faqs.map((faq, idx) => (
                                <div key={idx} className={`sp-faq-item ${openFaq === idx ? 'open' : ''}`}>
                                    <div className="sp-faq-q" onClick={() => setOpenFaq(openFaq === idx ? -1 : idx)}>
                                        <span className="sp-faq-box">Q</span>
                                        <span className="sp-faq-text">{faq.q}</span>
                                        <svg className="sp-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                    </div>
                                    {openFaq === idx && (
                                        <div className="sp-faq-a">
                                            {faq.a}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Terms Section */}
                    <section className="sp-section">
                        <h3 className="sp-section-title">서비스 공식 정보</h3>
                        <div className="sp-menu-list">
                            <div className="sp-menu-item" onClick={triggerComingSoon}>
                                <span className="sp-menu-label">공지사항</span>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                            <div className="sp-menu-item" onClick={triggerComingSoon}>
                                <span className="sp-menu-label">서비스 이용약관</span>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                            <div className="sp-menu-item" onClick={triggerComingSoon}>
                                <span className="sp-menu-label">개인정보 처리방침</span>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                        </div>
                    </section>

                    <div className="sp-footer-box">
                        <p className="sp-footer-text">고객센터 운영시간: 평일 09:00 - 18:00 (주말/공휴일 제외)</p>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default SupportPage;
