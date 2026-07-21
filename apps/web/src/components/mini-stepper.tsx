/** 사건 목록 '진행' 칼럼 — 4단계 도트 스테퍼 */
export function MiniStepper({ filled }: { filled: number }) {
  return (
    <span className="inline-flex items-center">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && (
            <span className={`h-0.5 w-3 ${i <= filled - 1 ? "bg-app-primary" : "bg-neutral-200"}`} />
          )}
          <span
            className={`size-[9px] rounded-full ${
              i < filled ? "bg-app-primary" : "border border-zinc-300 bg-white"
            }`}
          />
        </span>
      ))}
    </span>
  );
}
