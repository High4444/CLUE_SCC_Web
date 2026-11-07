import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { uploadAndAnalyze } from '../api/client';
import {
    getDocument,
    listDocuments,
    updateReview,
    upsertDocument,
} from '../store/documentStore';
import { savePdf, getPdf } from '../store/pdfStore';
import { extractDeadline } from '../utils/deadlineExtractor';
import { addEventForDoc } from '../store/calendarStore';
import { detectEducationEventCategory } from '../utils/detectEducationEventCategory';
import { getDemoByFileName, getDemoById, toDemoAnalysis } from '../data/demo';

// 분석 결과 보관소.
// 이관(흐름 1): sessionStorage(`clue_analyses`) → documentStore(localStorage) + pdfStore(IndexedDB).
// → 브라우저를 껐다 켜도 문서·분석 결과·원본 PDF·검토 진행이 유지된다.
const LEGACY_SESSION_KEY = 'clue_analyses';

// ── 원본 PDF 미리보기용 objectURL 맵 (모듈 레벨, 직렬화 제외) ──
// docId 단위로 objectURL을 보관해 좌측 패널에서 표시.
// 메모리 맵이 비었으면(재진입·재시작) pdfStore Blob으로 재생성한다.
const objectUrlMap = new Map(); // docId -> objectURL

export function getDocObjectUrl(docId) {
    return docId ? objectUrlMap.get(docId) || null : null;
}

// 메모리에 objectURL이 없으면 pdfStore(IndexedDB) Blob으로 재생성.
// 재진입·재시작 후 좌측 패널 원본 미리보기 복원용.
export async function ensureDocObjectUrl(docId) {
    if (!docId) return null;
    const existing = objectUrlMap.get(docId);
    if (existing) return existing;
    const blob = await getPdf(docId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrlMap.set(docId, url);
    return url;
}

// 백엔드 실응답 → 워크벤치 소비용 트림본(analysis 하위).
// markdown/blocks/renderMap 같은 대용량 필드는 용량 절감을 위해 제외.
function toAnalysis(result, fileName) {
    return {
        reconstructedPages: result.reconstructedPages,
        acidResults: result.acidResults,
        quiz: result.quiz, // 단일 객체면 그대로 저장 (어댑터는 소비측에서)
        reductionRate: result.reductionRate,
        // 규칙 기반 문서 카테고리(현재는 'education_event' 하나만) — 없으면 기존 정책 레이아웃.
        category: detectEducationEventCategory(fileName || result.fileName, result.reconstructedPages),
    };
}

// sessionStorage(구버전) → documentStore 1회 마이그레이션.
// 구조: { [docId]: storable }. 원본 PDF는 in-memory였으므로 복원 불가(메타·분석만 이관).
function migrateLegacySession() {
    try {
        if (typeof sessionStorage === 'undefined') return;
        const raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([docId, s]) => {
                if (!docId || !s || getDocument(docId)) return; // 이미 이관됨 → skip
                upsertDocument({
                    docId,
                    fileName: s.fileName || '분석한 공고문',
                    uploadedAt: Date.now(),
                    pages: Array.isArray(s.reconstructedPages) ? s.reconstructedPages.length : 0,
                    ocrUsed: !!s.ocrRequired || (Array.isArray(s.ocrPagesUsed) && s.ocrPagesUsed.length > 0),
                    status: 'reviewing',
                    analysis: toAnalysis(s),
                    review: { verifiedRiskIds: [], quizAnswered: false, lastViewedAt: Date.now() },
                    deadline: null,
                });
            });
        }
        // 이관 완료 → 구 키 정리
        sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
        // 파싱/스토리지 실패 → 마이그레이션 skip (앱 정상)
    }
}

// 마이그레이션은 앱 세션당 1회면 충분. 모듈 로드 시 즉시 수행.
let legacyMigrated = false;
function ensureLegacyMigrated() {
    if (legacyMigrated) return;
    legacyMigrated = true;
    migrateLegacySession();
}

// ── 같은 파일 재업로드 → 저장된 분석 재사용 ──
// 내용(SHA-256)이 같은 PDF를 이미 분석해 둔 문서가 있으면 서버를 다시 부르지 않고 그 문서를 연다.
// (Gemini 호출·수 분의 대기 절약). 강제 재분석: 주소에 ?fresh=1 을 붙이거나 이전 문서를 문서함에서 삭제.
async function sha256Hex(blob) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function findAnalyzedDocByContent(file) {
    try {
        if (new URLSearchParams(window.location.search).has('fresh')) return null;
        const target = await sha256Hex(file);
        for (const d of listDocuments()) {
            if (!Array.isArray(d.analysis?.reconstructedPages) || d.analysis.reconstructedPages.length === 0) continue;
            const blob = await getPdf(d.docId);
            if (blob && blob.size === file.size && (await sha256Hex(blob)) === target) return d.docId;
        }
    } catch {
        // 해시·스토리지 실패 → 재사용 포기, 정상 분석 경로로
    }
    return null;
}

const AnalysisContext = createContext(null);

