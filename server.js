const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./user'); 
const path = require('path');
const session = require('express-session');

const app = express();

// 1. MIDDLEWARE SETUP (Must come first)
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'a-very-secret-key-for-golfchurchill&blakedown', 
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 24 hour session
}));

// 2. THE GATEKEEPER (Protection function)
const protect = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    // IMPORTANT: Send 401 status so the browser knows the session failed
    res.status(401).json({ error: "Unauthorized" });
};

// 3. DATABASE CONNECTION
mongoose.connect('mongodb://localhost:27017/rollups')
.then(()=>console.log("Connected to MongoDB"))
.catch(err=>console.error("MongoDB connection error:",err));

// 4. SCHEMAS
const Golfer = mongoose.model('Golfer', new mongoose.Schema({
    name: { type: String, required: true },
    phone: String,
    email: String,
    play_days: [String],
    booking_count: { type: Number, default: 0 },
    last_booked: { type: Date, default: new Date("2000-01-01") }
}));

const Unavailable = mongoose.model('Unavailable', new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer' },
    date_from: Date,
    date_to: Date,
    indefinite: Boolean
}));

const Rollup = mongoose.model('Rollup', new mongoose.Schema({
    date: { type: Date, required: true },
    groups: [[{ golfer_id: String, name: String, booker: Boolean }]]
}));

// 5. AUTHENTICATION ROUTES (Unprotected)
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id; 
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
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// 6. PROTECTED API ROUTES (All start with /api)
app.post('/api/admin/create-user', protect, async (req, res) => {
    try {
        const { username, password } = req.body;
        const newUser = new User({ username, password });
        await newUser.save();
        res.json({ success: true, message: `User ${username} created!` });
    } catch (err) {
        res.status(500).json({ error: "Could not create user" });
    }
});

app.get('/api/golfers', protect, async (req, res) => {
    const golfers = await Golfer.find().sort({ name: 1 });
    res.json(golfers);
});

app.post('/api/golfers', protect, async (req, res) => {
    try {
        const golfer = new Golfer(req.body);
        await golfer.save();
        res.json({ message: "Golfer added" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/available', protect, async (req, res) => {
    try {
        const date = new Date(req.query.date);
        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const day = dayNames[date.getDay()];
        const golfers = await Golfer.find({ play_days: day });
        const unavailable = await Unavailable.find({
            date_from: { $lte: date },
            $or: [{ date_to: { $gte: date } }, { indefinite: true }]
        });
        const unavailableIds = unavailable.map(u => u.golfer_id.toString());
        const available = golfers.filter(g => !unavailableIds.includes(g._id.toString()));
        res.json(available);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET rollup history
app.get('/api/rollups', protect, async (req, res) => {
    const rollups = await Rollup.find().sort({date:-1});
    res.json(rollups);
});

// GET a single rollup by its database ID
app.get('/api/rollups/:id', protect, async (req, res) => {
    try {
        // req.params.id matches the ":id" in the URL
        const rollup = await Rollup.findById(req.params.id);
        
        if (!rollup) {
            return res.status(404).json({ error: "Rollup not found in database" });
        }
        
        res.json(rollup);
    } catch (err) {
        console.error("Database ID Error:", err);
        res.status(500).json({ error: "Invalid ID format or Server Error" });
    }
});

// DELETE golfer
app.delete('/api/golfers/:id', protect, async (req,res)=>{
    try {
        await Golfer.findByIdAndDelete(req.params.id);
        res.json({success:true});
    } catch(err) { res.status(500).json({error:"Delete failed"}); }
});

// 7. STATIC FILES (Must be LAST)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(3000, () => console.log(`Server running on port 3000`));