import { keyboardAction } from '../utils/keyboardAction';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import './DashboardPage.css';
import logoImg from '../assets/logo.png';
import { addRecentlyViewed } from './RecentlyViewedPage';
import { useAnalysis } from '../contexts/AnalysisContext';
import { getPolicies } from '../api/client';
import { mapPolicyToCard, deadlineBadgeLabel } from '../utils/policyAdapter';
import { getProfile } from '../store/profileStore';
import { profileToLclsfSet, filterPoliciesByLclsf, LCLSF } from '../utils/profileFilters';
import * as authStore from '../store/authStore';
import { afterLogout, afterLogin } from '../store/syncLayer';
import AuthModal from '../components/AuthModal';
import PolicyDetailModal from '../components/PolicyDetailModal';
import { LEVEL_TO_FILTER, computeVerdict } from '../utils/verdictEngine';
import { isEndDateExpired } from '../utils/policyDates';
import { rankPolicies } from '../utils/recommendRank';
import { listSaved, toggleSaved } from '../store/savedStore';
import { listUpcomingEvents } from '../store/calendarStore';
import { listDocuments } from '../store/documentStore';
import { buildEntriesFromDocs } from '../utils/checklistAdapter';
import { withDemoAnalysis } from '../data/demo';
import { getChecklistState, setItemDone } from '../store/checklistStore';
import PersonaWidget from '../components/PersonaWidget';

// 추천 공고 노출 개수(기존 UI 3건).
const RECOMMEND_COUNT = 3;
// 추천 샘플 크기 / 병합 상한 / 검색 페이지 크기.
// 실측(2026-10-11): 지자체 공고가 페이지마다 몰려 나온다(1~3쪽 세종·충북, 5쪽 경기, 6~8쪽 인천·광주).
// 1쪽 100건만 받으면 거주지와 무관한 지역의 공고만 잡히므로, 여러 쪽을 병렬로 받아 표본을 넓힌다.
// 추천 표본. 거주지 판정을 클라이언트에서 하므로(policyRegion.js) 표본은 지역과 무관하고,
// 전량(실측 totCount 3,238건 = 500×7쪽)을 받아 시·도가 고르게 잡히게 한다
// — 서울 78 · 경기 136 · 대구 42 · 강원 93 · 충남 316 · 전국 452 …
// 7쪽을 한꺼번에 던지면 프록시가 500을 뱉어서 3쪽씩 끊어 받는다(전체 ~6.4s, 첫 묶음 ~2.3s).
const SAMPLE_SIZE = 500;
const SAMPLE_PAGES = 7;
const SAMPLE_WAVE = 3;
const MERGE_CAP = 4000;
const SEARCH_PAGE_SIZE = 20;

// 세션당 한 번만 받는 추천 표본(거주지와 무관하므로 재사용 가능).
let samplePromise = null;

// 표본 적재. SAMPLE_WAVE쪽씩 끊어 받고 묶음마다 onPartial로 넘겨 첫 화면이 전체 완료를 기다리지 않게 한다.
// 두 번째 이후 호출은 진행 중/완료된 결과를 그대로 받는다.
function loadPolicySample(onPartial) {
    if (!samplePromise) {
        samplePromise = (async () => {
            const merged = [];
            const seen = new Set();
            const partials = [];
            for (let start = 1; start <= SAMPLE_PAGES; start += SAMPLE_WAVE) {
                const pages = [];
                for (let n = start; n < start + SAMPLE_WAVE && n <= SAMPLE_PAGES; n += 1) pages.push(n);
                const results = await Promise.all(pages.map((pageNum) =>
                    getPolicies({ pageNum, pageSize: SAMPLE_SIZE, rtnType: 'json' })
                        .then((r) => (Array.isArray(r?.policies) ? r.policies : []))
                        .catch(() => [])
                ));
                for (const arr of results) {
                    for (const item of arr) {
                        const no = item?.plcyNo;
                        if (no && seen.has(no)) continue;
                        if (no) seen.add(no);
                        merged.push(item);
                        if (merged.length >= MERGE_CAP) break;
                    }
                }
                partials.push(merged.slice());
                samplePromise.partials = partials; // 뒤늦게 붙는 구독자용
                samplePromise.onPartial?.(merged.slice());
            }
            return merged;
        })();
    }
    samplePromise.onPartial = onPartial;
    (samplePromise.partials || []).slice(-1).forEach(onPartial); // 이미 받아둔 게 있으면 즉시 반영
    return samplePromise.then(onPartial);
}

// 헤더 카테고리 칩 → lclsfNm 분류(정본). 'ALL'은 무필터(전체 추천).
// 라벨은 기존 톤(#해시태그) 유지하며 분류 정본에 맞춰 축약.
const CATEGORY_CHIPS = [
    { key: 'ALL', label: '#전체' },
    { key: LCLSF.HOUSING, label: '#주거' },
    { key: LCLSF.JOB, label: '#일자리' },
    { key: LCLSF.EDU, label: '#교육' },
    { key: LCLSF.WELFARE, label: '#금융·복지' },
];

