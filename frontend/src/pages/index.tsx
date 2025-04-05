import Head from "next/head";
import { useState, useEffect, FormEvent, ChangeEvent, useRef } from "react";
import Slider from "react-slick";
import type { Settings, CustomArrowProps } from "react-slick"; // Import specific types
import { supabase } from "@/lib/supabaseClient"; // Import Supabase client
import type { Session, User } from "@supabase/supabase-js"; // Import types

interface Todo {
  id: string; // Assuming Supabase uses uuid which is a string
  task: string;
  is_completed: boolean;
  created_at: string;
  user_id: string; // Added user_id
}

// Read API URL from environment variable
const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  // Provide a fallback or throw an error if the variable isn't set
  console.error("Error: NEXT_PUBLIC_API_URL environment variable is not set.");
  // You might want to throw an error or set a default for local dev here
  // For now, we'll let it potentially fail later if unset, but log the error.
}

// Custom Arrow Components for the Slider
const PrevArrow = ({ onClick }: CustomArrowProps) => {
  return (
    <button onClick={onClick} style={{ ...styles.arrow, ...styles.prevArrow }}>
      &lt;
    </button>
  );
};

const NextArrow = ({ onClick }: CustomArrowProps) => {
  return (
    <button onClick={onClick} style={{ ...styles.arrow, ...styles.nextArrow }}>
      &gt;
    </button>
  );
};

