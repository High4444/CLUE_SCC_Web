import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '../assets/logo.png';
import { useNavigate } from 'react-router-dom';
import { RECRUITMENT_PAGE_DATA } from '../constants/recruitmentPageData';
import './WorkbenchPage.css';
import '../components/CenterPanel.css';
import './WorkbenchRecruitmentPage.css';

const WARNINGS = [
    { tag: '서류', tagType: 'doc',  page: 'P.5', text: '공고일 이후 발급 서류만 인정' },
    { tag: '일정', tagType: 'date', page: 'P.6', text: '마감 당일 23:59 서버 기준' },
    { tag: '자격', tagType: 'qual', page: 'P.2', text: '경력 2년은 4대보험 기준' },
    { tag: '전형', tagType: 'proc', page: 'P.4', text: '블라인드 채용 — 학교명 기재 금지' },
    { tag: '서류', tagType: 'doc',  page: 'P.5', text: 'IT 직무 포트폴리오 필수' },
    { tag: '조건', tagType: 'cond', page: 'P.7', text: '중복 직무 지원 불가' },
];

const DEADLINE = new Date('2026-07-31');

// 페이지별 토큰 클릭 시 열릴 주의사항 인덱스 매핑
const PAGE_TO_WARN_IDX = {
    2: 2,  // 지원자격 → 자격 P.2
    4: 3,  // 전형절차 → 전형 P.4
    5: 0,  // 제출서류 → 서류 P.5
    6: 1,  // 접수방법 → 일정 P.6
    7: 5,  // 주의사항 → 조건 P.7
};