// 내 최근 검색어 store (localStorage `clue_recent_searches`).
// 스키마: 문자열 배열(최근 순, 최대 5개). 검색 실행 시 앞에 추가·중복 제거·상한 절삭.
const RECENT_KEY = 'clue_recent_searches';
const RECENT_MAX = 5;

function readRecentSearches() {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter(s => typeof s === 'string' && s.trim()) : [];
    } catch {
        return [];
    }
}

function pushRecentSearch(q) {
    const cur = readRecentSearches();
    const next = [q, ...cur.filter(s => s !== q)].slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 저장 실패 무시 */ }
    return next;
}

// 최근 검색어 개별 삭제(P3-7).
function removeRecentSearch(term) {
    const next = readRecentSearches().filter(s => s !== term);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 저장 실패 무시 */ }
    return next;
}

// 프로필이 없을 때(판정 불가) 모든 카드에 노출하는 중립 배지.
// 색 modifier 없이 기본 .p-badge(중립)만 사용.
const NEUTRAL_BADGE = { level: 'neutral', text: '분석 전', title: '' };

// 프록시(:3002) 미기동·에러·빈 응답 시 그대로 노출하는 폴백(기존 하드코딩 3건).
const FALLBACK_POLICIES = [
    { id: 'policy-1', title: '취업날개 서비스', agency: '서울시', category: '취업', tags: ['취업'], deadline: '12/31 마감', link: 'https://plus.gov.kr/portal/benefitV2/benefitTotalSrvcList/benefitSrvcDtl?svcSeq=1004930&bnefType=all&svcId=611000000144' },
    { id: 'policy-2', title: '서울 청년수당 지원', agency: '서울시', category: '복지', tags: ['청년', '복지'], deadline: '매년 공고문 확인', link: 'https://plus.gov.kr/portal/benefitV2/benefitTotalSrvcList/benefitSrvcDtl?svcSeq=1002456&bnefType=all&svcId=611000000126' },
    { id: 'policy-3', title: '청년 희망주택 대출이자 지원', agency: '국토교통부', category: '주거', tags: ['주거', '청년'], deadline: '상시 확인', link: 'https://plus.gov.kr/portal/benefitV2/benefitTotalSrvcList/benefitSrvcDtl?svcSeq=2113723&bnefType=all&svcId=627000000721' },
];

