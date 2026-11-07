import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './CollapsibleBlock.css';

// 워크벤치 가운데 패널 상단 블록(공고 요약·일정 타임라인 등)을 접고 펼치는 공용 래퍼.
// 접으면 제목 줄만 남아 아래 문서 해석 영역이 그만큼 넓어진다. 기본은 펼친 상태.
const CollapsibleBlock = ({ title, defaultOpen = true, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="cb-wrap">
            <button
                type="button"
                className="cb-toggle"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
            >
                <span className="cb-title">{title}</span>
                <span className="cb-action">
                    {open ? '접기' : '펼치기'}
                    <span className={`cb-chevron ${open ? 'open' : ''}`}>▾</span>
                </span>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden', flexShrink: 0 }}
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CollapsibleBlock;
