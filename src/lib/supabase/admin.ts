import { createClient } from "@supabase/supabase-js";

/**
 * 서버 전용 관리자 클라이언트 (service_role key, RLS 우회).
 * 강의실 가동률 집계처럼 aca_tickets 전체를 읽어야 할 때만 서버에서 사용한다.
 * 절대 클라이언트 컴포넌트에서 import 하지 말 것.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Supabase admin 클라이언트 환경변수가 없습니다. .env.local의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY를 확인하세요.",
    );
  }

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
