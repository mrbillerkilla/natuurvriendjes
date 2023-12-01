const express = require("express"); 
const session = require("express-session");
const path = require("path");
const multer = require('multer');
const mysql = require("mysql2");
const ejs = require("ejs");
const bodyparser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const url = require("url");
const uuid = require("uuid");


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(cors());
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({extended: false }));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "cache")));

app.use(session({
  secret: "mamaGwebo", // Change this to a secure secret key
  resave: false, 
  saveUninitialized: true }));

const cacheMap = path.join(__dirname, "cache");

const db = mysql.createConnection({
  host: 'localhost',
  user: 'Admin',
  port: 4306,
  password: 'Gilde123',
  database: 'milieuvriendjes'
});

db.connect((err) => {
  if(err) {
    console.error('Database niet connect: ', err);
    return;
  }
  console.log('Verbonden met de database');
})

// Define routes and handle form submission
app.post('/register', (req, res) => {
  const username = req.body.usernameR;
  const password = req.body.passwordR;
  const email = req.body.emailR;

  console.log(username, password, email);

  const insertQuery = "INSERT INTO gebruikers (Gebruikersnaam, Wachtwoord, Email) VALUES (?, ?, ?)";

  db.query(insertQuery, [username, password, email], (err, results) => {
    if (err) {
      // Check if the error is due to a duplicate username
      if (err.code === 'ER_DUP_ENTRY') {
        // Registration failed - username is already taken
        const registrationResult = "Username is already taken. Please choose a different username.";  
        return res.status(400).send(registrationResult)
      }
      
      console.error('Error inserting data: ', err);
      return res.status(500).send('Error inserting data');
    }

    console.log('Data inserted successfully:', results);

    // Registration succeeded
    const registrationResult = `Registration successful! Username: ${username}, Email: ${email}`;
    
    // Redirect to index.html
    res.redirect('/index.html');
  });
});

app.post("/login", (req, res) => { 
  const username = req.body.username;
  const password = req.body.password;

  console.log("Received username:", username);
  console.log("Received password:", password);

  db.query(
    'SELECT * FROM gebruikers WHERE BINARY Gebruikersnaam = ? AND BINARY Wachtwoord = ?',
    [username, password],
    (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return res.status(500).send("Error during authentication");
      }

      // Check if the query returned any rows (indicating a successful login)
      if (results.length === 1) {
        // Authentication successful

        // Store user information in the session
        req.session.user = username;


        // Redirect to the home page
        return res.redirect("/home.html");
      } else {
        // Authentication failed
        return res.status(401).send("Authentication failed");
      }
    }
  );
});

function requireAuth(req, res, next) {
  if (req.session.user) {
    // User is authenticated
    next(); // Continue to the protected route
  } else {
    // User is not authenticated, redirect to the login page or handle as needed
    res.redirect("/index.html"); // Redirect to the login page
  }
}

// Example of a protected route
app.get("/protected", requireAuth, (req, res) => {
  res.send("This is a protected route.");
});


app.get("/home", requireAuth, (req, res) => {
  const username = req.session.user;
  res.json({ username });
});

app.get("/info.html", requireAuth, (req, res) => {

    res.sendFile(path.join(__dirname, "public", "info.html"));
});

app.post("/upload", upload.single('uploaded-image'), (req, res) => {
  const bericht = req.body.bericht;
  const fotoData = req.file.buffer; // This will contain the image data
  const usernameupload = req.session.user; 

  const bestandNaam = uuid.v4() + ".png";

  fs.writeFileSync(path.join(cacheMap, bestandNaam), fotoData);

  const insertQuery = "INSERT INTO uploads (bericht, foto, Gebruikersnaam) VALUES (?, ?, ?)";

  db.query(insertQuery, [bericht, bestandNaam, usernameupload], (err, results) => {
    if (err) {
      console.error('Error inserting data: ', err);
      return res.status(500).send('Error inserting data');
    }

    console.log('Data inserted successfully:', results);
    return res.redirect("/social.html");
  });
});

app.post("/delete-post", function(req, res) {
  const { foto, ID } = req.body;

  // Eerst verwijder reacties gekoppeld aan de verwijderde foto
  db.query("DELETE FROM Reacties WHERE UploadID = ?", [ID], function(err, results) {
    if (err) {
      console.error("Fout bij het verwijderen van reacties:", err);
      return res.status(501).send("Reacties zijn niet verwijderd");
    }

    // Vervolgens verwijder de foto zelf
    db.query("DELETE FROM uploads WHERE ID = ?", [ID], function(err, results) {
      if (err) {
        console.error("Fout bij het verwijderen van de foto:", err);
        return res.status(501).send("Foto is niet verwijderd");
      }

      // Als er geen fouten zijn opgetreden, betekent dit dat zowel de reacties als de foto zijn verwijderd
      fs.unlink(`${cacheMap}/${foto}`, (err) => {
        if (err) {
          console.error("Fout bij het verwijderen van het fysieke bestand:", err);
          return res.status(501).send("Fout bij het verwijderen van het fysieke bestand");
        }

        // Als alles succesvol is verwijderd, stuur een succesbericht
        res.status(200).send("Foto en reacties zijn verwijderd");
      });
    });
  });
});


app.get("/get-all-images", (req, res) => {
  const selectQuery = "SELECT * FROM uploads"; // Modify the query as needed
  db.query(selectQuery, (err, results) => {
    if (err) {
      console.error('Error fetching image data: ', err);
      return res.status(500).send('Error fetching image data');
    }

    res.json(results);
  });
});



app.get("/get-all-reacties", (req, res) => {
  const UploadID = req.query.UploadID; // Haal de UploadID op uit het queryparameters

  db.query("SELECT * FROM reacties WHERE UploadID = ?", [UploadID], function(err, results) {
      if (err) {
          console.error('Error fetching comments: ', err);
          return res.status(500).send('Error fetching comments');
      }

      // Stuur de reacties terug als JSON
      res.json(results);
  });
});

app.post("/verstuurReactie", function(req, res) {
  const reactieTekst = req.body.ReactieTekst; // Haal de ReactieTekst op uit het verzoek
  const uploadID = req.body.UploadID; // Haal de UploadID op uit het verzoek
  const Gebruikersnaam = req.body.Gebruikersnaam; // Haal de UploadID op uit het verzoek

  // Gebruik de juiste SQL-syntaxis voor het invoegen van gegevens met UploadID
  db.query("INSERT INTO Reacties (ReactieTekst, UploadID, Gebruikersnaam) VALUES (?, ?, ?)", [reactieTekst, uploadID, Gebruikersnaam], function(err, results) {
      if (err) {
          console.error("Fout bij het invoegen van de reactie:", err);
          return res.status(500).send("Reactie is niet verzonden");
      }

      // Stuur een succesrespons terug naar de client
      res.status(200).send("Reactie succesvol verzonden naar de database");
  });
});




app.get("/logout", (req, res) => {
  // Destroy the user session
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Error during logout");
    }
    // Redirect to the index.html page after logout
    res.redirect("/index.html");
  });
});

app.get("/", function(req, res) {
   
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(80, function() {

    console.log("Server draait op port 80");
});