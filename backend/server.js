require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser"); // Import cookie-parser

const app = express();
const port = process.env.PORT || 3001;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

// Extract Supabase project reference from URL for cookie name
const supabaseUrl = process.env.SUPABASE_URL;
if (!supabaseUrl) {
  console.error("Error: SUPABASE_URL is not set.");
  process.exit(1);
}
const projectRefMatch = supabaseUrl.match(
  /https:\/\/([a-zA-Z0-9]+)\.supabase\.co/
);
const supabaseProjectRef = projectRefMatch ? projectRefMatch[1] : null;
if (!supabaseProjectRef) {
  console.error(
    "Error: Could not extract Supabase project reference from URL."
  );
  process.exit(1);
}
const supabaseAuthCookieName = `sb-${supabaseProjectRef}-auth-token`;
console.log(`Expecting Supabase auth cookie: ${supabaseAuthCookieName}`);

if (!supabaseJwtSecret) {
  console.error(
    "Error: SUPABASE_JWT_SECRET is not set in environment variables."
  );
  process.exit(1);
}

// Middleware
app.use(
  cors({
    origin: "https://my-saas-app-ashen.vercel.app", // Allow only your Vercel app
    credentials: true, // IMPORTANT: Allow cookies to be sent from frontend
  })
);
app.use(cookieParser()); // Use cookie-parser middleware
app.use(express.json());

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  console.log("--- Authenticate Token Middleware Start ---");
  console.log("Received cookies:", req.cookies); // Log all received cookies

  const tokenFromCookie = req.cookies[supabaseAuthCookieName];
  console.log(
    `Value from cookie '${supabaseAuthCookieName}':`,
    tokenFromCookie
  );

  if (tokenFromCookie == null) {
    console.log("Auth cookie not found or empty.");
    return res.sendStatus(401); // 401: Unauthorized (Missing credentials)
  }

  // Supabase SSR cookie format can be complex (e.g., JSON array)
  // Extract the actual JWT (usually starts with 'ey')
  let actualToken = null;
  try {
    if (
      typeof tokenFromCookie === "string" &&
      tokenFromCookie.startsWith("[") &&
      tokenFromCookie.endsWith("]")
    ) {
      // Attempt to parse if it looks like a JSON array string
      const parsedArray = JSON.parse(tokenFromCookie);
      if (Array.isArray(parsedArray)) {
        actualToken = parsedArray.find(
          (t) => typeof t === "string" && t.startsWith("ey")
        );
        if (
          !actualToken &&
          parsedArray.length > 0 &&
          typeof parsedArray[0] === "string"
        ) {
          // Fallback: Assume the first string element if no typical JWT found
          actualToken = parsedArray[0];
          console.log(
            "Extracted token (fallback from array[0]):",
            actualToken ? actualToken.substring(0, 10) + "..." : null
          );
        } else {
          console.log(
            "Extracted token (found JWT in array):",
            actualToken ? actualToken.substring(0, 10) + "..." : null
          );
        }
      } else {
        console.log(
          "Cookie value looked like array but failed to parse or wasn't array."
        );
      }
    } else if (typeof tokenFromCookie === "string") {
      // If it's just a string, assume it's the token directly
      actualToken = tokenFromCookie;
      console.log(
        "Using cookie value directly as token:",
        actualToken.substring(0, 10) + "..."
      );
    } else {
      console.log(
        "Cookie value is not a parseable string or array-like string."
      );
    }
  } catch (parseError) {
    console.error("Error parsing cookie value:", parseError);
    // Treat as if token wasn't found
  }

  if (actualToken == null) {
    console.log("Could not extract a valid JWT from the auth cookie value.");
    return res.sendStatus(401); // Can't find token within cookie
  }

  console.log(`Verifying extracted token: ${actualToken.substring(0, 15)}...`);

  jwt.verify(actualToken, supabaseJwtSecret, (err, user) => {
    if (err) {
      // CRITICAL LOG: Look for this if 401/403 occurs
      console.error(
        ">>> JWT Verification Error <<<:",
        err.message,
        "Token received:",
        actualToken.substring(0, 15) + "..."
      );
      return res.sendStatus(403); // 403: Forbidden (Invalid/Expired Token)
    }
    req.user = user;
    console.log("JWT Verified. User ID:", req.user.sub);
    console.log("--- Authenticate Token Middleware End (Success) ---");
    next();
  });
};

// Supabase configuration (for direct backend use, if any - unchanged)
// ...
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseServiceKey) {
  console.error("Error: SUPABASE_SERVICE_KEY not found in .env file");
  process.exit(1);
}
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey); // Use different name if needed

// --- API Routes ---

// Apply authentication middleware to all /api/todos routes
const todosRouter = express.Router();
app.use("/api/todos", authenticateToken, todosRouter);

// Modify routes to use the authenticated user ID (req.user.sub)
// Also, remove the direct supabase client usage if not needed for admin actions

// Get all todos for the authenticated user
todosRouter.get("/", async (req, res) => {
  const userId = req.user.sub;
  try {
    // Use the admin client here for backend-level access
    // (or adjust if RLS is used instead)
    const { data, error } = await supabaseAdmin
      .from("todos")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error fetching todos for user:", userId, error);
    res.status(500).json({ error: "Failed to fetch todos" });
  }
});

// Add a new todo for the authenticated user
todosRouter.post("/", async (req, res) => {
  const userId = req.user.sub;
  const { task } = req.body;
  if (!task) {
    return res.status(400).json({ error: "Task cannot be empty" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("todos")
      .insert([{ task: task, is_completed: false, user_id: userId }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    console.error("Error adding todo for user:", userId, error);
    res.status(500).json({ error: "Failed to add todo" });
  }
});

// Delete a todo belonging to the authenticated user
todosRouter.delete("/:id", async (req, res) => {
  const userId = req.user.sub;
  const { id } = req.params;

  try {
    const { error } = await supabaseAdmin
      .from("todos")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting todo:", id, "for user:", userId, error);
    res.status(500).json({ error: "Failed to delete todo" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
