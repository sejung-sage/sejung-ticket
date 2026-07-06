/** 비대치 분원 안내. 가동률·좌석 점유율은 원천에 강의실 사용기록이 있는 분원만
 *  집계 가능(현재 대치뿐). 정원·임대 정보는 다른 페이지에서 확인. */
export function NoUsageNotice({ branch }: { branch: string }) {
  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 px-6 py-10 text-center">
      <p className="text-base font-medium text-zinc-700">
        {branch} 분원은 강의실 사용기록이 없어 가동률을 집계하지 않습니다.
      </p>
      <p className="mt-2 text-sm text-zinc-500">
        원천 데이터(강의실별 수업 기록)가 적재되면 채워집니다. 지금은{" "}
        <b>정원 관리</b>·<b>관 관리</b>·<b>관별 수익성</b>에서 이 분원의 강의실 정원과 임대 정보를 볼
        수 있습니다.
      </p>
    </div>
  );
}
