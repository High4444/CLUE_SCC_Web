import { keyboardAction } from '../utils/keyboardAction';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile } from '../store/profileStore';
import { getDisplayProfile } from '../utils/displayProfile';
import { isLoggedIn, getUser } from '../store/authStore';

// 헤더 우측 페르소나 위젯 공용 컴포넌트(묵은 P1-6 정리).
// 여러 페이지에 복붙돼 있던 인라인 마크업을 그대로 추출 — 데이터만 profileStore 기반.
// footer는 마이페이지(/my) 버튼 하나("맞춤서비스"(→/diagnosis) 버튼은 2026-10-12 기능 폐지로 삭제).
//
// 프로필 없으면: 이름 하드코딩 대신 "프로필 미설정" 안내.
// 프로필 있으면: 이름 항목이 설문에 없으므로 "나의 프로필" + 나이·지역·상태 실값 표시.
//
// props.profileToMy: 대시보드 헤더는 p-profile-link 클릭 시 /my로 이동(고유 동작) — 그 페이지만 true.
function PersonaWidget({ profileToMy = false }) {
    const navigate = useNavigate();
    const [isPersonaOpen, setIsPersonaOpen] = useState(false);
    const profile = getProfile();
    // 표시 전용 셀렉터(D1)만 읽는다 — 원시 필드 직접 접근 금지.
    const dp = getDisplayProfile(profile);
    const loggedIn = isLoggedIn();
    const accountEmail = getUser()?.email || '';

    // 표시값 파생(마크업 슬롯 안에서 텍스트만 교체).
    // 로그인 시 이름 슬롯에 계정 이메일 표시(F5-d), 비로그인 시 현행 유지.
    const avatarChar = loggedIn ? (accountEmail[0]?.toUpperCase() || '나') : (dp.hasProfile ? '나' : '?');
    const nameText = loggedIn ? accountEmail : (dp.hasProfile ? '나의 프로필' : '프로필 미설정');
    const badgeText = dp.hasProfile ? dp.statusBadge : '설정 필요';
    const regionText = dp.region ? `${dp.region} 거주` : '미설정';
    const ageText = dp.age || '미설정';
    const householdText = dp.household || '미설정';

    return (
        <div className="persona-container">
            <div
                className={`persona-trigger ${isPersonaOpen ? 'active' : ''}`}
                onClick={() => setIsPersonaOpen(!isPersonaOpen)}
            >
                <div {...keyboardAction}
                    className="p-profile-link"
                    onClick={profileToMy ? (e) => { e.stopPropagation(); navigate('/my'); } : undefined}
                >
                    <div className="p-avatar">{avatarChar}</div>
                    <div className="p-name">{nameText}</div>
                </div>
                <div {...keyboardAction} className="p-toggle-btn" aria-label="프로필 메뉴" aria-expanded={isPersonaOpen} onClick={event => { event.stopPropagation(); setIsPersonaOpen(value => !value); }}>
                    <div className="v-divider-small"></div>
                    <div className="p-badge">{badgeText}</div>
                    <div className={`p-chevron ${isPersonaOpen ? 'open' : ''}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
            </div>
            {isPersonaOpen && (
                <div className="persona-dropdown">
                    <div className="p-dropdown-header">내 스펙 정보</div>
                    <div className="p-dropdown-content">
                        <div className="p-spec-row">
                            <span className="p-label">거주지</span>
                            <span className="p-value">{regionText}</span>
                        </div>
                        <div className="p-spec-row">
                            <span className="p-label">나이</span>
                            <span className="p-value">{ageText}</span>
                        </div>
                        <div className="p-spec-row">
                            <span className="p-label">가구원</span>
                            <span className="p-value">{householdText}</span>
                        </div>
                    </div>
                    <div className="p-dropdown-footer">
                        <button className="p-service-btn" onClick={() => { navigate('/my'); setIsPersonaOpen(false); }}>마이페이지</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PersonaWidget;
