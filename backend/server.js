require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3001; // Backend server port

// Middleware
app.use(cors()); // Enable CORS for all origins (adjust in production)
app.use(express.json()); // Parse JSON request bodies

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Supabase URL or Key not found in .env file");
  process.exit(1); // Exit if credentials are not set
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- API Routes ---

// Get all todos
app.get("/api/todos", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("todos") // Make sure you have a 'todos' table in Supabase
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error fetching todos:", error);
    res.status(500).json({ error: "Failed to fetch todos" });
  }
});

// Add a new todo
app.post("/api/todos", async (req, res) => {
  const { task } = req.body;
  if (!task) {
    return res.status(400).json({ error: "Task cannot be empty" });
  }

  try {
    const { data, error } = await supabase
      .from("todos")
      .insert([{ task: task, is_completed: false }]) // Assuming 'task' and 'is_completed' columns
      .select(); // Return the newly created todo

    if (error) throw error;
    res.status(201).json(data[0]); // Return the first (and only) inserted row
  } catch (error) {
    console.error("Error adding todo:", error);
    res.status(500).json({ error: "Failed to add todo" });
  }
});

// Delete a todo
app.delete("/api/todos/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase.from("todos").delete().eq("id", id); // Assuming 'id' is the primary key column

    if (error) throw error;
    res.status(204).send(); // No content response on successful deletion
  } catch (error) {
    console.error("Error deleting todo:", error);
    res.status(500).json({ error: "Failed to delete todo" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
