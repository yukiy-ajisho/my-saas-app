import "@/styles/globals.css";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import type { AppProps } from "next/app";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

// Define a type for the Supabase client
type TypedSupabaseClient = SupabaseClient<Record<string, any>>;

export default function App({
  Component,
  pageProps,
}: AppProps<{ initialSession?: Session }>) {
  // Create a new supabase client for each page load
  const [supabaseClient] = useState<TypedSupabaseClient>(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  // Check if Supabase URL and Key are set - basic validation
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    console.error(
      "CRITICAL: Supabase URL or Anon Key environment variables are not set in the frontend!"
    );
    return (
      <div>Configuration Error: Supabase environment variables missing.</div>
    );
  }

  return <Component {...pageProps} supabaseClient={supabaseClient} />;
}
