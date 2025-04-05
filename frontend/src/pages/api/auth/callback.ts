import { type CookieOptions, createServerClient } from "@supabase/ssr"; // Use createServerClient as suggested
import type { NextApiRequest, NextApiResponse } from "next";
import { serialize, parse } from "cookie"; // Need cookie library again

// This route should match the "Authorized redirect URIs" in your Google Cloud Console
// and the Redirect URL shown in Supabase Auth > Providers > Google

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Use NEXT_PUBLIC_SITE_URL or infer from headers for reliable origin
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `http${process.env.NODE_ENV === "production" ? "s" : ""}://${
      req.headers.host
    }`;
  const requestUrl = new URL(req.url!, siteUrl);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/"; // Get optional redirect path

  if (code) {
    // Create Supabase client using createServerClient with explicit cookie handlers
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            const cookies = parse(req.headers.cookie || "");
            return cookies[name];
          },
          set(name: string, value: string, options: CookieOptions) {
            // Ensure previous cookies aren't overwritten if multiple are set
            let setCookieHeader = res.getHeader("Set-Cookie") || [];
            // Ensure it's an array
            if (!Array.isArray(setCookieHeader)) {
              setCookieHeader = [setCookieHeader.toString()];
            }
            res.setHeader("Set-Cookie", [
              ...setCookieHeader,
              serialize(name, value, options),
            ]);
          },
          remove(name: string, options: CookieOptions) {
            let setCookieHeader = res.getHeader("Set-Cookie") || [];
            if (!Array.isArray(setCookieHeader)) {
              setCookieHeader = [setCookieHeader.toString()];
            }
            res.setHeader("Set-Cookie", [
              ...setCookieHeader,
              serialize(name, "", { ...options, maxAge: -1 }),
            ]); // Use maxAge: -1 for removal
          },
        },
      }
    );

    try {
      // Exchange code for session
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      console.log(
        "Auth callback: Code exchanged successfully, cookie set via createServerClient."
      );
    } catch (error) {
      console.error("Auth callback error exchanging code:", error);
      return res.redirect(
        `${siteUrl}/auth-error?message=Could+not+authenticate+user`
      );
    }
  } else {
    console.warn("Auth callback called without a code parameter.");
    return res.redirect(
      `${siteUrl}/auth-error?message=Authorization+code+missing`
    );
  }

  // Redirect back to origin or 'next' path
  const redirectPath = next.startsWith("/") ? next : "/" + next;
  console.log(
    `Auth callback successful, redirecting to: ${siteUrl}${redirectPath}`
  );
  return res.redirect(`${siteUrl}${redirectPath}`);
}

// Ensure environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are available.
// Consider adding NEXT_PUBLIC_SITE_URL as well for robust redirects.
