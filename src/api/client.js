// CLUE 백엔드 호출 단일 창구.
// ACID 분석 서버(:3001), 온통청년 정책 프록시 + 사용자 API(:3002)
import { getToken } from '../store/authStore';

const ACID_BASE = import.meta.env?.VITE_ACID_API || 'http://localhost:3001';
const POLICY_BASE = import.meta.env?.VITE_POLICY_API || 'http://localhost:3002';

// 로그인 상태면 :3002 요청에 Authorization 자동 첨부(흐름5 F5-b).
function authHeaders(extra = {}) {
    const headers = { ...extra };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// :3002 JSON 요청 공용 래퍼. 성공 시 파싱된 본문, 실패 시 서버 message로 throw(err.status 보존).
async function requestJson(path, { method = 'GET', body } = {}) {
    let res;
    try {
        res = await fetch(`${POLICY_BASE}${path}`, {
            method,
            headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch {
        const err = new Error('서버에 연결할 수 없습니다.');
        err.code = 'NETWORK';
        throw err;
    }
    let data = null;
    try { data = await res.json(); } catch { /* 본문 없음 */ }
    if (!res.ok) {
        const err = new Error((data && data.message) || `요청 실패 (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return data;
}

// Gemini 원문 에러(JSON 문자열)를 사용자용 문구로 바꾼다. 해당 없으면 원문 유지.
function friendlyAnalysisError(msg) {
    const m = String(msg || '');
    if (/RESOURCE_EXHAUSTED|"code":\s*429|quota/i.test(m)) {
        return '오늘 AI 분석 한도를 모두 사용했어요. 잠시 후(또는 내일) 다시 시도해 주세요.';
    }
    if (/UNAVAILABLE|"code":\s*503|high demand|overloaded/i.test(m)) {
        return 'AI 분석 서버가 혼잡해요. 잠시 후 다시 시도해 주세요.';
    }
    return m;
}

// ── PDF 업로드 → ACID 분석 (응답 계약: docs/ARCHITECTURE.md §4) ──
// 서버는 업로드 즉시 jobId를 발급하고 분석은 백그라운드로 진행한다(server/routes/upload.js).
// 여기서 GET /api/status/:jobId를 완료될 때까지 폴링해, 호출자에게는 예전과 동일하게
// "완료된 최종 결과"를 반환하는 것처럼 보이게 감싼다(AnalysisContext 등 소비측 무변경).
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 12 * 60 * 1000; // 서버 Gemini 호출 3회(시도당 200초) 최악의 경우보다 길게

export async function uploadAndAnalyze(file) {
    const formData = new FormData();
    formData.append('file', file);

    let res;
    try {
        res = await fetch(`${ACID_BASE}/api/upload`, {
            method: 'POST',
            body: formData,
        });
    } catch {
        const err = new Error('분석 서버에 연결할 수 없습니다.');
        err.code = 'NETWORK';
        throw err;
    }

    if (!res.ok) {
        let msg = `ACID 분석 실패 (${res.status})`;
        try {
            const bd = await res.json();
            msg = bd?.error || bd?.message || msg;
        } catch { /* 기본 문구 유지 */ }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }

    const { jobId } = await res.json();
    if (!jobId) {
        throw new Error('분석 작업을 시작하지 못했습니다.');
    }

    const startedAt = Date.now();
    while (true) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            const err = new Error('분석이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.');
            err.code = 'TIMEOUT';
            throw err;
        }

        let statusRes;
        try {
            statusRes = await fetch(`${ACID_BASE}/api/status/${jobId}`);
        } catch {
            continue; // 일시적 네트워크 끊김 → 다음 폴링에서 재시도
        }
        if (statusRes.status === 404) {
            const err = new Error('분석 작업이 사라졌습니다(서버가 재시작됐을 수 있어요). 다시 업로드해 주세요.');
            err.code = 'JOB_LOST';
            throw err;
        }
        if (!statusRes.ok) continue;

        const job = await statusRes.json();
        if (job.status === 'done') return job.result;
        if (job.status === 'error') {
            throw new Error(friendlyAnalysisError(job.error) || 'ACID 분석에 실패했습니다.');
        }
        // 'pending' → 계속 폴링
    }
}

// ── 정책 목록/상세(:3002 프록시) ──
export async function getPolicies(params = {}) {
    const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    const res = await fetch(`${POLICY_BASE}/api/policies${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`정책 목록 조회 실패 (${res.status})`);
    return res.json();
}

export async function getPolicyDetail(plcyNo) {
    const res = await fetch(`${POLICY_BASE}/api/policy-detail?plcyNo=${encodeURIComponent(plcyNo)}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`정책 상세 조회 실패 (${res.status})`);
    return res.json();
}

// ── 인증 /api/auth/* (흐름5 F5-a 계약) ──
export function authSignup(email, password) {
    return requestJson('/api/auth/signup', { method: 'POST', body: { email, password } });
}

export function authLogin(email, password) {
    return requestJson('/api/auth/login', { method: 'POST', body: { email, password } });
}

export function authMe() {
    return requestJson('/api/auth/me');
}

export function authChangePassword(currentPassword, newPassword) {
    return requestJson('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
}

// 회원 탈퇴: 비밀번호 재확인 후 계정·전 데이터 연쇄삭제(P4-6). JWT 필수.
export function authDeleteAccount(password) {
    return requestJson('/api/auth/me', { method: 'DELETE', body: { password } });
}

// ── 동기화 /api/sync/* (JWT 필수) ──
// domain: 'profile' | 'documents' | 'saved' | 'checklists' | 'events'
// key: 프로필은 없음(undefined), 나머지는 URL 키(docId/plcyNo/eventId).
function syncPath(domain, key) {
    return key !== undefined && key !== null
        ? `/api/sync/${domain}/${encodeURIComponent(key)}`
        : `/api/sync/${domain}`;
}

export function syncGet(domain) {
    return requestJson(`/api/sync/${domain}`);
}

export function syncPut(domain, key, body) {
    return requestJson(syncPath(domain, key), { method: 'PUT', body });
}

export function syncDelete(domain, key) {
    return requestJson(syncPath(domain, key), { method: 'DELETE' });
}

export function syncImport(body) {
    return requestJson('/api/sync/import', { method: 'POST', body });
}
