import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";

const app = express();
const port = 3000;
const saltRounds = 10;

// Database configuration
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "motivation_app",
  password: "123",
  port: 5432,
});

let author_of_the_day = "";
let quote_of_the_day = "";

db.connect();

// Middleware setup - ORDER MATTERS!
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration MUST come before passport
app.use(
  session({
    secret: "SECRETPASSWORD", // Change this to a strong secret in production
    resave: false,
    saveUninitialized: false, // Changed to false for security
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// DEBUG MIDDLEWARE - Add this to see what's happening
app.use((req, res, next) => {
  console.log('=== REQUEST DEBUG ===');
  console.log('Path:', req.path);
  console.log('Method:', req.method);
  console.log('Session ID:', req.sessionID);
  console.log('Is Authenticated:', req.isAuthenticated());
  console.log('User:', req.user);
  console.log('Session:', req.session);
  console.log('===================');
  next();
});

// Fetch quote on startup and every hour
await fetchQuote();
setInterval(fetchQuote, 3600 * 1000);

// ============================================================================
// PASSPORT CONFIGURATION
// ============================================================================

// Local Strategy for login
passport.use(
  "local-login",
  new Strategy(async function verify(username, password, cb) {
    console.log('🔐 Strategy called with username:', username);
    try {
      const result = await db.query(
        "SELECT * FROM userbase WHERE username = $1",
        [username]
      );

      if (result.rows.length === 0) {
        console.log('❌ User not found');
        return cb(null, false, { message: "User not found. Please register." });
      }

      const user = result.rows[0];
      console.log('✅ User found:', user.username);

      // Compare hashed password
      const match = await bcrypt.compare(password, user.password);

      if (match) {
        console.log('✅ Password match! Login successful');
        return cb(null, user);
      } else {
        console.log('❌ Password mismatch');
        return cb(null, false, { message: "Incorrect password." });
      }
    } catch (err) {
      console.error("Error during authentication:", err);
      return cb(err);
    }
  })
);

// Serialize user - stores user.id in the session
passport.serializeUser((user, cb) => {
  console.log('📝 Serializing user:', user.id);
  cb(null, user.id);
});

// Deserialize user - retrieves full user object from database using stored id
passport.deserializeUser(async (id, cb) => {
  console.log('📖 Deserializing user ID:', id);
  try {
    const result = await db.query("SELECT * FROM userbase WHERE id = $1", [id]);
    if (result.rows.length > 0) {
      console.log('✅ User deserialized:', result.rows[0].username);
      cb(null, result.rows[0]);
    } else {
      console.log('❌ User not found during deserialization');
      cb(new Error("User not found"));
    }
  } catch (err) {
    console.error('❌ Error during deserialization:', err);
    cb(err);
  }
});

// ============================================================================
// MIDDLEWARE - Check if user is authenticated
// ============================================================================

function ensureAuthenticated(req, res, next) {
  console.log('🔒 ensureAuthenticated check:', req.isAuthenticated());
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login-page");
}

// ============================================================================
// ROUTES
// ============================================================================

app.get("/", (req, res) => {
  if (req.user){
    res.render("index.ejs", {
    user: req.user.username,})
  }else{
  res.render("index.ejs")
  }});

// Render login page
app.get("/login-page", (req, res) => {
  res.render("login.ejs", {
    is_logging: true,
    error: null,
  });
});

// Render register page
app.get("/register-page", (req, res) => {
  res.render("login.ejs", {
    is_logging: false,
    error: null,
  });
});

// Handle login with Passport
app.post(
  "/signed-in",
  passport.authenticate("local-login", {
    successRedirect: "/", // Redirect to home on success
    failureRedirect: "/login-page", // Redirect back to login on failure
  })
);

// Handle registration
app.post("/registered", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if username already exists
    const checkResult = await db.query(
      "SELECT username FROM userbase WHERE username = $1",
      [username]
    );

    if (checkResult.rows.length > 0) {
      console.log("Username exists!");
      return res.render("login.ejs", {
        is_logging: false,
        error: "Username already exists. Please choose another.",
      });
    }

    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    await db.query(
      "INSERT INTO userbase (username, password) VALUES ($1, $2)",
      [username, hashedPassword]
    );

    console.log("User registered successfully!");
    
    // Redirect to login page after successful registration
    res.render("login.ejs", {
      is_logging: true,
      error: null,
      success: "Registration successful! Please log in.",
    });
  } catch (err) {
    console.error("Error during registration:", err);
    res.status(500).send("Could not create user");
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.redirect("/");
    }
    res.redirect("/");
  });
});

