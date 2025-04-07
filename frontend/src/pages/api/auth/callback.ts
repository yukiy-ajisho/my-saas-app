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

  // Determine the site URL from environment or headers
  // IMPORTANT: This should be the FRONTEND URL, not the API URL
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || // Use explicit env var if set
    // Otherwise, infer from request headers (use NEXT_PUBLIC_VERCEL_URL on Vercel)
    `http${process.env.NODE_ENV === "production" ? "s" : ""}://${
      process.env.NEXT_PUBLIC_VERCEL_URL || req.headers.host
    }`;

  // Construct the full request URL to easily access query params
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
            // --- Force required attributes for cross-site cookies ---
            // SameSite=None REQUIRES Secure=true
            const finalOptions: CookieOptions = {
              ...options,
              path: "/",
              sameSite: "none", // Must be None for cross-site credentialed requests
              secure: true, // Must be true if SameSite=None
            };
            // Note: Domain attribute is usually omitted unless dealing with subdomains

            console.log(
              `Setting cookie ${name} with strict options:`,
              finalOptions
            );

            let setCookieHeader = res.getHeader("Set-Cookie") || [];
            if (!Array.isArray(setCookieHeader)) {
              setCookieHeader = [setCookieHeader.toString()];
            }
            res.setHeader("Set-Cookie", [
              ...setCookieHeader,
              serialize(name, value, finalOptions),
            ]);
          },
          remove(name: string, options: CookieOptions) {
            // Ensure removal options match set options for path/secure/samesite
            const finalOptions: CookieOptions = {
              ...options,
              path: "/",
              sameSite: "none",
              secure: true,
              maxAge: -1,
            };
            console.log(
              `Removing cookie ${name} with strict options:`,
              finalOptions
            );

            let setCookieHeader = res.getHeader("Set-Cookie") || [];
            if (!Array.isArray(setCookieHeader)) {
              setCookieHeader = [setCookieHeader.toString()];
            }
            res.setHeader("Set-Cookie", [
              ...setCookieHeader,
              serialize(name, "", finalOptions),
            ]);
          },
        },
      }
    );

    try {
      // Exchange code for session
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      console.log(
        "Auth callback: Code exchanged successfully, cookie set via createServerClient with forced options."
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

  // Redirect back to origin or 'next' path after sign in process completes
  const redirectPath = next.startsWith("/") ? next : "/" + next;
  console.log(
    `Auth callback successful, calculated siteUrl: ${siteUrl}, calculated redirectPath: ${redirectPath}, final redirect target: ${siteUrl}${redirectPath}`
  );
  return res.redirect(`${siteUrl}${redirectPath}`);
}

// Ensure environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are available.
// Consider adding NEXT_PUBLIC_SITE_URL as well for robust redirects.
