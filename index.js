import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
const port = 3000;
let author_of_the_day = ""
let quote_of_the_day = ""
let quotes = []
let authors = []


app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/",async(req,res) =>{
  try {
    const response = await axios.get('https://zenquotes.io/api/random/');
    author_of_the_day = response.data[0].a
    quote_of_the_day = response.data[0].q
    console.log(author_of_the_day)
  } catch (error) {
    console.error(error);
  }
    res.render("index.ejs");
    
});

app.post('/comments', (req,res) =>{
   res.render("comments.ejs",{
    autor_del_dia: author_of_the_day,
    cuotacion_del_dia: quote_of_the_day,
    cuotaciones: quotes,
    autores: authors,
  });
});

app.post('/comment_form', (req, res) => {
  const quoteNumber = parseInt(req.body.quote_number); 
  if (req.body.delete_post) {

    quotes.splice(quoteNumber, 1);
    authors.splice(quoteNumber, 1);
  } 
  else if (req.body.edit_post) {
    
    const newQuote = req.body.edit;
    if (newQuote && newQuote.trim() !== '') {
      quotes[quoteNumber] = newQuote;
    }
  }
  
  res.render("comments.ejs", {
    cuotaciones: quotes,
    autores: authors,
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
        authors.push("Anonymous");
      }else{
        authors.push(req.body.name);
      }
    quotes.push(req.body.quote);
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

