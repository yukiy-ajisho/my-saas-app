import { createPagesServerClient } from "@supabase/ssr";
import type { NextApiRequest, NextApiResponse } from "next";

// The actual backend URL - Read from environment variable for flexibility
const RENDER_BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!RENDER_BACKEND_URL) {
    console.error(
      "Proxy Error: NEXT_PUBLIC_API_URL (Render backend) is not configured."
    );
    return res.status(500).json({ error: "Proxy configuration error" });
  }

  // Create Supabase client to validate user session from cookie
  const supabase = createPagesServerClient(
    { req, res },
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );

  // Get session and access token
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    console.warn("Proxy: No valid session found.", sessionError?.message);
    return res.status(401).json({ error: "Unauthorized" });
  }

  // User is authenticated, proceed to proxy the request

  const { slug } = req.query; // slug will be an array like ['todos'] or ['todos', 'some-id']
  const path = Array.isArray(slug) ? slug.join("/") : "";
  const targetUrl = `${RENDER_BACKEND_URL}/${path}`;

  console.log(`Proxying request: ${req.method} ${targetUrl}`);

  try {
    // Forward the request to the Render backend
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        // Forward necessary headers (like Content-Type)
        ...(req.headers["content-type"] && {
          "Content-Type": req.headers["content-type"],
        }),
        // Add the Authorization header with the user's JWT
        Authorization: `Bearer ${session.access_token}`,
        // Add any other headers you might need to forward
      },
      // Forward the body if present (for POST, PUT, etc.)
      body:
        req.method !== "GET" && req.method !== "HEAD"
          ? JSON.stringify(req.body)
          : undefined,
    });

    // Check if the backend response was successful
    if (!response.ok) {
      const backendErrorText = await response.text();
      console.error(
        `Proxy: Backend error ${response.status}: ${backendErrorText}`
      );
      // Forward the backend's error status and message
      return res.status(response.status).json({
        error: `Backend Error: ${response.statusText}`,
        details: backendErrorText,
      });
    }

    // If the backend responded with no content (e.g., successful DELETE)
    if (response.status === 204) {
      return res.status(204).end();
    }

    // Forward the successful response (assuming JSON)
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Proxy: Error fetching backend:", error);
    res.status(500).json({ error: "Proxy request failed" });
  }
}
