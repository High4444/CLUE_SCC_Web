import React from 'react';
import { motion } from 'framer-motion';
import './SubscriptionPage.css';

// P4-1: 구독/결제는 "살아있는 보류".
// 허위 콘텐츠(가짜 PREMIUM 플랜·다음 결제일·₩19,900 결제내역)를 전부 제거하고
// "결제 기능 준비 중" 단일 안내로 축소한다. 삭제가 아니라 보류 — 복원 로드맵: docs/plans/PAYMENT_LATER.md.
function SubscriptionPage() {
    return (
        <div className="sub-wrapper">
            <main className="sub-main">
                <div className="sub-content-inner">
                    <motion.div
                        className="sub-coming-soon"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                        <div className="sub-coming-icon">💳</div>
                        <h3 className="sub-coming-title">결제 기능 준비 중</h3>
                        <p className="sub-coming-desc">
                            유료 구독·결제 기능을 준비하고 있어요.<br />
                            지금은 모든 기능을 무료로 이용하실 수 있습니다.
                        </p>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}

export default SubscriptionPage;
