import "@/styles/globals.css";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import type { AppProps } from "next/app";
// We don't need useState or createBrowserClient here anymore
// as the main client interaction will happen in components/pages
// and the cookie setting happens in the API route.

function MyApp({ Component, pageProps }: AppProps) {
  // Basic check for environment variables required by child components/API routes
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

  // Just render the component. Auth state will be managed within the component
  // using a client created there or context.
  return <Component {...pageProps} />;
}

export default MyApp;
