require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");
const jwt = require("jsonwebtoken"); // Import jsonwebtoken

const app = express();
const port = process.env.PORT || 3001; // Backend server port
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

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
  })
);
app.use(express.json()); // Parse JSON request bodies

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (token == null) return res.sendStatus(401); // if there isn't any token

  jwt.verify(token, supabaseJwtSecret, (err, user) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      return res.sendStatus(403); // Token is no longer valid or signature doesn't match
    }
    req.user = user; // Attach decoded user payload (contains user ID, email, etc.)
    // The user object typically contains { sub: user_id, aud: authenticated, role: authenticated, ... }
    console.log("Authenticated user ID:", req.user.sub); // Log the user ID for confirmation
    next(); // Proceed to the next middleware or route handler
  });
};

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Supabase URL or Key not found in .env file");
  process.exit(1); // Exit if credentials are not set
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- API Routes ---

// Apply authentication middleware to all /api/todos routes
const todosRouter = express.Router();
app.use("/api/todos", authenticateToken, todosRouter);

// Modify routes to use the authenticated user ID (req.user.sub)
// Also, remove the direct supabase client usage if not needed for admin actions

// Get all todos for the authenticated user
todosRouter.get("/", async (req, res) => {
  const userId = req.user.sub; // Get user ID from verified JWT
  try {
    // Fetch todos belonging only to this user
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .eq("user_id", userId) // Filter by user_id
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
    // Insert todo with the user_id
    const { data, error } = await supabase
      .from("todos")
      .insert([{ task: task, is_completed: false, user_id: userId }]) // Add user_id
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
    // Ensure the user can only delete their own todos
    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("id", id)
      .eq("user_id", userId); // Match both id and user_id

    // Check if the delete operation caused an error (e.g., row not found for this user)
    // Note: Supabase delete doesn't always error if the row doesn't match,
    // it might just delete 0 rows. A count check could be added if needed.
    if (error) throw error;

    // If no error, assume success (or row didn't exist for this user, which is fine)
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
