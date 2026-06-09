/** 필터/이동 중 전체 화면을 덮는 로딩 오버레이. show=pending 일 때만 렌더.
 *  인라인 "불러오는 중" 텍스트가 필터 레이아웃을 밀던 문제를 대체한다. */
export function LoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/55 backdrop-blur-[1px]"
    >
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-xl">
        <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-zinc-200 border-t-emerald-600" />
        <span className="text-base font-medium text-zinc-700">불러오는 중…</span>
      </div>
    </div>
  );
}
