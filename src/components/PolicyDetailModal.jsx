import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './PolicyDetailModal.css';
import { getPolicyDetail } from '../api/client';
import { mapPolicyToCard, formatDeadline } from '../utils/policyAdapter';
import { computeVerdict } from '../utils/verdictEngine';
import { isEndDateExpired } from '../utils/policyDates';
import { getProfile } from '../store/profileStore';
import { isSaved as isSavedStore, toggleSaved } from '../store/savedStore';
import { addRecentlyViewed } from '../pages/RecentlyViewedPage';

// 정책 상세 모달(P3-1). 탐색 축(대시보드 추천·검색, 찜, 최근 본)에서 공고 카드 클릭 시 오픈.
// - getPolicyDetail(plcyNo) 실호출 → 상세 표시(로딩·에러 재시도 상태 포함).
// - verdict 배지(내 프로필 판정 + 근거 툴팁), 찜 토글, 신청 페이지 열기(addRecentlyViewed),
//   공고문 PDF로 분석하기(탐색→분석 다리, 가이드 모드).
//
// 다리 모드(P3-2)는 "가이드 모드"로 확정: 온통청년 getPlcy 응답에 공고문 첨부 PDF URL이
// 존재하지 않음(aplyUrlAddr=신청페이지/폼, refUrlAddr=HTML 안내페이지, sbmsnDcmntCn=자유텍스트).
// → 자동 다운로드 불가. 신청 페이지에서 PDF를 받아 대시보드 업로드 존에 올리도록 유도한다.
//
// props:
//   isOpen        표시 여부
//   plcyNo        상세 조회할 정책 고유번호. 없으면 fallbackCard만 표시(조회 생략).
//   fallbackCard  클릭한 카드 뷰모델({id,title,agency,deadline,link,...}). 조회 실패 시 기본 표시.
//   onClose       닫기
//   onAfterAction (선택) 찜/최근본 변경 후 호출 — 부모 목록 갱신용
const INCOME_LABELS = {
    '0043001': '소득 무관',
    '0043002': '연 소득 기준 이하',
    '0043003': '기타 소득 조건 있음',
};

function ageLabel(policy) {
    if (policy?.sprtTrgtAgeLmtYn !== 'Y') return '연령 무관';
    const min = policy?.sprtTrgtMinAge;
    const max = policy?.sprtTrgtMaxAge;
    if (min && max) return `만 ${min}~${max}세`;
    if (min) return `만 ${min}세 이상`;
    if (max) return `만 ${max}세 이하`;
    return '연령 제한 있음';
}

