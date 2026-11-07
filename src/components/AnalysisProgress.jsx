import React, { useEffect, useState } from 'react';
import './AnalysisProgress.css';

// 분석 과정 화면(데모 공고 전용) — 결과 대신 먼저 보여주고 끝나면 결과 화면으로 전환한다.
// 단계 옆 숫자는 전부 호출측이 넘겨준 실제 JSON 수치(stats)에서 가져오며 임의로 만들지 않는다.
const STEPS = [
    { key: 'extract', label: '텍스트 추출', detail: (s) => `${s.pageCount}쪽에서 텍스트 블록 추출` },
    { key: 'screen', label: 'ACID 1차 선별', detail: () => '전체 블록 중 검토 후보 선별' },
    { key: 'classify', label: '우선 검토 구간 선정', detail: () => 'A·C·I·D 항목 분류' },
    { key: 'done', label: '분석 완료', detail: (s) => `항목 ${s.itemCount}개 · 확인 필요 ${s.checkCount}개` },
];

const STEP_MS = 620; // 4단계 × 620ms + 마무리 = 약 2.5초

const AnalysisProgress = ({ fileName, stats, onDone }) => {
    const [activeIdx, setActiveIdx] = useState(0);

    useEffect(() => {
        const timers = STEPS.map((_, i) =>
            setTimeout(() => setActiveIdx(i), i * STEP_MS)
        );
        timers.push(setTimeout(() => onDone(), STEPS.length * STEP_MS));
        return () => timers.forEach(clearTimeout);
    }, [onDone]);

    const percent = Math.round(((activeIdx + 1) / STEPS.length) * 100);

    return (
        // 화면 어디를 눌러도 건너뛰기
        <div className="apg-screen" onClick={onDone} role="button" tabIndex={0}>
            <div className="apg-card">
                <div className="apg-head">
                    <span className="apg-badge">분석 중</span>
                    <h2 className="apg-file">{fileName}</h2>
                </div>

                <div className="apg-bar">
                    <div className="apg-bar-fill" style={{ width: `${percent}%` }} />
                </div>

                <ol className="apg-steps">
                    {STEPS.map((step, i) => {
                        const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
                        return (
                            <li key={step.key} className={`apg-step ${state}`}>
                                <span className="apg-step-mark">{state === 'done' ? '✓' : i + 1}</span>
                                <span className="apg-step-texts">
                                    <span className="apg-step-label">{step.label}</span>
                                    <span className="apg-step-detail">{step.detail(stats)}</span>
                                </span>
                            </li>
                        );
                    })}
                </ol>

                <p className="apg-hint">화면을 클릭하면 건너뜁니다</p>
            </div>
        </div>
    );
};

export default AnalysisProgress;
