import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProfile, saveProfile } from '../store/profileStore';
import { deriveAgeRange, deriveRegions } from '../utils/profileFilters';
import './ProfileEditModal.css';

// 마이페이지 "내 조건 수정" 창(2026-10-12) — 자가진단(/diagnosis) 페이지로 보내지 않고 그 자리에서 고친다.
// 항목: 나이·거주·상태·가구원. 관심분야·학력·소득은 받지 않는다(기존 저장값은 건드리지 않음).
// 저장 규칙은 자가진단과 같다 — 정밀값(age·region)이 랜딩 범위값(ageRange·regions)보다 우선.

const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const EMPLOYMENT = ['재학중', '미취업', '중소기업 재직', '대기업 재직', '창업자', '기타'];
const HOUSEHOLD = ['1인 가구', '2인 가구', '3인 이상'];

function initialForm() {
    const p = getProfile() || {};
    const r = deriveAgeRange(p);
    // 범위만 있으면(랜딩 선택) 중앙값을, 열린 구간(65~100)이면 하한을 미리 채운다 — 자가진단 프리필과 같은 규칙.
    const age = Number.isFinite(p.age) ? p.age
        : r ? (r.max >= 100 ? r.min : Math.round((r.min + r.max) / 2)) : '';
    const regions = deriveRegions(p);
    return {
        age: age === '' ? '' : String(age),
        region: regions.length === 1 ? regions[0] : '',
        employment: p.employment || '',
        householdSize: p.householdSize || '',
    };
}

const ChipGroup = ({ options, value, onChange }) => (
    <div className="pem-chips">
        {options.map((o) => (
            <button
                key={o}
                type="button"
                className={`pem-chip ${value === o ? 'active' : ''}`}
                onClick={() => onChange(value === o ? '' : o)}
            >
                {o}
            </button>
        ))}
    </div>
);

const ProfileEditModal = ({ open, onClose, onSaved }) => {
    const [form, setForm] = useState(initialForm);
    const [error, setError] = useState('');

    // 열 때마다 최신 저장값으로 다시 채운다.
    useEffect(() => {
        if (open) { setForm(initialForm()); setError(''); }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

    const handleSave = () => {
        const ageNum = form.age === '' ? null : Number(form.age);
        if (ageNum !== null && (!Number.isInteger(ageNum) || ageNum < 15 || ageNum > 100)) {
            setError('나이는 15~100 사이 숫자로 입력해 주세요.');
            return;
        }
        const next = { ...(getProfile() || {}) };
        if (ageNum !== null) { next.age = ageNum; delete next.ageRange; }
        else { delete next.age; }
        if (form.region) { next.region = form.region; next.regions = [form.region]; }
        for (const key of ['employment', 'householdSize']) {
            if (form[key]) next[key] = form[key];
            else delete next[key];
        }
        saveProfile(next);
        onSaved?.();
        onClose?.();
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="pem-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="pem-card"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="pem-title"
                        initial={{ opacity: 0, y: 14, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="pem-head">
                            <h3 id="pem-title" className="pem-title">내 조건 수정</h3>
                            <button type="button" className="pem-close" onClick={onClose} aria-label="닫기">✕</button>
                        </div>

                        <div className="pem-body">
                            <div className="pem-field">
                                <label className="pem-label" htmlFor="pem-age">나이</label>
                                <div className="pem-age-row">
                                    <span className="pem-age-prefix">만</span>
                                    <input
                                        id="pem-age"
                                        className="pem-input"
                                        type="number"
                                        inputMode="numeric"
                                        min="15"
                                        max="100"
                                        placeholder="예: 27"
                                        value={form.age}
                                        onChange={(e) => { setForm((f) => ({ ...f, age: e.target.value })); setError(''); }}
                                    />
                                    <span className="pem-age-suffix">세</span>
                                </div>
                            </div>

                            <div className="pem-field">
                                <label className="pem-label" htmlFor="pem-region">거주 지역</label>
                                <select
                                    id="pem-region"
                                    className="pem-input"
                                    value={form.region}
                                    onChange={(e) => set('region')(e.target.value)}
                                >
                                    <option value="">선택해 주세요</option>
                                    {SIDO.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div className="pem-field">
                                <span className="pem-label">현재 상태</span>
                                <ChipGroup options={EMPLOYMENT} value={form.employment} onChange={set('employment')} />
                            </div>

                            <div className="pem-field">
                                <span className="pem-label">가구원</span>
                                <ChipGroup options={HOUSEHOLD} value={form.householdSize} onChange={set('householdSize')} />
                            </div>

                            {error && <p className="pem-error">{error}</p>}
                        </div>

                        <div className="pem-actions">
                            <button type="button" className="pem-btn pem-btn-cancel" onClick={onClose}>취소</button>
                            <button type="button" className="pem-btn pem-btn-save" onClick={handleSave}>저장</button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ProfileEditModal;
