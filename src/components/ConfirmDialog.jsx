import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ConfirmDialog.css';

// 앱 자체 확인창 — window.confirm 대체.
// 일부 내장 브라우저(앱 안 미리보기 등)는 window.confirm을 띄우지 않고 즉시 false를 돌려줘
// 삭제 같은 동작이 조용히 막히므로, 확인이 필요한 동작은 이 컴포넌트를 쓴다.
const ConfirmDialog = ({
    open,
    title,
    message,
    confirmLabel = '확인',
    cancelLabel = '취소',
    danger = false,
    onConfirm,
    onCancel,
}) => {
    // Esc로 닫기
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="cd-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={onCancel}
                >
                    <motion.div
                        className="cd-card"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="cd-title"
                        initial={{ opacity: 0, y: 12, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 id="cd-title" className="cd-title">{title}</h3>
                        {message && <p className="cd-message">{message}</p>}
                        <div className="cd-actions">
                            <button type="button" className="cd-btn cd-btn-cancel" onClick={onCancel} autoFocus>
                                {cancelLabel}
                            </button>
                            <button
                                type="button"
                                className={`cd-btn ${danger ? 'cd-btn-danger' : 'cd-btn-primary'}`}
                                onClick={onConfirm}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ConfirmDialog;
