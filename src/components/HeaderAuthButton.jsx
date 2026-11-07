import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authStore from '../store/authStore';
import { afterLogin, afterLogout } from '../store/syncLayer';
import AuthModal from './AuthModal';

// 헤더 로그인/로그아웃 버튼 (대시보드 표준 auth 패턴 재사용, P4-3).
// - 비로그인: 클릭 시 로그인 모달을 현재 페이지 위에 오픈(랜딩 이동 없음).
// - 로그인: 클릭 시 로그아웃(토큰 제거 + 계정 데이터 정리 + 게스트 백업 복원) → 랜딩('/') 이동.
// authStore 구독으로 라벨을 즉시 갱신한다. 버튼+모달을 한 컴포넌트로 캡슐화(AuthModal은 position:fixed라 위치 무관).
//
// props:
//   className     버튼 클래스(기본 'nav-btn primary' — 캘린더/업로드내역/신청현황/비교 헤더 공통)
//   onLoginSuccess 로그인/가입 성공 후 호출(페이지 데이터 갱신용, 선택)
function HeaderAuthButton({ className = 'nav-btn primary', onLoginSuccess }) {
    const navigate = useNavigate();
    const [isAuthed, setIsAuthed] = useState(() => authStore.isLoggedIn());
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => authStore.subscribe(() => setIsAuthed(authStore.isLoggedIn())), []);

    const handleClick = () => {
        if (isAuthed) {
            authStore.logout();   // 토큰 제거(구독 → 라벨 갱신)
            afterLogout();        // 계정 데이터 정리 + 게스트 백업 복원
            navigate('/');
        } else {
            setIsModalOpen(true);
        }
    };

    const handleSuccess = async () => {
        await afterLogin();       // 게스트 데이터 병합·풀다운
        if (onLoginSuccess) onLoginSuccess();
    };

    return (
        <>
            <button className={className} onClick={handleClick}>
                {isAuthed ? '로그아웃' : '로그인'}
            </button>
            <AuthModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={handleSuccess}
                initialMode="login"
            />
        </>
    );
}

export default HeaderAuthButton;
