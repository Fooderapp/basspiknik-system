import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

const PUBLIC_PATHS = ["/", "/events", "/menu", "/sign-in", "/sign-up", "/auth", "/api/webhooks", "/api/wallet", "/api/google-wallet", "/api/terminal", "/api/seller", "/api/orders", "/api/credits", "/widget"];

const ROLE_PATHS: Record<string, string[]> = {
  "/dashboard": ["ADMIN", "EDITOR", "STAFF", "SELLER", "BARTENDER"],
  "/seller":    ["ADMIN", "EDITOR", "SELLER"],
  "/checkin":   ["ADMIN", "EDITOR", "STAFF"],
  "/bar":       ["ADMIN", "EDITOR", "STAFF", "BARTENDER"],
};

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith("/ticket/") || pathname.startsWith("/events/")
  );
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return supabaseResponse;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  const matchedPrefix = Object.keys(ROLE_PATHS).find(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );

  if (matchedPrefix) {
    try {
      // Inline Supabase call — can't use server.ts createClient (cookies are read-only here)
      const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return request.cookies.getAll() },
            setAll() { /* read-only in middleware check */ },
          },
        }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const role = (profile as { role?: string } | null)?.role ?? "GUEST";
      if (!ROLE_PATHS[matchedPrefix].includes(role)) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } catch {
      // DB unavailable — pass through, page handles it
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
