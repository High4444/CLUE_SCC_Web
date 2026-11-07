import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { checkEligibility, STATUS_LABEL } from '../utils/demoEligibility';
import './CompareShowcase.css';

const COLLAPSED_COUNT = 3;

const Bullets = ({ cell, expanded }) => {
    const shown = expanded ? cell.bullets : cell.bullets.slice(0, COLLAPSED_COUNT);
    const hidden = cell.bullets.length - shown.length;
    return (
        <>
            <ul className="cs-bullets">
                {shown.map((b) => <li key={b}>{b}</li>)}
            </ul>
            {hidden > 0 && <span className="cs-more-chip">+{hidden}</span>}
            {expanded && cell.src && <div className="cs-src">출처 · {cell.src}</div>}
        </>
    );
};

const EligibilityFinder = ({ data }) => {
    const [age, setAge] = useState('');
    const [income, setIncome] = useState('');
    const [job, setJob] = useState('employee');
    const [result, setResult] = useState(null);

    const ready = age !== '' && income !== '';
    const run = () => {
        if (!ready) return;
        const r = checkEligibility({ age: Number(age), income: Number(income), job });
        // 업로드 순서에 맞춰 a↔b를 뒤집은 데이터면 판정 결과도 같이 뒤집는다(checkEligibility는 a=도약·b=미래 고정).
        setResult(data.swapped ? { a: r.b, b: r.a } : r);
    };

    return (
        <section className="cs-card">
            <h3 className="cs-card-title">내 조건으로 확인하기</h3>
            <p className="cs-card-sub">공고문에 적힌 기준과만 비교해요. 점수나 순위는 매기지 않아요.</p>

            <div className="cs-form">
                <label className="cs-field">
                    <span>나이</span>
                    <input type="number" min="0" placeholder="예: 26" value={age} onChange={(e) => setAge(e.target.value)} />
                    <em>세</em>
                </label>
                <label className="cs-field">
                    <span>연소득</span>
                    <input type="number" min="0" placeholder="예: 3000" value={income} onChange={(e) => setIncome(e.target.value)} />
                    <em>만 원</em>
                </label>
                <label className="cs-field cs-field-wide">
                    <span>직업 상태</span>
                    <select value={job} onChange={(e) => setJob(e.target.value)}>
                        <option value="employee">직장인 (중소기업 외)</option>
                        <option value="sme">중소기업 재직자·신규취업자</option>
                        <option value="biz">소상공인</option>
                        <option value="none">구직·학생 (소득 없음)</option>
                    </select>
                </label>
                <button type="button" className="cs-run-btn" disabled={!ready} onClick={run}>
                    공고문 기준으로 확인
                </button>
            </div>
            <p className="cs-form-note">연소득은 직전연도 총급여(세전) 기준이에요.</p>

            {result && (
                <div className="cs-results">
                    {[['A', data.a.name, result.a], ['B', data.b.name, result.b]].map(([slot, name, r]) => (
                        <div key={slot} className="cs-result">
                            <div className="cs-result-head">
                                <span className={`pcp-th-label-badge ${slot === 'A' ? 'badge-a' : 'badge-b'}`}>{slot}</span>
                                <span className="cs-result-name">{name}</span>
                                <span className={`cs-pill ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                            </div>
                            <ul className="cs-bullets">
                                {r.lines.map((l) => <li key={l}>{l}</li>)}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

const CompareShowcase = ({ data, onBack }) => {
    const [open, setOpen] = useState({});
    const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

    return (
        <motion.div
            className="cs-root"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="cs-topbar">
                <div className="cs-topbar-policies">
                    <span className="cs-topbar-policy">
                        <span className="pcp-th-label-badge badge-a">A</span>{data.a.name}
                    </span>
                    <span className="cs-topbar-vs">vs</span>
                    <span className="cs-topbar-policy">
                        <span className="pcp-th-label-badge badge-b">B</span>{data.b.name}
                    </span>
                </div>
                <button type="button" className="cs-back-btn" onClick={onBack}>← 다시 선택</button>
            </div>

            <div className="cs-grid">
                <div className="cs-left">
                    <section className="cs-card cs-card-accent">
                        <h3 className="cs-card-title">핵심 차이점</h3>
                        <div className="cs-highlights">
                            {data.highlights.map((h) => (
                                <div key={h.label} className="cs-highlight">
                                    <div className="cs-highlight-label">{h.label}</div>
                                    <div className="cs-highlight-line">
                                        <span className="pcp-th-label-badge badge-a">A</span>
                                        <span>{h.a}</span>
                                    </div>
                                    <div className="cs-highlight-line">
                                        <span className="pcp-th-label-badge badge-b">B</span>
                                        <span>{h.b}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <EligibilityFinder data={data} />
                </div>

                <section className="cs-right">
                    <h3 className="cs-section-title">항목별 상세 비교</h3>
                    <div className="cs-table">
                        <div className="cs-thead">
                            <div>비교 항목</div>
                            <div><span className="pcp-th-label-badge badge-a">A</span>{data.a.name}</div>
                            <div><span className="pcp-th-label-badge badge-b">B</span>{data.b.name}</div>
                        </div>
                        {data.rows.map((row) => {
                            const expanded = !!open[row.id];
                            return (
                                <div
                                    key={row.id}
                                    className={`cs-row ${expanded ? 'expanded' : ''}`}
                                    onClick={() => toggle(row.id)}
                                >
                                    <div className="cs-row-key">
                                        <div>
                                            <div className="cs-row-label">{row.label}</div>
                                            <span className={`cs-diff ${row.diff}`}>{data.diffLabel[row.diff]}</span>
                                        </div>
                                        <span className="cs-chevron" aria-hidden="true">{expanded ? '▴' : '▾'}</span>
                                    </div>
                                    <div className="cs-row-val"><Bullets cell={row.a} expanded={expanded} /></div>
                                    <div className="cs-row-val"><Bullets cell={row.b} expanded={expanded} /></div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </motion.div>
    );
};

export default CompareShowcase;
