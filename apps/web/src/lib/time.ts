/** 한국어 상대시간 라벨 (사건 목록 '최근 활동' 칼럼) */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return then.toISOString().slice(0, 10);
}
