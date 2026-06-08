import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 운영계 접근 보호 (HTTP Basic Auth).
 * - DASHBOARD_PASSWORD 가 설정된 환경(운영)에서만 인증을 강제한다.
 * - 미설정(로컬/프리뷰)에선 통과 → 개발 편의.
 * 사용자명 기본값 'sejung', 비밀번호는 환경변수로 관리.
 */
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const user = process.env.DASHBOARD_USER || "sejung";
  const header = request.headers.get("authorization");

  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    const u = decoded.slice(0, sep);
    const p = decoded.slice(sep + 1);
    if (u === user && p === password) return NextResponse.next();
  }

  return new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="sejung-ticket", charset="UTF-8"' },
  });
}

export const config = {
  // 정적 자산 제외, 나머지 모든 경로 보호
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
