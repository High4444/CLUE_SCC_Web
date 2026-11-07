import React from 'react';
import './LeftPanel.css';
import { PAGE_DATA } from '../constants/pageData';
import pdfFile from '../assets/신혼부부.pdf';

const LeftPanel = ({ currentPage, onPageChange, pdfKey, isExpanded, onToggleExpand, pages, pdfUrl, docTitle }) => {
    // 실데이터 모드: 전달된 pages 사용 / 목데이터 모드: 기존 PAGE_DATA
    const isReal = Array.isArray(pages) && pages.length > 0;
    const source = isReal ? pages : PAGE_DATA;
    // 쪽 번호가 연속이 아닐 수 있어 번호로 찾고, 없으면 순서로 폴백(CenterPanel과 동일 규칙).
    const foundIdx = source.findIndex((p) => p.page === currentPage);
    const pageIdx = foundIdx >= 0 ? foundIdx : Math.min(Math.max(currentPage - 1, 0), source.length - 1);
    const currentData = source[pageIdx];
    const docTitleText = isReal
        ? (docTitle || '분석한 공고문')
        : '청년 신혼부부 주택자금 대출이자 지원사업';

    return (
        <div className={`left-panel-outer ${isExpanded ? 'expanded' : ''}`}>
            {/* Document Header */}
            <div className="lp-doc-header">
                <span className="lp-doc-title">{docTitleText}</span>
            </div>

            <div className={`lp-body ${isExpanded ? 'expanded' : ''}`}>
                {/* PDF Thumbnail */}
                <div className="lp-pdf-section">
                    <div className="lp-pdf-card">
                        <div className="lp-pdf-header">
                            <div className="lp-pdf-page-title-box">
                                <span className="lp-pdf-page-num">Page {currentPage}</span>
                                <span className="lp-pdf-page-title">{currentData.title}</span>
                            </div>
                            <button className="lp-pdf-expand-btn" onClick={onToggleExpand}>
                                {isExpanded ? '작게' : '크게'}
                            </button>
                        </div>
                        <div className="lp-pdf-preview">
                            <div className="lp-pdf-container">
                                {isReal ? (
                                    pdfUrl ? (
                                        <iframe
                                            key={`pdf-${currentPage}-${pdfKey}`}
                                            src={`${pdfUrl}#page=${currentPage}&view=Fit&toolbar=0&navpanes=0`}
                                            className="lp-pdf-iframe"
                                            title="원본 PDF"
                                        />
                                    ) : (
                                        // 새로고침 등으로 원본 objectURL 소실 시 안내 (엉뚱한 데모 PDF 노출 금지)
                                        <div
                                            className="lp-pdf-iframe"
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '16px', color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.6 }}
                                        >
                                            원본 미리보기는 재업로드 시 표시됩니다
                                        </div>
                                    )
                                ) : (
                                    <iframe
                                        key={`pdf-${currentPage}-${pdfKey}`}
                                        src={`${pdfFile}#page=${currentPage}&view=Fit&toolbar=0&navpanes=0`}
                                        className="lp-pdf-iframe"
                                        title="원본 PDF"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Page Menu List */}
                <div className="lp-menu-section">
                    <h3 className="lp-menu-title">페이지 목록</h3>
                    <div className="lp-menu-list">
                        {source.map((page) => (
                            <div
                                key={page.page}
                                className={`lp-menu-item ${currentPage === page.page ? 'active' : ''}`}
                                onClick={() => onPageChange(page.page)}
                            >
                                <div className="lp-mi-dot"></div>
                                <div className="lp-mi-content">
                                    <div className="lp-mi-header">
                                        <span className="lp-mi-pnum">P.{page.page}</span>
                                        <span className="lp-mi-title">{page.title}</span>
                                    </div>
                                    <div className="lp-mi-sub">{page.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LeftPanel;
