// 상대 시간 표시("방금 전"/"N분 전"/"N시간 전"/"N일 전"/"10월 12일"). ISO 문자열·epoch ms 모두 허용.
// 최근 본 공고(viewedAt)·찜한 공고(savedAt) 카드 공용.
export function formatTimeAgo(value) {
    if (!value) return '';
    const t = new Date(value).getTime();
    if (isNaN(t)) return '';
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return '방금 전';
    if (mins < 60) return `${mins}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
