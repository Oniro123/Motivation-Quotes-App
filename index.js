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

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "SECRETPASSWORD",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  console.log('REQUEST DEBUG');
  console.log('Path:', req.path);
  console.log('Method:', req.method);
  console.log('Session ID:', req.sessionID);
  console.log('Is Authenticated:', req.isAuthenticated());
  console.log('User:', req.user);
  console.log('Session:', req.session);
  next();
});

await fetchQuote();
setInterval(fetchQuote, 3600 * 1000);

passport.use(
  "local-login",
  new Strategy(async function verify(username, password, cb) {
    console.log('Strategy called with username:', username);
    try {
      const result = await db.query(
        "SELECT * FROM userbase WHERE username = $1",
        [username]
      );

      if (result.rows.length === 0) {
        console.log('User not found');
        return cb(null, false, { message: "User not found. Please register." });
      }

      const user = result.rows[0];
      console.log('User found:', user.username);

      const match = await bcrypt.compare(password, user.password);

      if (match) {
        console.log('Password match, login successful');
        return cb(null, user);
      } else {
        console.log('Password mismatch');
        return cb(null, false, { message: "Incorrect password." });
      }
    } catch (err) {
      console.error("Error during authentication:", err);
      return cb(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  console.log('Serializing user:', user.id);
  cb(null, user.id);
});

passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT * FROM userbase WHERE id = $1", [id]);
    if (result.rows.length > 0) {
      console.log('User deserialized:', result.rows[0].username);
      cb(null, result.rows[0]);
    } else {
      cb(new Error("User not found"));
    }
  } catch (err) {
    console.error('Error during deserialization:', err);
    cb(err);
  }
});


function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login-page");
}


app.get("/", (req, res) => {
  if (req.user){
    res.render("index.ejs", {
    user: req.user.username,})
  }else{
  res.render("index.ejs")
  }});

app.get("/login-page", (req, res) => {
  res.render("login.ejs", {
    is_logging: true,
    error: null,
  });
});

app.get("/register-page", (req, res) => {
  res.render("login.ejs", {
    is_logging: false,
    error: null,
  });
});


app.post(
  "/signed-in",
  passport.authenticate("local-login", {
    successRedirect: "/",
    failureRedirect: "/login-page",
  })
);

app.post("/registered", async (req, res) => {
  const { username, password } = req.body;

  try {
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

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await db.query(
      "INSERT INTO userbase (username, password) VALUES ($1, $2)",
      [username, hashedPassword]
    );

    console.log("User registered successfully");
    
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
    console.log("User signed out successfully");
    res.redirect("/");
  });
});

app.post("/comments", async (req, res) => {
  
  try {
    const result = await db.query("SELECT * FROM motivation_quotes");
    
    const quotes = result.rows.map(row => row.quote);
    const authors = result.rows.map(row => row.author);
    const ids = result.rows.map(row => row.id);
    
    const isSignedIn = req.isAuthenticated();
    
    console.log('Rendering comments with signed_in:', isSignedIn);
    
    res.render("comments.ejs", {
      signed_in: isSignedIn,
      autor_del_dia: author_of_the_day,
      cuotacion_del_dia: quote_of_the_day,
      cuotaciones: quotes,
      autores: authors,
      identificacion: ids,
      user: req.user || null,
    });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).send("Error loading comments");
  }
});

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

    const result = await db.query("SELECT * FROM motivation_quotes");
    
    const quotes = result.rows.map(row => row.quote);
    const authors = result.rows.map(row => row.author);
    const ids = result.rows.map(row => row.id);

    res.render("comments.ejs", {
      signed_in: true,
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

app.post("/post", ensureAuthenticated, (req, res) => {
  const isSignedIn = req.isAuthenticated();
  res.render("post.ejs", {
    user: req.user,
    signed_in: isSignedIn,
  });
});

app.post("/login", (req, res) => {
  res.render("login.ejs", {
    is_logging: true,
    error: null,
  });
});

app.post("/register", (req, res) => {
  res.render("login.ejs", {
    is_logging: false,
    error: null,
  });
});

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
      user: req.user.username,
    });
  } catch (err) {
    console.error("Error inserting quote:", err);
    res.status(500).send("Error saving quote");
  }
});

app.post("/backhome", (req, res) => {
  if (req.user){
    res.render("index.ejs", {
    user: req.user.username,})
  }else{
  res.render("index.ejs")
  }});


app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});


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