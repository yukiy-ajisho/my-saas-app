require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 3001;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;

if (!supabaseJwtSecret || !supabaseUrl) {
  console.error("Error: SUPABASE_JWT_SECRET or SUPABASE_URL is not set.");
  process.exit(1);
}

// Middleware

// Define allowed origins
const allowedOrigins = [
  "https://my-saas-app-ashen.vercel.app", // Deployed frontend
  "http://localhost:3000", // Local frontend dev server
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    // credentials: true, // No longer needed as auth done via header
  })
);
// app.use(cookieParser()); // Keep removed
app.use(express.json());

// --- Authentication Middleware (Check Authorization Header) ---
const authenticateToken = (req, res, next) => {
  console.log("--- Authenticate Token Middleware Start (Header Check) ---");
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (token == null) {
    console.log("Authorization header missing or token not found.");
    return res.sendStatus(401); // 401: Unauthorized
  }

  console.log(`Verifying token from header: ${token.substring(0, 15)}...`);

  jwt.verify(token, supabaseJwtSecret, (err, user) => {
    if (err) {
      console.error(">>> JWT Verification Error <<<:", err.message);
      return res.sendStatus(403); // 403: Forbidden (Invalid Token)
    }
    req.user = user;
    console.log("JWT Verified via Header. User ID:", req.user.sub);
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
