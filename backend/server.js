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
  // Read token from the Supabase auth cookie
  const token = req.cookies[supabaseAuthCookieName];

  // --- Comment out or remove Authorization header check ---
  // const authHeader = req.headers['authorization'];
  // const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    console.log("Auth cookie not found or empty.");
    return res.sendStatus(401);
  }

  jwt.verify(token, supabaseJwtSecret, (err, user) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      // Handle specific errors if needed (e.g., TokenExpiredError)
      return res.sendStatus(403);
    }
    req.user = user;
    console.log("Authenticated user ID from cookie:", req.user.sub);
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
