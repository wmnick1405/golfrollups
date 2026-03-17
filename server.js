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
    tel: String,
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
// Create new user (for admin purposes, can be used to create the first user)
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


// CRUD for golfers
app.get('/api/golfers', protect, async (req, res) => {
    try {
        // .sort({ name: 1 }) sorts alphabetically A-Z
        const golfers = await Golfer.find().sort({ name: 1 });
        res.json(golfers);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch golfers" });
    }
});

// Create a new golfer - this is where we save the golfer records to the database
app.post('/api/golfers', protect, async (req, res) => {
    try {
        const { name, tel, email, play_days } = req.body; // Using 'tel'

        if (!name) {
            return res.status(400).json({ error: "Golfer name is required" });
        }

        const golfer = new Golfer({ name, tel, email, play_days });
        await golfer.save();

        res.json({ success: true, message: "Golfer added" });
    } catch (err) {
        res.status(500).json({ error: "Database error: " + err.message });
    }
});

// Update golfer details - this is where we update the golfer records in the database
app.put('/api/golfers/:id', protect, async (req, res) => {
    try {
        const { name, tel, email, play_days } = req.body; // Using 'tel'

        await Golfer.findByIdAndUpdate(req.params.id, {
            name,
            tel,
            email,
            play_days
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

//Post golfer unavailability (can be a date range or indefinite) - this is where we save the unavailability records to the database
app.post('/api/unavailable', protect, async (req, res) => {
    try {
        const { golfer_id, date_from, date_to, indefinite } = req.body;

        const record = new Unavailable({
            golfer_id,
            date_from,
            // If indefinite is true, date_to should be null or empty
            date_to: indefinite ? null : date_to, 
            indefinite
        });

        await record.save();
        res.json({ success: true, message: "Unavailability recorded" });
    } catch (err) {
        console.error("Save unavailability error:", err);
        res.status(500).json({ error: "Failed to save record" });
    }
});

// GET available golfers for a specific date
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


// GET unavailability for a specific golfer
app.get('/api/unavailable/golfer/:id', protect, async (req, res) => {
    try {
        // Find all records for this golfer, sorted by start date
        const records = await Unavailable.find({ golfer_id: req.params.id })
            .sort({ date_from: 1 });
        
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch golfer status" });
    }
});

// GET golfers who are indefinitely unavailable
app.get('/api/unavailable/indefinite', protect, async (req, res) => {
    try {
        // This looks in the "unavailables" collection for records marked indefinite
        const list = await Unavailable.find({ indefinite: true })
            .populate('golfer_id') // This "joins" the golfer data so we get the Name
            .exec();

        // Filter out records where the golfer might have been deleted but the record remains
        const validList = list.filter(item => item.golfer_id !== null);
        
        res.json(validList);
    } catch (err) {
        console.error("Indefinite list error:", err);
        res.status(500).json({ error: err.message });
    }
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