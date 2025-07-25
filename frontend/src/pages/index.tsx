import Head from "next/head";
import { useState, useEffect, FormEvent, ChangeEvent, useRef } from "react";
import Slider from "react-slick";
import type { Settings, CustomArrowProps } from "react-slick"; // Import specific types
import { createBrowserClient } from "@supabase/ssr";
import type { Session, User, SupabaseClient } from "@supabase/supabase-js";

interface Todo {
  id: string; // Assuming Supabase uses uuid which is a string
  task: string;
  is_completed: boolean;
  created_at: string;
  user_id: string; // Added user_id
}

// Define a type for the Supabase client
type TypedSupabaseClient = SupabaseClient<Record<string, any>>; // Use a generic or define your DB types

// API URL setup - Point to the local proxy route
const PROXY_API_URL = "/api/proxy/todos";
// Keep the Render URL maybe for reference or other direct calls if needed?
// const RENDER_BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

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
  
  const [supabase] = useState<TypedSupabaseClient>(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTask, setNewTask] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const sliderRef = useRef<Slider>(null); // Ref for slider instance

  // --- Auth Handling ---
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Auth State Change (Client):", _event, session);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Initial session check
    const getInitialSession = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      console.log("Initial Session (Client):", initialSession);
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);
    };
    getInitialSession();

    return () => subscription.unsubscribe();
  }, [supabase.auth]); // Depend on supabase.auth

  const handleLogin = async () => {
    setError(null); // Clear previous errors
    try {
      // Construct the callback URL dynamically
      const redirectUrl = `${window.location.origin}/api/auth/callback`;
      console.log("Initiating login, redirectTo:", redirectUrl); // Add log

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (error) throw error;
      // Note: Redirection happens, state updates via onAuthStateChange
    } catch (error: any) {
      setError(`Google Login Failed: ${error.message}`);
      console.error("Google Login Error:", error);
    }
    
  };

  const handleLogout = async () => {
    setError(null); // Clear previous errors
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setTodos([]); // Clear todos on logout
    } catch (error: any) {
      setError(`Logout Failed: ${error.message}`);
      console.error("Logout Error:", error);
    }
  };

  // Fetch todos only when session changes and is valid
  useEffect(() => {
    if (session) {
      fetchTodos();
    } else {
      setTodos([]); // Clear todos if session becomes null (logout)
    }
  }, [session]); // Re-run when session changes

  // --- API Call Modifications (Use Proxy URL, remove credentials: include) ---

  const fetchTodos = async () => {
    // Use PROXY_API_URL
    if (!session) return; // Only need session check now
    try {
      setError(null);
      // Request to local proxy, browser sends cookie automatically (same-origin)
      const response = await fetch(PROXY_API_URL);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError(
            "Authentication failed fetching todos via proxy. Please log in again."
          );
          setTodos([]);
        } else {
          const errorData = await response.text(); // Get error text from proxy
          console.error("Proxy fetch error:", response.status, errorData);
          throw new Error(`Proxy HTTP error! status: ${response.status}`);
        }
      } else {
        const data: Todo[] = await response.json();
        setTodos(data);
      }
    } catch (e: any) {
      console.error("Failed to fetch todos via proxy:", e);
      setError("Failed to load todos via proxy.");
      setTodos([]);
    }
  };

  const handleAddTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Use PROXY_API_URL
    if (!newTask.trim() || !session) return;
    try {
      setError(null);
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      const response = await fetch(PROXY_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ task: newTask }),
        // No credentials: 'include' needed for same-origin
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError("Authentication failed adding todo via proxy.");
        } else {
          const errorData = await response.text();
          console.error("Proxy add error:", response.status, errorData);
          throw new Error(`Proxy HTTP error! status: ${response.status}`);
        }
      } else {
        const addedTodo: Todo = await response.json();
        const newTodos = [addedTodo, ...todos];
        setTodos(newTodos);
        setNewTask("");
        sliderRef.current?.slickGoTo(0);
      }
    } catch (e: any) {
      console.error("Failed to add todo via proxy:", e);
      setError("Failed to add todo via proxy.");
    }
  };

  const handleDeleteTodo = async (id: string) => {
    // Use PROXY_API_URL
    if (!session) return;
    try {
      setError(null);
      const response = await fetch(`${PROXY_API_URL}/${id}`, {
        method: "DELETE",
        // No credentials: 'include' needed for same-origin
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError("Authentication failed deleting todo via proxy.");
        } else if (response.status === 404) {
          console.warn(
            "Attempted to delete non-existent or unauthorized todo via proxy:",
            id
          );
          setTodos(todos.filter((todo) => todo.id !== id));
        } else {
          const errorData = await response.text();
          console.error("Proxy delete error:", response.status, errorData);
          throw new Error(`Proxy HTTP error! status: ${response.status}`);
        }
      } else {
        setTodos(todos.filter((todo) => todo.id !== id));
      }
    } catch (e: any) {
      console.error("Failed to delete todo via proxy:", e);
      setError(`Failed to delete todo via proxy: ${e.message}`);
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
        <h1>TEST</h1>
        {/* <div style={styles.headerContainer}>
          <h1 style={styles.title}>✨ Task Master</h1>
          <p style={styles.subtitle}>Organize your day, achieve your goals</p>
        </div> */}
        <h1 style={styles.title}>My Todos</h1>

        {/* Auth Buttons */}
        <div style={styles.authContainer}>
          {user ? (
            <div style={styles.userInfo}>
              <div style={styles.userEmail}>
                <img src="/user-circle.svg" alt="User" style={styles.userIcon} />
                <span>{user.email}</span>
              </div>
              <button onClick={handleLogout} style={styles.logoutButton}>
                Sign Out
              </button>
            </div>
          ) : (
            <button onClick={handleLogin} style={styles.loginButton}>
              Continue with Google
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
    margin: 0,
    lineHeight: 1.15,
    fontSize: '3rem',
    background: 'linear-gradient(to right, #ffffff, #e0e7ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textAlign: 'center' as 'center',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: '1.2rem',
    color: '#e0e7ff',
    marginTop: '0.5rem',
    fontWeight: '500',
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
    marginBottom: '2rem',
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    justifyContent: 'center',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    background: '#f9fafb',
    padding: '0.75rem 1rem',
    borderRadius: '12px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
    width: '100%',
    justifyContent: 'space-between',
  },
  userEmail: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#374151',
    fontSize: '0.95rem',
  },
  userIcon: {
    width: '24px',
    height: '24px',
  },
  loginButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1.5rem',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    backgroundColor: 'white',
    color: '#374151',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
    ':hover': {
      backgroundColor: '#f9fafb',
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    },
  },
  logoutButton: {
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '0.95rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#dc2626',
    },
  },
  googleIcon: {
    width: '20px',
    height: '20px',
  },
};