export function AnalysisProvider({ children }) {
    // 구 sessionStorage 데이터가 있으면 최초 1회 store로 이관.
    const migratedRef = useRef(false);
    if (!migratedRef.current) {
        migratedRef.current = true;
        ensureLegacyMigrated();
    }

    const [status, setStatus] = useState('idle'); // 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'
    const [error, setError] = useState(null);
    // 분석 완료 시 bump → getAnalysis 소비자 재렌더 트리거.
    const [version, setVersion] = useState(0);
    // 마지막 업로드가 저장된 분석을 재사용했다면 그 docId (워크벤치에 "이전 분석 결과" 표시용)
    const [reusedDocId, setReusedDocId] = useState(null);

    const startAnalysis = useCallback(async (file) => {
        setError(null);
        setStatus('uploading');

        // ── 전시용(데모) 공고 ──
        // 분석 결과가 src/data/demo/*.json에 고정돼 있어 분석 API를 호출하지 않는다.
        // 본문은 저장하지 않고 demoId만 기록 → getAnalysis에서 레지스트리로 복원(용량 절감 + JSON 수정 즉시 반영).
        const demo = getDemoByFileName(file.name);
        if (demo) {
            setReusedDocId(null);
            const existing = listDocuments().find((d) => d.analysis?.demoId === demo.id);
            const docId = existing?.docId || crypto.randomUUID();

            try {
                objectUrlMap.set(docId, URL.createObjectURL(file));
            } catch {
                // objectURL 생성 실패 → 좌측 미리보기는 pdfStore에서 복원
            }

            if (existing) {
                // 같은 공고를 다시 올린 것 → 이해 점검만 풀기 전 상태로 되돌린다.
                updateReview(docId, { quizAnswered: false, quizCorrect: false, quizSelectedIdx: null });
            } else {
                upsertDocument({
                    docId,
                    fileName: demo.fileName,
                    uploadedAt: Date.now(),
                    pages: demo.pages.length,
                    ocrUsed: false,
                    status: 'reviewing',
                    analysis: { demoId: demo.id, isDemo: true, category: demo.category },
                    review: { verifiedRiskIds: [], quizAnswered: false, lastViewedAt: Date.now() },
                    deadline: null,
                });
            }

            await savePdf(docId, file);
            setVersion((v) => v + 1);
            setStatus('done');
            return docId;
        }

        const reusedId = await findAnalyzedDocByContent(file);
        if (reusedId) {
            // 다시 업로드한 것 → 이해 점검은 풀기 전 상태로 시작(확인한 항목 등 다른 검토 진행은 유지).
            updateReview(reusedId, { quizAnswered: false, quizCorrect: false, quizSelectedIdx: null });
            setReusedDocId(reusedId);
            setStatus('done');
            return reusedId;
        }
        setReusedDocId(null);

        const docId = crypto.randomUUID();

        // 좌측 패널 PDF 표시용 원본 objectURL 보관 (직렬화 제외).
        let objectUrl = null;
        try {
            objectUrl = URL.createObjectURL(file);
            objectUrlMap.set(docId, objectUrl);

            setStatus('analyzing');
            const result = await uploadAndAnalyze(file);

            // 부분 실패 규칙(ARCHITECTURE 계약): success && reconstructedPages 有 → 정상.
            // 그 외(빈 배열 포함)는 에러로 취급.
            const pages = result?.reconstructedPages;
            if (!result?.success || !Array.isArray(pages) || pages.length === 0) {
                throw new Error(
                    result?.error || '분석 결과를 만들지 못했습니다. 다른 공고문으로 다시 시도해 주세요.'
                );
            }

            // 신청 마감일 휴리스틱 추출(흐름3-b): I태그 항목에서 규칙 기반 추정.
            // 확신 없으면 null → 캘린더 이벤트도 만들지 않는다(오탐 방지).
            const deadline = extractDeadline(result.acidResults);

            // 문서함 등록(status 'reviewing') — 분석 성공 시 자동.
            const fileName = result.fileName || file.name;
            upsertDocument({
                docId,
                fileName,
                uploadedAt: Date.now(),
                pages: pages.length,
                ocrUsed: !!result.ocrRequired || (Array.isArray(result.ocrPagesUsed) && result.ocrPagesUsed.length > 0),
                status: 'reviewing',
                analysis: toAnalysis(result, fileName),
                review: { verifiedRiskIds: [], quizAnswered: false, lastViewedAt: Date.now() },
                deadline,
                // 휴리스틱 추정 → "추정" 라벨(사용자 결정③). 추출 실패(null)면 출처도 null.
                deadlineSource: deadline ? 'auto' : null,
            });

            // 마감일 추출 성공 시 캘린더에 자동 이벤트 등록(docId 연계 → 삭제 시 함께 제거).
            if (deadline) addEventForDoc({ docId, fileName, deadline, deadlineSource: 'auto' });

            // 원본 PDF Blob 보존(IndexedDB) — 재시작 후 미리보기 복원용.
            // 실패해도(미지원 등) 앱 흐름엔 영향 없음.
            await savePdf(docId, file);

            setVersion(v => v + 1);
            setStatus('done');
            return docId;
        } catch (e) {
            // 실패 시 보관한 objectURL 정리
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                objectUrlMap.delete(docId);
            }
            setError(e?.message || String(e));
            setStatus('error');
            throw e;
        }
    }, []);

    // documentStore에서 라이브 조회 → 재시작 후에도(컨텍스트 state 없이) 복원.
    const getAnalysis = useCallback(
        (docId) => {
            if (!docId) return null;
            const doc = getDocument(docId);
            if (!doc || !doc.analysis) return null;
            // 데모 공고: 본문을 저장하지 않으므로 레지스트리(JSON)에서 매번 복원한다.
            if (doc.analysis.demoId) {
                const demo = getDemoById(doc.analysis.demoId);
                if (demo) return { ...toDemoAnalysis(demo), fileName: doc.fileName };
            }
            return { ...doc.analysis, fileName: doc.fileName };
        },
        [version] // eslint-disable-line react-hooks/exhaustive-deps
    );

    return (
        <AnalysisContext.Provider value={{ status, error, startAnalysis, getAnalysis, reusedDocId }}>
            {children}
        </AnalysisContext.Provider>
    );
}

export function useAnalysis() {
    const ctx = useContext(AnalysisContext);
    if (!ctx) throw new Error('useAnalysis must be used within AnalysisProvider');
    return ctx;
}