app.post("/sign-out", (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.redirect("/");
    }
    console.log("✅ User signed out successfully");
    res.redirect("/");
  });
});

// Protected route - Comments page (ANYONE can view, but show different UI)
app.post("/comments", async (req, res) => {
  console.log('📄 Comments route - Authenticated:', req.isAuthenticated());
  console.log('📄 User object:', req.user);
  
  try {
    const result = await db.query("SELECT * FROM motivation_quotes");
    
    const quotes = result.rows.map(row => row.quote);
    const authors = result.rows.map(row => row.author);
    const ids = result.rows.map(row => row.id);
    
    // Check authentication status
    const isSignedIn = req.isAuthenticated();
    
    console.log('✅ Rendering comments with signed_in:', isSignedIn);
    
    res.render("comments.ejs", {
      signed_in: isSignedIn,
      autor_del_dia: author_of_the_day,
      cuotacion_del_dia: quote_of_the_day,
      cuotaciones: quotes,
      autores: authors,
      identificacion: ids,
      user: req.user || null, // Pass authenticated user or null
    });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).send("Error loading comments");
  }
});

// Handle comment actions (edit/delete) - MUST be authenticated
app.post("/comment_form", ensureAuthenticated, async (req, res) => {
  try {
    if (req.body.delete_post) {
      await db.query("DELETE FROM motivation_quotes WHERE id = $1", [
        req.body.quote_number,
      ]);
      console.log("Successfully Deleted");
    } else if (req.body.edit_post) {
      const newQuote = req.body.edit;
      if (newQuote && newQuote.trim() !== "") {
        await db.query(
          "UPDATE motivation_quotes SET quote = $1 WHERE id = $2",
          [newQuote, req.body.quote_number]
        );
        console.log("Successfully Edited");
      }
    }

    // Fetch updated quotes
    const result = await db.query("SELECT * FROM motivation_quotes");
    
    const quotes = result.rows.map(row => row.quote);
    const authors = result.rows.map(row => row.author);
    const ids = result.rows.map(row => row.id);

    res.render("comments.ejs", {
      signed_in: true, // They must be signed in to reach this
      autor_del_dia: author_of_the_day,
      cuotacion_del_dia: quote_of_the_day,
      cuotaciones: quotes,
      autores: authors,
      identificacion: ids,
      user: req.user,
    });
  } catch (err) {
    console.error("Error in comment_form:", err);
    res.status(500).send("Error processing request");
  }
});

// Show post form
app.post("/post", ensureAuthenticated, (req, res) => {
  const isSignedIn = req.isAuthenticated();
  res.render("post.ejs", {
    user: req.user,
    signed_in: isSignedIn,
  });
});

// Route to login page
app.post("/login", (req, res) => {
  res.render("login.ejs", {
    is_logging: true,
    error: null,
  });
});

// Route to register page
app.post("/register", (req, res) => {
  res.render("login.ejs", {
    is_logging: false,
    error: null,
  });
});

// Handle new quote submission
app.post("/", ensureAuthenticated, async (req, res) => {
  console.log(`The Quote is ${req.body.quote}`);

  try {
    if (req.body.quote === "") {
      return res.render("post.ejs", {
        no_quote: true,
        user: req.user,
      });
    }

    const author = req.user.username;

    await db.query(
      "INSERT INTO motivation_quotes (author, quote) VALUES ($1, $2)",
      [author, req.body.quote]
    );

    console.log(`Quote Uploaded Successfully by ${author}`);
    res.render("index.ejs", {
      user: req.user,
    });
  } catch (err) {
    console.error("Error inserting quote:", err);
    res.status(500).send("Error saving quote");
  }
});

// Back to home
app.post("/backhome", (req, res) => {
  console.log("Back to homepage");
  res.render("index.ejs", {
    user: req.user.username,
  });
});

// ============================================================================
// SERVER START
// ============================================================================

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function fetchQuote() {
  try {
    const response = await axios.get("https://zenquotes.io/api/random/");
    author_of_the_day = response.data[0].a;
    quote_of_the_day = response.data[0].q;
    console.log("New quote fetched:", author_of_the_day);
  } catch (err) {
    console.error("Quote fetch failed:", err.message);
  }
}