// 전시용(데모) 공고 레지스트리.
// 공고 하나당 JSON 파일 하나(src/data/demo/{공고ID}.json)이고, 화면 컴포넌트는 분석 문장을
// 직접 갖지 않고 이 레지스트리를 통해 JSON만 읽는다. 데모 공고로 매칭되면 분석 API를 호출하지 않는다.
import { buildAnalysisItemsFromEduData } from '../../constants/educationEventData';

// 지원사업
import socialEnterprise from './social-enterprise.json';
import energyVoucher from './energy-voucher.json';
import smallBusinessLoan from './small-business-loan.json';
import newlywedHousing from './newlywed-housing.json';
// 교육·행사
import semiconductorTalent from './semiconductor-talent.json';
import corporateProject from './corporate-project.json';
import swMaestro from './sw-maestro.json';
// 입주자 모집·채용 — 자리표시(내용은 다음 작업에서 채움)
import shPurchaseRental from './sh-purchase-rental.json';
import lhYouthRental from './lh-youth-rental.json';
import teacherRecruitment from './teacher-recruitment.json';
import lgcnsInternship from './lgcns-internship.json';
import tossMd from './toss-md.json';

const ALL_DEMO_DOCS = [
    socialEnterprise,
    energyVoucher,
    smallBusinessLoan,
    newlywedHousing,
    semiconductorTalent,
    corporateProject,
    swMaestro,
    shPurchaseRental,
    lhYouthRental,
    teacherRecruitment,
    lgcnsInternship,
    tossMd,
];

// 파일명 비교용 키.
//  - 한글은 업로드 환경에 따라 자모 조합 방식(NFC/NFD)이 달라 바이트가 다를 수 있어 NFC로 맞춘다.
//  - 공백·밑줄·하이픈·「」『』는 같은 공고를 내려받는 경로마다 다르게 붙는 구분자라 전부 지운다.
//    예) "사회적기업_창업지원사업_창업팀_모집.pdf" === "사회적기업 창업지원사업 창업팀 모집.pdf"
//  - 영문 대소문자 차이도 무시한다.
function normalizeFileName(name) {
    return String(name || '')
        .normalize('NFC')
        .replace(/[\s_\-「」『』]/g, '')
        .toLowerCase();
}

// 내용이 아직 비어 있는 자리표시(draft) 파일은 등록하지 않는다.
// → 해당 공고를 업로드해도 빈 화면 대신 기존 분석 파이프라인을 그대로 탄다.
const READY_DEMO_DOCS = ALL_DEMO_DOCS.filter(
    (d) => !d.draft && Array.isArray(d.pages) && d.pages.length > 0
);

const BY_FILE_NAME = new Map(
    READY_DEMO_DOCS.filter((d) => d.fileName).map((d) => [normalizeFileName(d.fileName), d])
);
const BY_ID = new Map(ALL_DEMO_DOCS.map((d) => [d.id, d]));

export function getDemoByFileName(fileName) {
    return BY_FILE_NAME.get(normalizeFileName(fileName)) || null;
}

export function getDemoById(id) {
    return (id && BY_ID.get(id)) || null;
}

export function listDemoDocs() {
    return READY_DEMO_DOCS.slice();
}

// 분석 과정 화면에 표시할 수치 — 전부 JSON 실제 데이터에서 계산한다(임의 값 없음).
//  pageCount : 공고문 쪽수
//  itemCount : A·C·I·D 항목 수
//  checkCount: 확인 필요 항목 수(교육·행사는 issues, 그 외는 needsCheck 표시 항목)
export function getDemoStats(demo) {
    if (!demo) return { pageCount: 0, itemCount: 0, checkCount: 0 };
    const pageCount = Array.isArray(demo.pages) ? demo.pages.length : 0;

    if (demo.category === 'education_event' && demo.eduData) {
        const items = buildAnalysisItemsFromEduData(demo.eduData);
        const itemCount = ['A', 'C', 'I', 'D'].reduce((n, k) => n + (items[k]?.length || 0), 0);
        return { pageCount, itemCount, checkCount: demo.eduData.issues?.length || 0 };
    }

    const list = Array.isArray(demo.acidResults) ? demo.acidResults : [];
    return { pageCount, itemCount: list.length, checkCount: list.filter((r) => r.needsCheck).length };
}

// 데모 JSON → 워크벤치가 소비하는 analysis 형태.
// documentStore에는 demoId만 저장하고(용량 절감) 이 함수로 매번 복원한다 → JSON을 고치면 바로 반영된다.
export function toDemoAnalysis(demo) {
    if (!demo) return null;
    return {
        reconstructedPages: (demo.pages || []).map((p) => ({
            pageNumber: p.page,
            title: p.title,
            sub: p.sub,
            contentHtml: p.contentHtml,
        })),
        acidResults: demo.acidResults || [],
        quiz: demo.quiz || null,
        reductionRate: 0,
        category: demo.category,
        eduData: demo.eduData || null,
        ladder: demo.ladder || null, // 입주자 모집(tenant_recruitment)의 순위 사다리
        recruitment: demo.recruitment || null, // 채용(recruitment)의 전형 흐름
        checklist: demo.checklist || null, // 신청 체크리스트(공고 원문의 제출 서류·신청 절차)
        demoId: demo.id,
        isDemo: true,
    };
}

// 문서함 레코드 → 분석 본문이 채워진 레코드(체크리스트·비교 등 워크벤치 밖 소비처용).
// 데모 문서는 저장 시 {demoId}만 남기므로 여기서 JSON으로 복원하고, 교육·행사(eduData)처럼
// acidResults가 비어 있는 카테고리는 항목 분석 D(자격)·I(혜택)를 acidResults 형태로 바꿔 채운다.
// 데모가 아니거나 찾을 수 없으면 원본을 그대로 돌려준다.
export function withDemoAnalysis(doc) {
    const demoId = doc?.analysis?.demoId;
    if (!demoId) return doc;
    const analysis = toDemoAnalysis(getDemoById(demoId));
    if (!analysis) return doc;
    if (!analysis.acidResults.length && analysis.eduData) {
        const items = buildAnalysisItemsFromEduData(analysis.eduData);
        analysis.acidResults = [
            ...(items.D || []).map((it) => ({ id: it.id, tag: 'D', title: it.title, pageNumber: Number(String(it.pageRef).replace('P.', '')) || null })),
            ...(items.I || []).map((it) => ({ id: it.id, tag: 'I', title: it.title, pageNumber: Number(String(it.pageRef).replace('P.', '')) || null })),
        ];
    }
    return { ...doc, analysis };
}