export default function Home() {
  const [session, setSession] = useState<Session | null>(null); // Add session state
  const [user, setUser] = useState<User | null>(null); // Add user state
  const [loading, setLoading] = useState<boolean>(true); // Loading state for auth

  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTask, setNewTask] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const sliderRef = useRef<Slider>(null); // Ref for slider instance

  // --- Auth Handling ---
  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Cleanup listener on component unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
      });
      if (error) throw error;
    } catch (error: any) {
      // Define type for error
      setError(`Google Login Failed: ${error.message}`);
      console.error("Google Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setTodos([]); // Clear todos on logout
      setError(null);
    } catch (error: any) {
      // Define type for error
      setError(`Logout Failed: ${error.message}`);
      console.error("Logout Error:", error);
    }
  };

  // Fetch todos only when session changes and is valid
  useEffect(() => {
    if (session) {
      fetchTodos();
    }
  }, [session]); // Re-run when session changes

  // --- API Call Modifications ---

  const fetchTodos = async () => {
    if (!API_URL || !session) return;
    try {
      setError(null);
      // Explicitly construct headers
      const headers: HeadersInit = {
        Authorization: `Bearer ${session.access_token}`,
      };
      const response = await fetch(`${API_URL}/api/todos`, { headers });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError("Authentication failed. Please log in again.");
          setTodos([]);
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } else {
        const data: Todo[] = await response.json();
        setTodos(data);
      }
    } catch (e: any) {
      console.error("Failed to fetch todos:", e);
      setError(
        "Failed to load todos. Is the backend running and are you logged in?"
      );
      setTodos([]);
    }
  };

  const handleAddTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newTask.trim() || !API_URL || !session) return;

    try {
      setError(null);
      // Explicitly construct headers
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      };
      const response = await fetch(`${API_URL}/api/todos`, {
        method: "POST",
        headers,
        body: JSON.stringify({ task: newTask }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError("Authentication failed. Cannot add todo.");
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } else {
        const addedTodo: Todo = await response.json();
        const newTodos = [addedTodo, ...todos];
        setTodos(newTodos);
        setNewTask("");
        sliderRef.current?.slickGoTo(0);
      }
    } catch (e: any) {
      console.error("Failed to add todo:", e);
      setError("Failed to add todo.");
    }
  };

  const handleDeleteTodo = async (id: string) => {
    if (!API_URL || !session) return;
    try {
      setError(null);
      // Explicitly construct headers
      const headers: HeadersInit = {
        Authorization: `Bearer ${session.access_token}`,
      };
      const response = await fetch(`${API_URL}/api/todos/${id}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError("Authentication failed. Cannot delete todo.");
        } else if (response.status === 404) {
          console.warn(
            "Attempted to delete non-existent or unauthorized todo:",
            id
          );
          setTodos(todos.filter((todo) => todo.id !== id));
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } else {
        setTodos(todos.filter((todo) => todo.id !== id));
      }
    } catch (e: any) {
      console.error("Failed to delete todo:", e);
      setError(`Failed to delete todo: ${e.message}`);
    }
  };

  const sliderSettings: Settings = {
    dots: false,
    infinite: false, // Don't loop infinitely
    speed: 500,
    slidesToShow: 3, // Show 3 cards at a time
    slidesToScroll: 1, // Scroll 1 card at a time
    prevArrow: <PrevArrow />,
    nextArrow: <NextArrow />,
    responsive: [
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 2,
        },
      },
      {
        breakpoint: 600,
        settings: {
          slidesToShow: 1,
        },
      },
    ],
  };

  // --- Render Logic ---
  if (loading) {
    return (
      <div style={styles.container}>
        <main style={styles.main}>
          <p>Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <Head>
        <title>Todo App</title>
        <meta
          name="description"
          content="Simple Todo App with Next.js and Express"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main style={styles.main}>
        <h1 style={styles.title}>My Todos</h1>

        {/* Auth Buttons */}
        <div style={styles.authContainer}>
          {user ? (
            <div style={styles.userInfo}>
              <span>Logged in as: {user.email}</span>
              <button onClick={handleLogout} style={styles.button}>
                Logout
              </button>
            </div>
          ) : (
            <button onClick={handleLogin} style={styles.button}>
              Login with Google
            </button>
          )}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {/* Only show Todo functionality if logged in */}
        {session && (
          <>
            <form onSubmit={handleAddTask} style={styles.form}>
              <input
                type="text"
                value={newTask}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNewTask(e.target.value)
                }
                placeholder="Add a new todo"
                style={styles.input}
              />
              <button type="submit" style={styles.button}>
                Add
              </button>
            </form>

            <div style={styles.sliderContainer}>
              {todos.length > 0 ? (
                <Slider ref={sliderRef} {...sliderSettings}>
                  {todos.map((todo) => (
                    // Each div here is a slide
                    <div key={todo.id} style={styles.slidePadding}>
                      <div style={styles.card}>
                        <span style={styles.cardTask}>{todo.task}</span>
                        <button
                          onClick={() => handleDeleteTodo(todo.id)}
                          style={styles.deleteButton}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </Slider>
              ) : (
                !error && <p>No todos yet! Add one above.</p> // Show only if logged in and no error
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// Basic inline styles for demonstration
const styles = {
  container: {
    padding: "0 2rem",
    fontFamily: "Arial, sans-serif",
  },
  main: {
    minHeight: "100vh",
    padding: "4rem 0",
    flex: 1,
    display: "flex",
    flexDirection: "column" as "column", // Type assertion for CSSProperties
    alignItems: "center" as "center",
  },
  title: {
    margin: "0 0 1rem 0", // Reduced bottom margin
    lineHeight: 1.15,
    fontSize: "3rem",
    textAlign: "center" as "center",
  },
  error: {
    color: "red",
    marginBottom: "1rem",
  },
  form: {
    display: "flex",
    marginBottom: "2rem",
    width: "100%",
    maxWidth: "400px",
  },
  input: {
    flexGrow: 1,
    padding: "0.75rem",
    marginRight: "0.5rem",
    border: "1px solid #ccc",
    borderRadius: "4px",
    fontSize: "1rem",
  },
  button: {
    padding: "0.75rem 1.5rem",
    border: "none",
    borderRadius: "4px",
    backgroundColor: "#0070f3",
    color: "white",
    fontSize: "1rem",
    cursor: "pointer",
    whiteSpace: "nowrap" as "nowrap",
  },
  // Remove old list styles
  /*
  list: {
    listStyle: "none",
    padding: 0,
    width: "100%",
    maxWidth: "400px",
  },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem",
    borderBottom: "1px solid #eee",
  },
  */

  // New Slider and Card Styles
  sliderContainer: {
    width: "90%", // Adjust width as needed
    maxWidth: "800px",
    margin: "2rem 0",
    position: "relative" as "relative",
  },
  slidePadding: {
    padding: "0 10px", // Add space between cards
  },
  card: {
    background: "#f9f9f9",
    border: "1px solid #eee",
    borderRadius: "8px",
    padding: "1.5rem",
    minHeight: "100px", // Ensure cards have some height
    display: "flex",
    flexDirection: "column" as "column",
    justifyContent: "space-between",
    alignItems: "center",
    textAlign: "center" as "center",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  cardTask: {
    marginBottom: "1rem", // Space between task and delete button
    wordBreak: "break-word" as "break-word",
  },
  deleteButton: {
    padding: "0.4rem 0.8rem",
    border: "none",
    borderRadius: "4px",
    backgroundColor: "#dc3545",
    color: "white",
    fontSize: "0.9rem",
    cursor: "pointer",
    marginTop: "auto", // Push delete button to the bottom if needed
  },
  arrow: {
    position: "absolute" as "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    color: "white",
    border: "none",
    borderRadius: "50%",
    width: "40px",
    height: "40px",
    fontSize: "20px",
    cursor: "pointer",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  prevArrow: {
    left: "-50px", // Position left arrow outside the container
  },
  nextArrow: {
    right: "-50px", // Position right arrow outside the container
  },
  // Auth Styles
  authContainer: {
    marginBottom: "2rem",
    width: "100%",
    display: "flex",
    justifyContent: "center",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
};