const WorkbenchRecruitmentPage = () => {
    const navigate = useNavigate();
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveType, setSaveType] = useState('');
    const [expandedIdx, setExpandedIdx] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);

    const pageData = RECRUITMENT_PAGE_DATA[currentPage - 1];
    const totalPages = RECRUITMENT_PAGE_DATA.length;

    const today = new Date('2026-06-17');
    const dDay = Math.ceil((DEADLINE - today) / (1000 * 60 * 60 * 24));

    const handleTokenClick = (e) => {
        const el = e.target;
        if (el.classList.contains('cp-token') || el.classList.contains('wr-chip')) {
            const warnIdx = PAGE_TO_WARN_IDX[currentPage];
            if (warnIdx !== undefined) {
                setExpandedIdx(warnIdx);
            }
        }
    };

    const handleSave = (type) => {
        setSaveType(type);
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            if (type === 'complete') {
                navigate('/history');
            }
        }, 1500);
    };

    return (
        <div className={`workbench-layout workbench-recruitment ${isFocusMode ? 'focus-mode' : ''}`}>
            {/* Top Header */}
            <header className="wb-global-header">
                <div className="wb-gh-left">
                    <div className="wb-gh-logo" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '28px' }} />
                    </div>
                    <span className="wb-gh-workspace-label">워크스페이스</span>
                    <span className="wb-status-chip reviewing">
                        <span className="wb-status-dot" />
                        검토 진행중
                    </span>
                </div>
                <div className="wb-gh-right">
                    <button className="wb-header-btn secondary">파일 교체</button>
                    <button className={`wb-header-btn focus ${isFocusMode ? 'active' : ''}`} onClick={() => setIsFocusMode(!isFocusMode)}>집중 모드</button>
                    <button className="wb-header-btn exit" onClick={() => navigate('/dashboard')}>나가기</button>
                </div>
            </header>

            {/* Job Info Bar */}
            <div className="wr-job-bar">
                <div className="wr-job-info">
                    <h1 className="wr-job-title">2026 하반기 공개채용 공고</h1>
                    <div className="wr-job-tags">
                        <span className="wr-tag">행정·IT개발</span>
                        <span className="wr-tag">총 5명 채용</span>
                        <span className="wr-tag">정규직/수습 3개월</span>
                        <span className="wr-tag wr-tag-deadline">7월 31일 마감</span>
                    </div>
                </div>
                <div className="wr-dday">
                    <span className="wr-dday-label">마감까지</span>
                    <span className="wr-dday-value">D-{dDay}</span>
                </div>
            </div>

            {/* 3-Panel Layout */}
            <main className="wb-panels">
                {/* Left Panel - Document Viewer */}
                <aside className="panel-left">
                    <div className="panel-header">
                        <div className="cp-h-left">
                            <span>CLUE 문서 해석</span>
                            <span className="cp-h-hint">요약 없이 원문 구조를 유지하고 핵심 조건만 강조합니다.</span>
                        </div>
                        <div className="cp-h-btns">
                            <div className="cp-draw-tools">
                                <button className="cp-tool-btn">✏️ 펜</button>
                                <button className="cp-tool-btn">🖋️ 형광펜</button>
                                <button className="cp-tool-btn">🧹 지우개</button>
                            </div>
                            <button className="cp-page-btn" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>이전</button>
                            <span className="cp-page-num">{currentPage} / {totalPages}</span>
                            <button className="cp-page-btn" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>다음</button>
                        </div>
                    </div>
                    <div className="cp-body">
                        <div className="cp-viewer-card wr-recruit-card">
                            <div className="wr-recruit-meta">
                                <div className="wr-recruit-icon-box">{pageData.icon}</div>
                                <div className="wr-recruit-meta-right">
                                    <div className="wr-recruit-meta-top">
                                        <span className="cp-vh-page">PAGE {currentPage}</span>
                                        <span className="wr-recruit-badge">{pageData.title}</span>
                                    </div>
                                    <div className="cp-vh-sub">{pageData.sub}</div>
                                </div>
                            </div>

                            <div className="wr-recruit-divider" />

                            <div className="wr-bullets-box">
                                {pageData.bullets.map((b, i) => (
                                    <div key={i} className="wr-bullet-item">• {b}</div>
                                ))}
                            </div>

                            <h1 className="cp-content-title">{pageData.title}</h1>

                            <div className="cp-content-para" onClick={handleTokenClick} style={{ cursor: 'default' }}>
                                {pageData.content}
                            </div>

                            <div className="cp-usage-tip">
                                <span className="cp-usage-tip-icon">💡</span>
                                <span className="cp-usage-tip-text">강조된 조건을 클릭하면 오른쪽 패널에서 해당 주의사항을 바로 확인할 수 있습니다.</span>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Center Panel - Job Comparison */}
                <section className="panel-center">
                    <div className="panel-header">직무 비교</div>
                    <div className="wr-compare-body">
                        <table className="wr-compare-table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th><span className="wr-col-dot blue"></span>일반행정</th>
                                    <th><span className="wr-col-dot purple"></span>IT개발</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>채용 인원</td>
                                    <td>3명</td>
                                    <td>2명</td>
                                </tr>
                                <tr>
                                    <td>학력</td>
                                    <td>무관</td>
                                    <td>무관</td>
                                </tr>
                                <tr>
                                    <td>경력</td>
                                    <td><span className="wr-highlight">무관 (신입 가능)</span></td>
                                    <td><span className="wr-highlight">2년 이상 (필수)</span></td>
                                </tr>
                                <tr>
                                    <td>초봉</td>
                                    <td>3,000만원</td>
                                    <td>3,500만원</td>
                                </tr>
                                <tr>
                                    <td>포트폴리오</td>
                                    <td><span className="wr-highlight">불필요</span></td>
                                    <td><span className="wr-highlight">필수 제출</span></td>
                                </tr>
                                <tr>
                                    <td>우대 사항</td>
                                    <td>
                                        <div className="wr-badge-list">
                                            <span className="wr-badge">컴퓨터활용능력 1급</span>
                                            <span className="wr-badge">사회복지사</span>
                                            <span className="wr-badge">MOS 자격증</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="wr-badge-list">
                                            <span className="wr-badge">정보처리기사</span>
                                            <span className="wr-badge">AWS 자격증</span>
                                            <span className="wr-badge">GitHub 이력</span>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td>제출 서류</td>
                                    <td>
                                        <div className="wr-badge-list">
                                            <span className="wr-badge">입사지원서</span>
                                            <span className="wr-badge">자기소개서</span>
                                            <span className="wr-badge">졸업증명서</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="wr-badge-list">
                                            <span className="wr-badge">입사지원서</span>
                                            <span className="wr-badge">자기소개서</span>
                                            <span className="wr-badge">경력증명서</span>
                                            <span className="wr-badge wr-highlight">포트폴리오</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="wr-compare-note">* 공통: 블라인드 채용·정규직·전형 절차 동일</p>
                    </div>
                </section>

                {/* Right Panel - Warnings */}
                <aside className="panel-right">
                    <div className="panel-header">주의사항</div>
                    <div className="wr-warnings-body">
                        <div className="wr-warnings-inner">
                            <p className="wr-warnings-subtitle">놓치기 쉬운 조건 6개를 정리했습니다.</p>
                            <div className="wr-warnings-list">
                                {WARNINGS.map((w, i) => (
                                    <div
                                        key={i}
                                        className={`wr-warning-item ${expandedIdx === i ? 'wr-warning-active' : ''}`}
                                        onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                                    >
                                        <div className="wr-warning-row">
                                            <span className={`wr-warn-tag ${w.tagType}`}>{w.tag}</span>
                                            <span className="wr-warn-page">{w.page}</span>
                                            <span className="wr-warn-text">{w.text}</span>
                                            <span className="wr-warn-arrow">{expandedIdx === i ? '∧' : '∨'}</span>
                                        </div>
                                        {expandedIdx === i && (
                                            <div className="wr-warn-detail">
                                                {w.page}에서 확인이 필요한 조건입니다. 왼쪽 패널에서 해당 페이지를 참고하세요.
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="wr-footer">
                            <button className="wr-btn-secondary" onClick={() => handleSave('temp')}>임시 저장</button>
                            <button className="wr-btn-primary" onClick={() => handleSave('complete')}>검토 완료</button>
                        </div>
                    </div>
                </aside>
            </main>

            {/* Saving Overlay */}
            <AnimatePresence>
                {isSaving && (
                    <motion.div className="wb-saving-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className="wb-saving-modal" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}>
                            <div className="wb-sm-spinner">
                                <svg width="40" height="40" viewBox="0 0 50 50">
                                    <circle cx="25" cy="25" r="20" fill="none" stroke="#E2E8F0" strokeWidth="4"></circle>
                                    <circle cx="25" cy="25" r="20" fill="none" stroke="#2563EB" strokeWidth="4" strokeDasharray="31.4 125.6" strokeLinecap="round">
                                        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                                    </circle>
                                </svg>
                            </div>
                            <h3>{saveType === 'temp' ? '임시 저장 중...' : '검토 완료 처리 중...'}</h3>
                            <p>{saveType === 'temp' ? '업로드 내역에 임시저장 중입니다.' : '잠시 후 업로드 내역으로 이동합니다'}</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default WorkbenchRecruitmentPage;
