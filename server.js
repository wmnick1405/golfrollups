/**
 * SECTION 1: IMPORTS & LIBRARIES
 * Think of these as the "tools" we need to build our app.
 */
const express = require('express');    // The web server framework
const mongoose = require('mongoose');   // The tool to talk to our MongoDB database
const bcrypt = require('bcrypt');       // Used to securely hash and check passwords
const User = require('./user');         // A separate file defining our "User" (admin) model
const path = require('path');           // Handles file and folder paths
const session = require('express-session'); // Keeps users logged in using "cookies"
const fs = require('fs');               // Allows the app to read/write files on your computer

const app = express(); // Initialize the web server

/**
 * SECTION 2: MIDDLEWARE
 * These are functions that run on every single request before reaching your routes.
 */
app.use(express.json()); // Allows the server to read JSON data sent from a frontend
app.use(express.urlencoded({ extended: true })); // Allows reading data from standard HTML forms

// Configure how the server remembers who is logged in
app.use(session({
  secret: 'a-very-secret-key-for-golfchurchill&blakedown', // Change this for real-world apps!
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // Stay logged in for 24 hours
}));

/**
 * SECTION 3: SECURITY (THE GATEKEEPER)
 * This function checks if a user is logged in. If they aren't, it stops them
 * from seeing private data. We use this later in our routes.
 */
const protect = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next(); // User is logged in, proceed to the next step
    }
    res.status(401).json({ error: "Unauthorized" }); // Stop! You aren't logged in.
};

/**
 * SECTION 4: DATABASE CONNECTION
 * Connecting to your local MongoDB database named 'rollupsdb'.
 */
mongoose.connect('mongodb://localhost:27017/rollupsdb')
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));

/**
 * SECTION 5: DATA MODELS (SCHEMAS)
 * This defines the "shape" of the data we store in the database.
 */

// Define what a 'Golfer' looks like
const Golfer = mongoose.model('Golfer', new mongoose.Schema({
    name: { type: String, required: true },
    tel: String,
    email: String,
    play_days: [String],        // e.g., ["Monday", "Wednesday"]
    booking_count: { type: Number, default: 0 },
    last_booked: { type: Date, default: new Date("2000-01-01") },
    booking_exempt: { type: Boolean, default: false }
}));

// Tracks when a golfer is on holiday or away
const Unavailable = mongoose.model('Unavailable', new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer' },
    date_from: Date,
    date_to: Date,
    indefinite: Boolean
}));

// Stores the actual groups for a specific date
const Rollup = mongoose.model('Rollup', new mongoose.Schema({
    date: { type: Date, required: true },
    groups: [[{ golfer_id: String, name: String, booker: Boolean }]] // A list of lists (groups)
}));

/**
 * SECTION 6: AUTHENTICATION ROUTES
 * Handling Login and Logout.
 */
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username }); // Find user by name
        
        // Compare the submitted password with the encrypted one in the database
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id; // Remember this user's ID in the session
            res.json({ success: true, message: "Logged in" });
        } else {
            res.status(401).json({ error: "Invalid username or password" });
        }
    } catch (err) {
        res.status(500).json({ error: "Server error during login" });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid'); // Remove the login cookie from the browser
        res.json({ success: true });
    });
});

/**
 * SECTION 7: GOLFER MANAGEMENT (CRUD)
 * CRUD stands for Create, Read, Update, Delete.
 * Notice the 'protect' function added to these routes to keep them private.
 */

// GET all golfers
app.get('/api/golfers', protect, async (req, res) => {
    try {
        const golfers = await Golfer.find().sort({ name: 1 }); // Find all, sort A-Z
        res.json(golfers);
    } catch (err) { 
        res.status(500).json({ error: "Failed to fetch golfers" }); 
    }
});

// CREATE a new golfer
app.post('/api/golfers', protect, async (req, res) => {
    try {
        const golfer = new Golfer(req.body);
        await golfer.save();
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

/**
 * SECTION 8: LOGIC - FINDING AVAILABLE GOLFERS
 * This is the "brain" of the app. It calculates who can play on a specific date.
 */
app.get('/api/available', protect, async (req, res) => {
    try {
        const dateStr = req.query.date;
        const targetDate = new Date(dateStr);
        targetDate.setHours(0,0,0,0);

        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const dayName = dayNames[targetDate.getDay()]; // Get text name of the day (e.g. "Monday")

        // 1. Find golfers who usually play on this day of the week
        const golfers = await Golfer.find({ play_days: dayName }).lean();

        // 2. Find everyone who has marked themselves as "Away" for this date
        const away = await Unavailable.find({
            date_from: { $lte: targetDate },
            $or: [
                { date_to: { $gte: targetDate } },
                { indefinite: true }
            ]
        });

        // 3. Filter out the "Away" golfers from the "Available" list
        const awayIds = away.map(a => a.golfer_id.toString());
        const available = golfers.filter(g => !awayIds.includes(g._id.toString()));
        
        res.json(available);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

/**
 * SECTION 9: SERVER STARTUP
 */
app.use(express.static(path.join(__dirname, 'public'))); // Serve your website files (HTML/CSS)

app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});