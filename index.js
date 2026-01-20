import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";

const app = express();
const port = 3000;
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "motivation_app",
  password: "123",
  port: 5432,
});
db.connect();

let author_of_the_day = ""
let quote_of_the_day = ""


app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
await fetchQuote();
setInterval(fetchQuote, 3600 * 1000);

app.get("/",(req,res) =>{
    res.render("index.ejs");
    
});

app.post('/comments', (req,res) =>{
    let quotes = []
    let authors = []
    let ids = []
    db.query("SELECT * FROM motivation_quotes", (err,result) => {
      if (err){
        console.error("Error executing query", err.stack);
      }else{
        for (let row of result.rows){
          quotes.push(row.quote)
          authors.push(row.author)
        }
           res.render("comments.ejs",{
              autor_del_dia: author_of_the_day,
              cuotacion_del_dia: quote_of_the_day,
              cuotaciones: quotes,
              autores: authors,
              identificacion: ids,
  });
      }
      });
});

app.post('/comment_form', (req, res) => {
  const quoteNumber = parseInt(req.body.quote_number); 
  if (req.body.delete_post) {
      db.query("DELETE FROM motivation_quotes WHERE id = $1",[quoteNumber], (err, result)=>{
        if (err){
          console.error("Error executing query", err.stack);
        }else{
          console.log("Succesfully Deleted")
        }
      })
  } 
  else if (req.body.edit_post) {
    
    const newQuote = req.body.edit;
    if (newQuote && newQuote.trim() !== '') {

        db.query("UPDATE motivation_quotes SET quote = $1 WHERE id = $2",[newQuote, quoteNumber], (err, result)=>{
        if (err){
          console.error("Error executing query", err.stack);
        }else{
          console.log("Succesfully Edited")
        }
      })
      
    }
  }
  
    let quotes = []
    let authors = []
    let ids = []
    db.query("SELECT * FROM motivation_quotes", (err,result) => {
      if (err){
        console.error("Error executing query", err.stack);
      }else{
        for (let row of result.rows){
          quotes.push(row.quote)
          authors.push(row.author)
          ids.push(row.id)
        }
           res.render("comments.ejs",{
              autor_del_dia: author_of_the_day,
              cuotacion_del_dia: quote_of_the_day,
              cuotaciones: quotes,
              autores: authors,
              identificacion: ids,
  });
      }
      });
});

app.post('/post',(req,res)=>{
   res.render("post.ejs");
});

app.post('/',(req,res)=>{
    console.log(`The Author is ${req.body.name}`)
    console.log(`The Quote is ${req.body.quote}`)
    if (req.body.quote == ""){
      res.render("post.ejs", {
        no_quote: true,
      });
    }else{
      if (req.body.name == ""){

        db.query("INSERT INTO motivation_quotes (author,quote) VALUES ('Anonymous', $1)", [req.body.quote], (err,res) => {
          if (err){
            console.error("Error executing query", err.stack);
          }else{
            console.log("Quote Uploaded Succesfully, it is Anonymous")
          }
          });

      }else{
        console.log(req.body.name)
        db.query("INSERT INTO motivation_quotes (author,quote) VALUES ($1, $2)",[req.body.name, req.body.quote], (err,res) => {
          if (err){
            console.error("Error executing query", err.stack);
          }else{
            console.log("Quote Uploaded Succesfully, it is NOT Anonymous")
          }
          });

      }


    res.render("index.ejs");
    }

});

app.post('/backhome',(req,res)=>{
  console.log("Back to homepage")
    res.render("index.ejs");

});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

async function fetchQuote() {
  try {
    const response = await axios.get('https://zenquotes.io/api/random/');
    author_of_the_day = response.data[0].a;
    quote_of_the_day = response.data[0].q;
    console.log("New quote fetched:", author_of_the_day);
  } catch (err) {
    console.error("Quote fetch failed:", err.message);
  }
}