const DashboardPage = () => {
    const navigate = useNavigate();
    const { startAnalysis } = useAnalysis();
    // Dynamic Date Calculation for Schedule Widget
    const today = new Date();
    const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayName = weekdays[today.getDay()];
    const dayNum = today.getDate();

    // states
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState(null);
    const progressTimer = useRef(null);
    const [activeFilter, setActiveFilter] = useState('ALL');
    // 지역 스코프로 받은 원본 정책 샘플(raw). 카테고리 칩 클라이언트 분류·추천 랭킹의 원천.
    // 비어 있으면(프록시 미기동 등) 폴백(FALLBACK_POLICIES) 카드로 렌더.
    const [policySample, setPolicySample] = useState([]);
    // 헤더 카테고리 칩 필터(lclsfNm) — 'ALL'=무필터.
    const [activeChip, setActiveChip] = useState('ALL');
    // 추천/칩 모드에서 노출 카드 수(더보기로 증가).
    const [visibleCount, setVisibleCount] = useState(RECOMMEND_COUNT);
    // 검색 모드 상태(공고명 서버 검색).
    const [searchInput, setSearchInput] = useState('');
    const [searchActive, setSearchActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');   // 실행된 질의(라벨·페이지네이션용)
    const [searchCards, setSearchCards] = useState([]);
    const [searchTotCount, setSearchTotCount] = useState(0);
    const [searchPage, setSearchPage] = useState(1);
    const [searchHasMore, setSearchHasMore] = useState(false);
    // 내 최근 검색어(드롭다운).
    const [recentSearches, setRecentSearches] = useState(() => readRecentSearches());
    // 헤더 로그인/로그아웃 상태(authStore 구독으로 반영).
    const [isAuthed, setIsAuthed] = useState(() => authStore.isLoggedIn());
    // 로그인 모달(현재 페이지 위에 오픈 — 랜딩 이동 없음, 결정 D).
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    // 세션 중 문서/체크리스트 갱신 트리거(A2): 포커스·로그인 시 위젯 재계산.
    const [refreshTick, setRefreshTick] = useState(0);
    const [isMenuOpen, setIsMenuOpen] = useState(true);
    // 찜한 정책 id 집합(savedStore) — 추천 카드 찜 버튼 상태 표시용.
    const [savedIds, setSavedIds] = useState(() => new Set(listSaved().map(p => p.id)));
    // 캘린더 실이벤트 기반 다가오는 일정(F3-b). clue_added_events에서 마감 임박순.
    const upcomingEvents = listUpcomingEvents(new Date(), 3);
    // 오늘 마감 건수(B9): 위젯 날짜 카드의 하드코딩 "오늘 일정 없음"을 실데이터로 대체.
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const todayDueCount = listUpcomingEvents(new Date(), 50).filter(ev => ev._ts === todayStart).length;

    // 프로필이 있으면 추천에 지역·분야 필터 반영 + 실판정 배지/필터 탭 노출.
    // getProfile()은 매 렌더 새 객체를 돌려줘 useMemo deps가 매번 깨진다.
    // 표본이 3,000건대라 랭킹을 매 렌더 다시 돌리면 비싸므로 내용이 같으면 같은 객체를 쓴다.
    const profileKey = JSON.stringify(getProfile() || null);
    const profile = useMemo(() => JSON.parse(profileKey), [profileKey]);
    // 실집계 데이터 도착 여부(폴백이면 false). 판정 필터 탭은 프로필 有 + 실데이터일 때만 노출(D7).
    // (폴백 3건은 verdict가 없어 전부 중립 → 필터가 무의미하므로 숨김.)
    const [isRealData, setIsRealData] = useState(false);
    // 판정 필터 탭: 프로필 있을 때, 추천(실데이터) 또는 검색 모드에서 노출(P3-3).
    // 검색 결과 카드에도 verdict를 부착하므로 검색 모드에서도 필터가 유의미하다.
    const SHOW_VERDICT_FILTERS = !!profile && (isRealData || searchActive);
    // 정책 상세 모달(P3-1): 열려 있으면 클릭한 카드, 닫히면 null. plcyNo = card.id.
    const [detailCard, setDetailCard] = useState(null);
    // "공고문 PDF로 분석하기" 유도 시 스크롤 대상(업로드 존).
    const [activeProgressIndex, setActiveProgressIndex] = useState(0);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [toastMsg, setToastMsg] = useState('');
    // 신청 준비 체크리스트(F4-b): 검토완료 문서 → checklistAdapter 실엔트리. 진행 상태는 checklistStore.
    const [applyEntries, setApplyEntries] = useState(() => buildEntriesFromDocs(listDocuments().map(withDemoAnalysis), getChecklistState));
    const totalProgressItems = applyEntries.length; // 진행 중인 공고 수(실카운트)

    // 체크 항목 토글 → checklistStore 실저장 후 엔트리 재빌드.
    const toggleChecklistItem = (docId, itemId, done) => {
        setItemDone(docId, itemId, !done);
        setApplyEntries(buildEntriesFromDocs(listDocuments().map(withDemoAnalysis), getChecklistState));
    };

    // 이어서 하기 배너(F4-b): 최근 임시저장(분석 직후 reviewing 포함) 문서. 없으면 배너 숨김.
    // A2: refreshTick(포커스/로그인)으로 세션 중에도 재계산.
    const continueDoc = useMemo(
        () => listDocuments().find(d => d.status === 'saved' || d.status === 'reviewing') || null,
        [refreshTick]
    );

    // A2: 다른 탭/페이지에서 돌아오면(포커스) 문서·체크리스트 위젯을 재계산(가벼운 트리거).
    useEffect(() => {
        const onFocus = () => setRefreshTick(t => t + 1);
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    // refreshTick 변화 시 신청 체크리스트 엔트리 재빌드(continueDoc은 useMemo가 재계산).
    useEffect(() => {
        setApplyEntries(buildEntriesFromDocs(listDocuments().map(withDemoAnalysis), getChecklistState));
    }, [refreshTick]);

    // 추천 카드 찜 토글(F3-a). savedStore(localStorage `clue_saved_policies`)에 실저장.
    const handleToggleSaved = (policy) => {
        const nowSaved = toggleSaved(policy);
        setSavedIds(new Set(listSaved().map(p => p.id)));
        setToastMsg(nowSaved
            ? `완료! [${policy.title}] 공고를 찜했습니다.`
            : `[${policy.title}] 공고 찜을 해제했습니다.`);
        setTimeout(() => setToastMsg(''), 3000);
    };

    // 정책 카드 제목 클릭(P3-1): 상세 모달 오픈 + 최근 본 목록 기록.
    // (기존 window.open 직접 이동 → 모달 안 "신청 페이지 열기"로 통합.)
    const handlePolicyClick = (policy) => {
        addRecentlyViewed({ ...policy, dday: policy.deadline });
        setDetailCard(policy);
    };

    // 모달에서 찜/최근본이 바뀐 뒤 대시보드 찜 상태 재동기화.
    const refreshSavedIds = () => setSavedIds(new Set(listSaved().map(p => p.id)));
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) startUpload(file);
    };

    const handleFileInput = (e) => {
        const file = e.target.files?.[0];
        if (file) startUpload(file);
        e.target.value = ''; // 같은 파일 재선택 허용
    };

    // 업로드 진행바 타이머 정리
    useEffect(() => () => {
        if (progressTimer.current) clearInterval(progressTimer.current);
    }, []);

    // 추천 공고 실연동(P1-5 · F4-e · 결정② 가중치 랭킹): 마운트 시 온통청년 프록시(:3002)에서 조회.
    // 폴백은 이미 초기 state(FALLBACK_POLICIES)로 렌더 중 — 도착하면 교체(레이아웃 점프 없음).
    // 프록시 미기동·에러·빈 응답 시 폴백 유지(시연 안전장치).
    //
    // 표본은 거주지와 무관하게 전량을 받고(loadPolicySample, 세션 캐시), 거주지·연령·분야 대조는
    // 전부 아래 baseCards의 rankPolicies에서 한다. 따라서 설정에서 거주지를 바꿔도 재조회 없이
    // 바로 다시 정렬된다(예전에는 마운트 때 받은 지역 표본이 그대로 남아 있었다).
    //   가중치(recommendRank): 거주지 일치 +3·타지역 −8 / 분야 일치 +3 / safe +2·danger −2 / 마감 14일내 +1.
    useEffect(() => {
        let cancelled = false;
        loadPolicySample((list) => {
            if (cancelled || list.length === 0) return;
            setPolicySample(list);
            setIsRealData(true); // 실집계 도착 → 판정 필터 탭 활성 근거(D7)
        }).catch(() => { /* 프록시 미기동·에러 → 폴백(FALLBACK_POLICIES) 유지 */ });
        return () => { cancelled = true; };
    }, []);

    // 헤더 로그인/로그아웃 상태 반영(authStore 구독). 로그인/로그아웃 시 즉시 라벨 갱신.
    useEffect(() => authStore.subscribe(() => setIsAuthed(authStore.isLoggedIn())), []);

    // 관심 분야 집합(태그 합집합 > 취업상태) — 추천 랭킹 가점에 사용.
    const lclsfSet = useMemo(() => profileToLclsfSet(profile), [profile]);

    // 추천/칩 모드 기본 카드: 원본 샘플 → (칩 분류) → 가중치 랭킹 → 카드(+판정).
    // 샘플이 없으면(프록시 미기동) 폴백 3건. 검색 모드는 이 목록 대신 searchCards를 노출.
    const baseCards = useMemo(() => {
        if (!policySample.length) return FALLBACK_POLICIES;
        const scoped = activeChip === 'ALL'
            ? policySample
            : filterPoliciesByLclsf(policySample, activeChip);
        return rankPolicies(scoped, { lclsfSet, profile })
            .map(x => ({ ...mapPolicyToCard(x.policy), verdict: x.verdict }))
            .filter(c => c.title);
    }, [policySample, activeChip, lclsfSet, profile]);

    // 검색 결과 카드 매핑(P3-3·P3-4): 카드 뷰모델 + 실판정(verdict, 프로필 있을 때) + 만료 플래그.
    // baseCards(추천)는 rankPolicies가 만료를 제외하지만, 검색은 만료 공고도 "마감됨" 배지로 노출.
    const toSearchCard = (p) => ({
        ...mapPolicyToCard(p),
        verdict: profile ? computeVerdict(p, profile) : undefined,
        expired: isEndDateExpired(p?.aplyYmd),
    });

    // 검색 실행(엔터/버튼/최근검색어 클릭). 공고명(plcyNm) 서버 검색(:3002) → 결과 카드로 교체.
    // 서버 검색 실패 시 로드된 지역 샘플에 대한 클라이언트 텍스트 필터로 폴백.
    const runSearch = async (raw) => {
        const q = (raw !== undefined ? raw : searchInput).trim();
        if (!q) { clearSearch(); return; }
        setSearchInput(q);
        setSearchQuery(q);
        setRecentSearches(pushRecentSearch(q));
        setIsSearchOpen(false);
        setActiveFilter('ALL');
        setActiveChip('ALL');
        try {
            const res = await getPolicies({ plcyNm: q, pageNum: 1, pageSize: SEARCH_PAGE_SIZE, rtnType: 'json' });
            const policies = Array.isArray(res?.policies) ? res.policies : [];
            const cards = policies.map(toSearchCard).filter(c => c.title);
            const tot = Number(res?.pagging?.totCount);
            const total = Number.isFinite(tot) ? tot : cards.length;
            setSearchCards(cards);
            setSearchTotCount(total);
            setSearchPage(1);
            setSearchHasMore(SEARCH_PAGE_SIZE < total && cards.length > 0);
            setSearchActive(true);
        } catch {
            // 서버 검색 실패 → 로드된 샘플에서 제목 부분일치(클라이언트 폴백).
            const cards = policySample
                .map(toSearchCard)
                .filter(c => c.title && c.title.includes(q));
            setSearchCards(cards);
            setSearchTotCount(cards.length);
            setSearchHasMore(false);
            setSearchActive(true);
        }
    };

    // 검색어 지우기 → 원래 추천 복귀.
    const clearSearch = () => {
        setSearchActive(false);
        setSearchInput('');
        setSearchQuery('');
        setSearchCards([]);
        setSearchTotCount(0);
        setSearchPage(1);
        setSearchHasMore(false);
    };

    const handleSearchInputChange = (e) => {
        const v = e.target.value;
        setSearchInput(v);
        if (v.trim() === '' && searchActive) clearSearch();
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
    };

    // 카테고리 칩 클릭 → lclsfNm 클라이언트 필터. 검색 중이면 검색 종료 후 추천 필터로 전환.
    const handleChipClick = (key) => {
        if (searchActive) clearSearch();
        setActiveChip(key);
        setActiveFilter('ALL');
        setVisibleCount(RECOMMEND_COUNT);
    };

    // 더보기: 검색 모드면 다음 페이지(pageNum+1) 서버 로드 append, 추천/칩 모드면 랭킹 목록에서 더 노출.
    const handleMore = async () => {
        if (searchActive) {
            const next = searchPage + 1;
            try {
                const res = await getPolicies({ plcyNm: searchQuery, pageNum: next, pageSize: SEARCH_PAGE_SIZE, rtnType: 'json' });
                const policies = Array.isArray(res?.policies) ? res.policies : [];
                const more = policies.map(toSearchCard).filter(c => c.title);
                setSearchCards(prev => {
                    const seen = new Set(prev.map(c => c.id));
                    return [...prev, ...more.filter(c => !seen.has(c.id))];
                });
                setSearchPage(next);
                setSearchHasMore(more.length > 0 && next * SEARCH_PAGE_SIZE < searchTotCount);
            } catch {
                setSearchHasMore(false);
            }
        } else {
            setVisibleCount(c => c + RECOMMEND_COUNT);
        }
    };

    // 헤더 로그인/로그아웃 버튼.
    const handleAuthClick = () => {
        if (isAuthed) {
            authStore.logout();     // 토큰 제거(구독 → 라벨 갱신)
            afterLogout();          // 계정 데이터 정리 + 게스트 백업 복원
            navigate('/');
        } else {
            // 결정 D: 랜딩 이동 대신 현재 페이지 위에 로그인 모달 즉시 오픈.
            setIsAuthModalOpen(true);
        }
    };

    // 로그인/가입 성공(모달) 후처리: 게스트 데이터 병합·풀다운 → 현재 페이지 유지 + 위젯 갱신.
    const handleAuthSuccess = async () => {
        await afterLogin();
        setRefreshTick(t => t + 1);
        setSavedIds(new Set(listSaved().map(p => p.id)));
    };

    // 서버와 동일 기준: PDF만, 20MB 이하
    const validateFile = (file) => {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (!isPdf) return 'PDF 파일만 업로드할 수 있습니다.';
        if (file.size > 20 * 1024 * 1024) return '파일이 너무 큽니다. 20MB 이하 PDF를 올려주세요.';
        return null;
    };

    // 실제 업로드 → ACID 분석 → 완료 시 워크벤치로 이동.
    const startUpload = async (file) => {
        const validationError = validateFile(file);
        if (validationError) {
            setUploadError(validationError);
            return;
        }
        setUploadError(null);
        setIsUploading(true);
        setUploadProgress(0);

        // 진행바: 업로드 구간(빠르게 ~15%) → 분석 구간(천천히, 90% 상한에서 대기).
        // 백엔드 분석은 60~120초 소요 → 완료(startAnalysis resolve) 전까지 100% 도달 금지.
        if (progressTimer.current) clearInterval(progressTimer.current);
        progressTimer.current = setInterval(() => {
            setUploadProgress(p => {
                if (p < 15) return p + 3;          // 업로드 구간: 빠르게
                if (p < 70) return p + 1;          // 분석 초반: 꾸준히
                if (p < 90) return Math.random() < 0.5 ? p + 1 : p; // 분석 후반: 느리게
                return p;                          // 90% 상한 유지
            });
        }, 400);

        try {
            const docId = await startAnalysis(file);
            if (progressTimer.current) clearInterval(progressTimer.current);
            setUploadProgress(100);
            setTimeout(() => {
                setIsUploading(false);
                navigate(`/workbench/${docId}`);
            }, 500);
        } catch (e) {
            if (progressTimer.current) clearInterval(progressTimer.current);
            setIsUploading(false);
            setUploadProgress(0);
            setUploadError(e?.message || '분석 중 오류가 발생했습니다.');
        }
    };

    // 현재 노출 카드: 검색 모드면 검색 결과, 아니면 추천/칩 목록에서 visibleCount만큼.
    const listCards = searchActive ? searchCards : baseCards.slice(0, visibleCount);

    // 판정 필터 탭 적용(프로필 있을 때만 탭 노출). 폴백/무판정 카드는 중립.
    const filteredPolicies = listCards.filter(policy => {
        if (activeFilter === 'ALL') return true;
        const v = policy.verdict || NEUTRAL_BADGE;
        return LEVEL_TO_FILTER[v.level] === activeFilter;
    });

    // 더보기 버튼 노출: 검색 모드면 다음 페이지 有, 추천/칩 모드면 랭킹 목록이 더 있을 때.
    const showMoreBtn = searchActive ? searchHasMore : baseCards.length > visibleCount;

    return (
        <div className="db-wrapper">
            {/* Header */}
            <header className="db-top-nav">
                <div className="db-header-left">
                    <div {...keyboardAction} className="logo cursor-pointer" onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center' }}>
                        <img src={logoImg} alt="CLUE Logo" style={{ height: '32px' }} />
                    </div>

                    {/* Header Integrated Search (Option 1) */}
                    <div className="header-search-container" onClick={() => setIsSearchOpen(true)}>
                        <div className="search-box-header">
                            <span {...keyboardAction} aria-label="공고 검색" className="search-icon-header" onClick={(e) => { e.stopPropagation(); runSearch(); }} style={{ cursor: 'pointer' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </span>
                            <input
                                type="text"
                                placeholder="공고명 검색"
                                value={searchInput}
                                onChange={handleSearchInputChange}
                                onKeyDown={handleSearchKeyDown}
                                onClick={(e) => { e.stopPropagation(); setIsSearchOpen(true); }}
                            />
                        </div>

                        {/* Recent Search Dropdown (내 최근 검색어) */}
                        {isSearchOpen && recentSearches.length > 0 && (
                            <div className="popular-search-dropdown" onClick={(e) => e.stopPropagation()}>
                                <div className="ps-header">
                                    <div className="ps-title">최근 검색어</div>
                                    <button className="ps-close-btn" onClick={() => setIsSearchOpen(false)}>✕</button>
                                </div>
                                <div className="ps-list">
                                    {recentSearches.map((term) => (
                                        <div className="ps-item" key={term}>
                                            <span {...keyboardAction} className="ps-text" style={{ cursor: 'pointer', flex: 1 }} onClick={() => runSearch(term)}>{term}</span>
                                            <button
                                                className="ps-item-remove"
                                                title="검색어 삭제"
                                                onClick={(e) => { e.stopPropagation(); setRecentSearches(removeRecentSearch(term)); }}
                                            >✕</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="h-search-divider"></div>
                        <div className="header-category-chips">
                            {CATEGORY_CHIPS.map(chip => (
                                <span {...keyboardAction}
                                    key={chip.key}
                                    className={`h-cat-chip ${activeChip === chip.key ? 'active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); handleChipClick(chip.key); }}
                                    style={{ cursor: 'pointer' }}
                                >{chip.label}</span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="nav-right">
                    <PersonaWidget profileToMy />
                    <button className="nav-btn primary" onClick={handleAuthClick}>{isAuthed ? '로그아웃' : '로그인'}</button>
                </div>
            </header>

            <main className="db-container">

                {/* 2. Slim Horizontal Banner (Matched to User Image) */}
                <div
                    className={`upload-hero-container dashed-banner ${isDragging ? 'drag-active' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className="upload-hero-inner-horizontal">
                        {isUploading ? (
                            <div className="uploading-state-horizontal">
                                <div className="progress-bar-container-slim">
                                    <div className="progress-bar-fill-slim" style={{ width: `${uploadProgress}%` }}></div>
                                </div>
                                <div className="progress-text-slim">ACID 엔진 분석 중... {uploadProgress}%</div>
                            </div>
                        ) : (
                            <div className="upload-banner-layout">
                                <div className="banner-text-group">
                                    <div className="banner-badge-row">
                                        <span className="core-tech-tag">CORE TECHNOLOGY</span>
                                    </div>
                                    <h1 className="banner-title">복잡한 공고문, 신청 전에 먼저 업로드하세요</h1>
                                    {uploadError ? (
                                        <p className="banner-desc" style={{ color: 'var(--color-warning)', fontWeight: 700 }}>{uploadError}</p>
                                    ) : (
                                        <p className="banner-desc">ACID 엔진이 공고문을 분석해 놓치면 안 되는 조건과 준비 항목을 먼저 짚어줍니다.</p>
                                    )}
                                </div>
                                <div className="banner-grid-overlay"></div>
                                <div className="banner-action-group">
                                    <label {...keyboardAction} className="banner-upload-btn-blue">
                                        <input type="file" id="ub-file-input" accept=".pdf" style={{ display: 'none' }} onChange={handleFileInput} />
                                        <div className="btn-contents">
                                            <svg className="upload-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                            <span className="text">파일 올리기</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="db-main-grid">
                    {/* Left Column */}
                    <div className="left-panel">

                        {/* Recommended Policies with AI Filters */}
                        <div className="recommend-section">
                            <div className="section-head">
                                {searchActive ? (
                                    <>
                                        <span className="small-title text-blue">검색 결과 {searchTotCount}건</span>
                                        <h2>‘<strong className="text-blue semibold-name">{searchQuery}</strong>’ 검색 결과</h2>
                                    </>
                                ) : (
                                    <>
                                        <span className="small-title text-blue">추천 공고</span>
                                        <h2>지금 <strong className="text-blue semibold-name">확인하면 좋은</strong> 공고</h2>
                                    </>
                                )}
                            </div>
                            <div className="filter-tabs">
                                <button className={`filter-btn ${activeFilter === 'ALL' ? 'active' : ''}`} onClick={() => setActiveFilter('ALL')}>전체 보기</button>
                                {/* 판정 3개 탭은 실판정이 없어 현재 숨김 — 흐름 2에서 실판정 붙일 때 부활. */}
                                {SHOW_VERDICT_FILTERS && (
                                    <>
                                        <button className={`filter-btn ${activeFilter === 'SAFE' ? 'active' : ''}`} onClick={() => setActiveFilter('SAFE')}><span className="dot safe"></span> 신청 가능성 높음</button>
                                        <button className={`filter-btn ${activeFilter === 'WARN' ? 'active' : ''}`} onClick={() => setActiveFilter('WARN')}><span className="dot warn"></span> 서류 확인 필요</button>
                                        <button className={`filter-btn ${activeFilter === 'DANGER' ? 'active' : ''}`} onClick={() => setActiveFilter('DANGER')}><span className="dot danger"></span> 기준 검토 요망</button>
                                    </>
                                )}
                            </div>

                            <div className="policy-list">
                                {filteredPolicies.map((policy, i) => {
                                    // 프로필 있으면 실판정 배지(색+툴팁), 없으면 중립("분석 전").
                                    const verdict = policy.verdict || NEUTRAL_BADGE;
                                    const badgeCls = verdict.level && verdict.level !== 'neutral' ? ` ${verdict.level}` : '';
                                    return (
                                        <div className="policy-item-rect" key={policy.id || i}>
                                            <div className="p-num bg-blue-grad">{i + 1}</div>
                                            <div className="p-content">
                                                <div className="p-header">
                                                    <span className={`p-badge${badgeCls}`} title={verdict.title || undefined}>{verdict.text}</span>
                                                    {policy.expired && <span className="p-badge expired">마감됨</span>}
                                                </div>
                                                <h3 {...keyboardAction} className="hover-link" onClick={() => handlePolicyClick({ ...policy, dday: policy.deadline })}>{policy.title} <span className="arrow">&gt;</span></h3>
                                                <div className="p-meta">
                                                    {deadlineBadgeLabel(policy.deadline) && <span className="p-deadline">{deadlineBadgeLabel(policy.deadline)}</span>}
                                                    {' '}{policy.agency}{policy.category ? ` • ${policy.category}` : ''}
                                                </div>
                                            </div>
                                            <div className="p-action-group">
                                                <button className="btn-save" onClick={() => handleToggleSaved(policy)}>
                                                    {savedIds.has(policy.id) ? '찜 완료 ✓' : '찜하기'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {searchActive && filteredPolicies.length === 0 && (
                                    <div className="p-meta" style={{ padding: '16px 4px' }}>‘{searchQuery}’에 대한 검색 결과가 없습니다.</div>
                                )}
                                {showMoreBtn && (
                                    <button className="btn-more-blue-wide" onClick={handleMore}>더보기</button>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Right Panel */}
                    <div className="right-panel">

                        {/* Calendar Schedule */}
                        <div className="schedule-section">
                            <div className="small-title text-blue">예정된 일</div>
                            <h2 {...keyboardAction} className="hover-link" onClick={() => navigate('/calendar')}>다가오는 일정</h2>
                            <div className="schedule-content">
                                <div className="calendar-date-widget">
                                    <div className="day-name">{dayName}</div>
                                    <div className="day-num">{dayNum}</div>
                                    <div className="day-desc">{todayDueCount > 0 ? `오늘 마감 ${todayDueCount}건` : '오늘 일정 없음'}</div>
                                </div>
                                <div className="schedule-list">
                                    {upcomingEvents.length > 0 ? (
                                        upcomingEvents.map((ev) => {
                                            const evd = new Date(ev._ts);
                                            const diffDays = Math.round((new Date(evd.getFullYear(), evd.getMonth(), evd.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
                                            const dateLabel = diffDays === 0 ? '오늘' : diffDays === 1 ? '내일' : `${evd.getMonth() + 1}월 ${evd.getDate()}일 ${weekdays[evd.getDay()]}`;
                                            return (
                                                <div {...keyboardAction} className="s-row" key={ev.id} onClick={() => navigate('/calendar')} style={{ cursor: 'pointer' }}>
                                                    <div className="s-date">{dateLabel}</div>
                                                    <div className="s-item">
                                                        <span className="s-icon">📅</span>
                                                        <div className="s-item-text">
                                                            <strong>{ev.name}</strong>
                                                            <span>신청 마감</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="s-row">
                                            <div className="s-date">—</div>
                                            <div className="s-item">
                                                <span className="s-icon">📅</span>
                                                <div className="s-item-text">
                                                    <strong>다가오는 마감 일정이 없습니다</strong>
                                                    <span>공고문을 분석하면 마감일이 자동 등록됩니다</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Preparation Checklist */}
                        <div className="progress-section">
                            <div {...keyboardAction} className="small-title text-blue" onClick={() => navigate('/applied')} style={{ cursor: 'pointer' }}>신청 준비 체크리스트</div>
                            <div className="p-card-head">
                                <h2 {...keyboardAction} onClick={() => navigate('/applied')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }} className="db-cl-hover-link">
                                    체크리스트 <span className="count-badge">{totalProgressItems}건</span>
                                    <span className="db-cl-link-arrow" style={{ fontSize: '0.8125rem', color: '#3B82F6', fontWeight: 'bold', marginLeft: '4px' }}>바로가기 ↗</span>
                                </h2>
                                <div className="p-nav">
                                    <button
                                        onClick={() => setActiveProgressIndex(Math.max(0, activeProgressIndex - 1))}
                                        disabled={activeProgressIndex === 0}
                                    >&lt;</button>
                                    <button
                                        onClick={() => setActiveProgressIndex(Math.min(totalProgressItems - 1, activeProgressIndex + 1))}
                                        disabled={activeProgressIndex >= totalProgressItems - 1}
                                    >&gt;</button>
                                </div>
                            </div>

                            <div className="progress-flow-container">
                                {totalProgressItems === 0 ? (
                                    /* 검토완료 문서 0건 → 빈 안내(기존 스타일 유지) */
                                    <div className="flow-item active">
                                        <div className="flow-header">
                                            <div className="flow-title-row">
                                                <h3>진행 중인 체크리스트가 없습니다</h3>
                                            </div>
                                        </div>
                                        <div className="checklist-container">
                                            <div className="checklist-item">
                                                <div className="cl-checkbox"></div>
                                                <div className="cl-label-wrap">
                                                    <span className="cl-label">공고문을 분석하고 [검토완료]하면 준비 체크리스트가 자동으로 만들어집니다.</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button className="btn-next-step" onClick={() => navigate('/history')}>내 문서함 보기 &gt;</button>
                                    </div>
                                ) : (() => {
                                    const entry = applyEntries[Math.min(activeProgressIndex, totalProgressItems - 1)];
                                    return (
                                        <div className="flow-item active">
                                            <div className="flow-header">
                                                <div className="flow-title-row">
                                                    <h3>{entry.title}</h3>
                                                </div>
                                            </div>

                                            <div className="checklist-container">
                                                {entry.checklistItems.length > 0 ? entry.checklistItems.map(item => (
                                                    <div {...keyboardAction}
                                                        key={item.id}
                                                        className={`checklist-item ${item.done ? 'done' : ''}`}
                                                        onClick={() => toggleChecklistItem(entry.docId, item.id, item.done)}
                                                    >
                                                        <div className="cl-checkbox">
                                                            {item.done && (
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <div className="cl-label-wrap">
                                                            <span className="cl-label">{item.label}</span>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="checklist-item">
                                                        <div className="cl-checkbox"></div>
                                                        <div className="cl-label-wrap">
                                                            <span className="cl-label">이 문서에서 추출된 체크 항목이 없습니다.</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {/* "서류 분석하러 가기" 버튼은 2026-10-12 삭제 */}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Bottom Keep-going Banner (F4-b): 최근 임시저장/검토중 문서가 있을 때만 노출 */}
            {continueDoc && (() => {
                const quizTotal = continueDoc.analysis?.quiz?.question ? 1 : 0;
                const quizDone = continueDoc.review?.quizAnswered ? 1 : 0;
                const quizPct = quizTotal ? Math.round((quizDone / quizTotal) * 100) : 0;
                const acidCount = Array.isArray(continueDoc.analysis?.acidResults) ? continueDoc.analysis.acidResults.length : 0;
                return (
                    <div className="db-bottom-bar-container">
                        <div className="bottom-continue">
                            <div {...keyboardAction} className="c-left" onClick={() => navigate(`/workbench/${continueDoc.docId}`)} style={{ cursor: 'pointer' }}>
                                <span className="small-title text-blue">이어서 하기</span>
                                <h2>{continueDoc.fileName || '분석한 공고문'}</h2>
                            </div>
                            <div className="c-right">
                                <div className="c-step">
                                    <div className="req-title">이해 검증</div>
                                    <div className="req-progress"><span className="val">{quizDone}</span> / {quizTotal} 완료</div>
                                    <div className="mini-bar-bg"><div className="mini-bar-fill" style={{ width: `${quizPct}%` }}></div></div>
                                </div>
                                <div className="c-step">
                                    <div className="req-title">분석 항목</div>
                                    <div className="req-progress"><span className="val">{acidCount}</span> 개 분석</div>
                                    <div className="mini-bar-bg"><div className="mini-bar-fill" style={{ width: acidCount > 0 ? '100%' : '0%' }}></div></div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 로그인 모달(결정 D): 현재 페이지 위에 오픈 — 성공 시 페이지 유지. */}
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onSuccess={handleAuthSuccess}
                initialMode="login"
            />

            {/* 정책 상세 모달(P3-1): 카드 제목 클릭 시 오픈. plcyNo=card.id로 상세 실호출. */}
            <PolicyDetailModal
                isOpen={!!detailCard}
                plcyNo={detailCard?.id}
                fallbackCard={detailCard}
                onClose={() => setDetailCard(null)}
                onAfterAction={refreshSavedIds}
            />

            {/* Toast Overlay for Add to Saved Notices */}
            <AnimatePresence>
                {toastMsg && (
                    <motion.div
                        className="uh-toast"
                        style={{ zIndex: 9999 }}
                        initial={{ opacity: 0, y: 50, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: 20, x: '-50%' }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        {toastMsg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DashboardPage;