const PolicyDetailModal = ({ isOpen, plcyNo, fallbackCard, onClose, onAfterAction }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [policy, setPolicy] = useState(null);
    const [saved, setSaved] = useState(false);

    const load = useCallback(async () => {
        if (!plcyNo) { setPolicy(null); setError(null); setLoading(false); return; }
        setLoading(true);
        setError(null);
        try {
            const res = await getPolicyDetail(plcyNo);
            setPolicy(res?.policy || null);
        } catch (e) {
            setError(e?.message || '정책 정보를 불러오지 못했습니다.');
            setPolicy(null);
        } finally {
            setLoading(false);
        }
    }, [plcyNo]);

    // 열릴 때마다 상세 조회 + 찜 상태 동기화.
    useEffect(() => {
        if (!isOpen) return;
        const id = plcyNo || fallbackCard?.id;
        setSaved(id ? isSavedStore(id) : false);
        load();
    }, [isOpen, plcyNo, fallbackCard, load]);

    if (!isOpen) return null;

    // 상세 응답(raw)로 카드 뷰모델 파생. 조회 실패면 fallbackCard로 대체.
    const card = policy ? mapPolicyToCard(policy) : (fallbackCard || {});
    const title = card.title || fallbackCard?.title || '공고 상세';
    const agency = card.agency || fallbackCard?.agency || '';
    const link = card.link || fallbackCard?.link || '';
    const verdict = policy ? computeVerdict(policy, getProfile()) : null;
    const deadlineLabel = policy
        ? formatDeadline(policy.aplyYmd, policy.aplyPrdSeCd)
        : (fallbackCard?.deadline || '');
    const expired = policy ? isEndDateExpired(policy.aplyYmd) : false;

    const badgeCls = verdict && verdict.level && verdict.level !== 'neutral' ? ` ${verdict.level}` : '';

    const handleToggleSaved = () => {
        const target = { ...card, id: card.id || fallbackCard?.id, title, agency, link, deadline: deadlineLabel };
        const nowSaved = toggleSaved(target);
        setSaved(nowSaved);
        if (onAfterAction) onAfterAction();
    };

    const handleOpenApply = () => {
        const target = { ...card, id: card.id || fallbackCard?.id, title, agency, link, deadline: deadlineLabel, dday: deadlineLabel };
        addRecentlyViewed(target);
        if (link) window.open(link, '_blank');
        if (onAfterAction) onAfterAction();
    };

    // 자격 요약 조각(값 있는 것만).
    const qualRows = [];
    if (policy) {
        qualRows.push({ label: '연령', value: ageLabel(policy) });
        qualRows.push({ label: '소득', value: INCOME_LABELS[policy.earnCndSeCd] || '조건 확인 필요' });
        if (policy.addAplyQlfcCndCn && policy.addAplyQlfcCndCn.trim()) {
            qualRows.push({ label: '추가 자격', value: policy.addAplyQlfcCndCn.trim() });
        }
    }

    // 본문 섹션(값 있는 것만).
    const sections = [];
    if (policy) {
        if (policy.plcyExplnCn?.trim()) sections.push({ label: '한눈에 보기', value: policy.plcyExplnCn.trim() });
        if (policy.plcySprtCn?.trim()) sections.push({ label: '지원 내용', value: policy.plcySprtCn.trim() });
        if (policy.plcyAplyMthdCn?.trim()) sections.push({ label: '신청 방법', value: policy.plcyAplyMthdCn.trim() });
        if (policy.sbmsnDcmntCn?.trim()) sections.push({ label: '제출 서류', value: policy.sbmsnDcmntCn.trim() });
        if (policy.etcMttrCn?.trim()) sections.push({ label: '기타 사항', value: policy.etcMttrCn.trim() });
    }

    return (
        <AnimatePresence>
            <motion.div
                key="pdm-backdrop"
                className="pdm-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    key="pdm-card"
                    className="pdm-card"
                    initial={{ scale: 0.96, y: 30, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.96, y: 30, opacity: 0 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 340 }}
                    onClick={e => e.stopPropagation()}
                >
                    <button className="pdm-close" onClick={onClose} aria-label="닫기">&times;</button>

                    {/* Header */}
                    <div className="pdm-header">
                        <div className="pdm-badge-row">
                            {verdict && (
                                <span className={`pdm-badge${badgeCls}`} title={verdict.title || undefined}>
                                    {verdict.text}
                                </span>
                            )}
                            {expired && <span className="pdm-badge expired">마감됨</span>}
                            {deadlineLabel && !expired && <span className="pdm-deadline">{deadlineLabel}</span>}
                        </div>
                        <h2 className="pdm-title">{title}</h2>
                        {agency && <p className="pdm-agency">{agency}{card.category ? ` · ${card.category}` : ''}</p>}
                    </div>

                    {/* Body */}
                    <div className="pdm-body">
                        {loading && (
                            <div className="pdm-state">
                                <div className="pdm-spinner" />
                                <p>정책 정보를 불러오는 중…</p>
                            </div>
                        )}

                        {!loading && error && (
                            <div className="pdm-state">
                                <p className="pdm-error">{error}</p>
                                <button className="pdm-retry" onClick={load}>다시 시도</button>
                            </div>
                        )}

                        {!loading && !error && policy && (
                            <>
                                {qualRows.length > 0 && (
                                    <div className="pdm-qual">
                                        {qualRows.map(r => (
                                            <div className="pdm-qual-row" key={r.label}>
                                                <span className="pdm-qual-label">{r.label}</span>
                                                <span className="pdm-qual-value">{r.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {sections.map(s => (
                                    <div className="pdm-section" key={s.label}>
                                        <h3 className="pdm-section-label">{s.label}</h3>
                                        <p className="pdm-section-text">{s.value}</p>
                                    </div>
                                ))}
                                {sections.length === 0 && (
                                    <p className="pdm-section-text">상세 설명이 제공되지 않은 공고입니다. 신청 페이지에서 원문을 확인해 주세요.</p>
                                )}
                            </>
                        )}

                        {!loading && !error && !policy && (
                            <p className="pdm-section-text">상세 정보를 불러올 수 없습니다. 신청 페이지에서 원문을 확인해 주세요.</p>
                        )}
                    </div>

                    {/* Footer actions */}
                    <div className="pdm-footer">
                        {/* "공고문 PDF로 분석하기" 버튼·안내 문구는 2026-10-12 삭제 → 신청 페이지 열기가 주 버튼 */}
                        <div className="pdm-actions">
                            <button className="pdm-btn pdm-btn-primary" onClick={handleOpenApply} disabled={!link}>
                                신청 페이지 열기
                            </button>
                            <button className={`pdm-btn pdm-btn-save ${saved ? 'saved' : ''}`} onClick={handleToggleSaved}>
                                {saved ? '찜 완료 ✓' : '찜하기'}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default PolicyDetailModal;
