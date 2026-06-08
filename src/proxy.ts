import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 운영계 접근 게이트 (코드 1개 + 쿠키).
 * - GATE_TOKEN 이 설정된 환경(운영)에서만 게이트를 강제한다. 미설정(로컬)이면 통과.
 * - 인증 쿠키(gate) 값이 GATE_TOKEN 과 일치하면 통과, 아니면 /gate 로 보낸다.
 *   (실제 코드 검증/쿠키 발급은 /gate 의 서버 액션에서. 쿠키엔 코드가 아닌 서버 비밀 토큰 저장)
 */
export function proxy(request: NextRequest) {
  const token = process.env.GATE_TOKEN;
  if (!token) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/gate") return NextResponse.next();

  if (request.cookies.get("gate")?.value === token) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
