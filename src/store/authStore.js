// 인증 상태 저장 모듈 (localStorage 계층, 키 `clue_auth`).
// 흐름5 F5-b: 토큰·유저 정보 보관 + 로그인 상태 구독. 페이지/위젯은 이 모듈만 통한다.
//
// 저장 레코드 (localStorage 키 `clue_auth`):
//   { token: string, user: { id, email, createdAt } }
//
// 게스트 모드 완전 보존: 토큰이 없으면 isLoggedIn()=false → 모든 서버 동기화 경로가 no-op.

import { authSignup, authLogin } from '../api/client';

const KEY = 'clue_auth';
const listeners = new Set();

// localStorage 접근 방어(SSR·프라이빗 모드·미지원 환경).
function getLS() {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null;
    }
}

function read() {
    const ls = getLS();
    if (!ls) return null;
    try {
        const raw = ls.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.token) return null;
        return parsed;
    } catch {
        return null;
    }
}

function write(auth) {
    const ls = getLS();
    if (!ls) return false;
    try {
        ls.setItem(KEY, JSON.stringify(auth));
        return true;
    } catch {
        return false;
    }
}

function notify() {
    const snapshot = read();
    listeners.forEach(fn => {
        try { fn(snapshot); } catch { /* 구독자 예외 격리 */ }
    });
}

// 로그인 상태 변경 구독. 반환값은 구독 해제 함수.
export function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function getAuth() {
    return read();
}

export function getToken() {
    const a = read();
    return a ? a.token : null;
}

export function getUser() {
    const a = read();
    return a ? a.user : null;
}

export function isLoggedIn() {
    return !!getToken();
}

// 토큰·유저 직접 설정(내부/테스트용) + 구독 통지.
export function setAuth(auth) {
    if (auth && auth.token) {
        write({ token: auth.token, user: auth.user || null });
    }
    notify();
}

export function clearAuth() {
    const ls = getLS();
    if (ls) {
        try { ls.removeItem(KEY); } catch { /* 무시 */ }
    }
    notify();
}

// 회원가입: 서버 호출 → 토큰 저장 → 통지. 성공 시 {token,user} 반환, 실패 시 throw.
export async function signup(email, password) {
    const res = await authSignup(email, password);
    setAuth({ token: res.token, user: res.user });
    return res;
}

// 로그인: 서버 호출 → 토큰 저장 → 통지.
export async function login(email, password) {
    const res = await authLogin(email, password);
    setAuth({ token: res.token, user: res.user });
    return res;
}

// 로그아웃: 토큰 제거(로컬 계정 데이터 정리는 syncLayer.afterLogout가 담당).
export function logout() {
    clearAuth();
}

export default getAuth;
