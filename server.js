require('dotenv').config(); 

// New FOR SECURITY: No fallback. If SESSION_SECRET isn't in .env, the app throws an error.
if (!process.env.SESSION_SECRET) {
    console.error("FATAL ERROR: SESSION_SECRET is not defined in .env file.");
    process.exit(1); // Stop the server immediately
}

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); // Ensure bcryptjs is installed: npm install bcryptjs
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const morgan = require('morgan');
const ical = require('node-ical');

const app = express();

// 1. MIDDLEWARE SETUP
app.use(morgan('tiny')); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    name: 'golf_sid', // Hidden session name for security
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS/Nginx later
        httpOnly: true, // Prevents XSS cookie theft
        maxAge: 1000 * 60 * 60 * 24 
    }
}));

// 2. THE GATEKEEPER
const protect = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ error: "Unauthorized" });
};

// 3. DATABASE CONNECTION
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/rollupsdb')
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));

// 4. DATA SCHEMAS
// --- AUTHENTICATION SCHEMA ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

// PRE-SAVE HOOK: Automatically hashes password before saving to DB
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) { next(err); }
});

const User = mongoose.model('User', userSchema);

// --- GOLF SCHEMAS ---
const Golfer = mongoose.model('Golfer', new mongoose.Schema({
    name: { type: String, required: true },
    tel: String,
    email: String,
    play_days: [String],
    booking_count: { type: Number, default: 0 },
    last_booked: { type: Date, default: new Date("2000-01-01") },
    booking_exempt: { type: Boolean, default: false }
}));

const TeeTime = mongoose.model('TeeTime', new mongoose.Schema({
    time: { type: String, required: true },
    season: { type: String, default: "Summer" }
}), 'tee-times');

const Rollup = mongoose.model('Rollup', new mongoose.Schema({
    date: { type: Date, required: true },
    competition: { type: String, default: "Social" },
    // Updated structure to hold times per group
    groups: [{
        time: String,
        players: [{ golfer_id: String, name: String, booker: Boolean }]
    }]
}));

// (Remaining models: Unavailable, ExtraAvailability, ClubCalendar, CompetitionName stay as you had them)
const Unavailable = mongoose.model('Unavailable', new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer' },
    date_from: Date,
    date_to: Date,
    indefinite: Boolean
}));

const CompetitionName = mongoose.model('CompetitionName', new mongoose.Schema({
    'comp-name': { type: String, required: true } 
}), 'competition-names');

const ExtraAvailability = mongoose.model('ExtraAvailability', new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer', required: true },
    date: { type: Date, required: true },
    note: String
}));

const ClubCalendar = mongoose.model('ClubCalendar', new mongoose.Schema({
    uid: { type: String, unique: true },
    title: String,
    start: Date,
    end: Date,
    location: String
}, { collection: 'club-calendar' }));


// 5. AUTHENTICATION ROUTES
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        // bcrypt.compare automatically handles comparing plain text vs hash
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id;
            req.session.save((err) => {
                if (err) return res.status(500).json({ error: "Session save failed" });
                res.json({ success: true, message: "Logged in" });
            });
        } else {
            res.status(401).json({ error: "Invalid username or password" });
        }
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('golf_sid');
        res.json({ success: true });
    });
});

// Admin route to create new users - now uses the .pre('save') hashing automatically
app.post('/api/admin/create-user', protect, async (req, res) => {
    try {
        const newUser = new User(req.body);
        await newUser.save(); 
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed to create secure user" }); }
});



// 6. TEE TIME ROUTES
app.get('/api/tee-times', protect, async (req, res) => {
    try {
        const times = await TeeTime.find().sort({ time: 1 });
        res.json(times);
    } catch (err) { res.status(500).json({ error: "Tee times fetch failed" }); }
});

// 7. GOLFER ROUTES
app.get('/api/golfers', protect, async (req, res) => {
    try {
        const golfers = await Golfer.find().sort({ name: 1 });
        res.json(golfers);
    } catch (err) { res.status(500).json({ error: "Failed to fetch golfers" }); }
});

app.post('/api/golfers', protect, async (req, res) => {
    try {
        const { name } = req.body;
        
        // 1. Basic Validation: Ensure name isn't just empty spaces
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: "Golfer name is required." });
        }

        const cleanName = name.trim();

        // 2. Duplicate Check: Search for this name (Case-Insensitive)
        // The 'i' flag makes it ignore capital vs lowercase
        const existing = await Golfer.findOne({ 
            name: { $regex: new RegExp(`^${cleanName}$`, 'i') } 
        });

        if (existing) {
            // 400 means "Bad Request" - the user sent something we can't accept
            return res.status(400).json({ error: `The golfer "${cleanName}" already exists in the database.` });
        }

        // 3. If we get here, the name is unique! Save it.
        const golfer = new Golfer(req.body);
        await golfer.save();
        res.json({ success: true });

    } catch (err) { 
        console.error("Add Golfer Error:", err);
        res.status(500).json({ error: "Server error while adding golfer." }); 
    }
});

app.put('/api/golfers/:id', protect, async (req, res) => {
    try {
        await Golfer.findByIdAndUpdate(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

app.delete('/api/golfers/:id', protect, async (req,res)=>{
    try {
        await Golfer.findByIdAndDelete(req.params.id);
        res.json({success:true});
    } catch(err) { res.status(500).json({error:"Delete failed"}); }
});

// 8. AVAILABILITY & ABSENCE ROUTES
app.get('/api/available', protect, async (req, res) => {
    try {
        const dateStr = req.query.date;
        const targetDate = new Date(dateStr);
        targetDate.setHours(0,0,0,0);
        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const dayName = dayNames[targetDate.getDay()];

        const golfers = await Golfer.find({ play_days: dayName }).lean();
        const away = await Unavailable.find({
            date_from: { $lte: targetDate },
            $or: [{ date_to: { $gte: targetDate } }, { indefinite: true }]
        });
        const awayIds = away.map(a => a.golfer_id.toString());
        const available = golfers.filter(g => !awayIds.includes(g._id.toString()));
        res.json(available);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/unavailable', protect, async (req, res) => {
    try {
        const { date_from, date_to, indefinite } = req.body;

        // 1. Logic Check
        const start = new Date(date_from);
        
        if (!indefinite) {
            const end = new Date(date_to);
            if (end < start) {
                return res.status(400).json({ 
                    error: "Return date cannot be earlier than departure date." 
                });
            }
        }

        // 2. Proceed to save
        const record = new Unavailable(req.body);
        await record.save();
        res.json({ success: true });

    } catch (err) { 
        res.status(500).json({ error: "Failed to save record" }); 
    }
});

app.get('/api/unavailable/all', protect, async (req, res) => {
    try {
        const list = await Unavailable.find({}).populate('golfer_id').sort({ date_from: -1 });
        res.json(list.filter(item => item.golfer_id));
    } catch (err) { res.status(500).json({ error: "Report data failed" }); }
});

app.get('/api/unavailable/golfer/:id', protect, async (req, res) => {
    const records = await Unavailable.find({ golfer_id: req.params.id }).sort({ date_from: 1 });
    res.json(records);
});

app.get('/api/unavailable/indefinite', protect, async (req, res) => {
    const list = await Unavailable.find({ indefinite: true }).populate('golfer_id');
    res.json(list.filter(i => i.golfer_id));
});

app.delete('/api/unavailable/:id', protect, async (req, res) => {
    try {
        await Unavailable.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

// 9. ROLLUP & PARTICIPATION REPORT ROUTES
app.post('/api/rollups', protect, async (req, res) => {
    try {
        const rollup = new Rollup(req.body);
        await rollup.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/rollups/find', protect, async (req, res) => {
    const queryDate = new Date(req.query.date);
    const start = new Date(queryDate).setHours(0,0,0,0);
    const end = new Date(queryDate).setHours(23,59,59,999);
    const rollup = await Rollup.findOne({ date: { $gte: start, $lte: end } });
    if (!rollup) return res.status(404).json({ message: "Not found" });
    res.json(rollup);
});

app.get('/api/rollups', protect, async (req, res) => {
    const rollups = await Rollup.find().sort({ date: -1 });
    res.json(rollups);
});

app.get('/api/rollups/:id', protect, async (req, res) => {
    try {
        const rollup = await Rollup.findById(req.params.id);
        res.json(rollup);
    } catch (err) { res.status(404).json({ error: "Not found" }); }
});

app.get('/api/reports/participation', protect, async (req, res) => {
    try {
        const { from, to } = req.query;
        let query = {};
        
        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = new Date(from);
            if (to) query.date.$lte = new Date(to);
        }

        const history = await Rollup.find(query).lean();
        const stats = {};
        history.forEach(rollup => {
            rollup.groups.forEach(group => {
                group.forEach(player => {
                    if (!stats[player.name]) stats[player.name] = { played: 0, booked: 0 };
                    stats[player.name].played++;
                    if (player.booker) stats[player.name].booked++;
                });
            });
        });
        const report = Object.keys(stats).map(name => ({
            name,
            played: stats[name].played,
            booked: stats[name].booked,
            percentage: ((stats[name].booked / stats[name].played) * 100).toFixed(1) + '%'
        })).sort((a, b) => a.name.localeCompare(b.name));
        res.json(report);
    } catch (err) { res.status(500).json([]); }
});

// NEW: PLAYER HISTORY REPORT
app.get('/api/reports/player-history', protect, async (req, res) => {
    try {
        const { name, from, to } = req.query;
        const searchName = name.trim();
        const nameRegex = new RegExp(`^${searchName}$`, 'i');

        // NEW SEARCH STRATEGY: Look into the nested arrays
        let query = { 
            groups: { 
                $elemMatch: { 
                    $elemMatch: { name: nameRegex } 
                } 
            } 
        };
        
        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = new Date(from);
            if (to) query.date.$lte = new Date(to);
        }

        const rollups = await Rollup.find(query).sort({ date: -1 }).lean();
        console.log(`Deep Search found ${rollups.length} matches for ${searchName}`);

        const results = rollups.map(r => {
            let isBooker = false;
            // Flatten the groups to find the player easily
            const allPlayersInThisRollup = r.groups.flat();
            const me = allPlayersInThisRollup.find(p => 
                p.name.trim().toLowerCase() === searchName.toLowerCase()
            );
            
            if (me && me.booker) isBooker = true;

            return {
                date: r.date,
                isBooker: isBooker,
                rollupId: r._id
            };
        });

        res.json(results);
    } catch (err) {
        console.error("Deep Search Error:", err);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// 10. BOOKER UPDATES
app.post('/api/booker/:id', protect, async (req, res) => {
    try {
        await Golfer.findByIdAndUpdate(req.params.id, { $inc: { booking_count: 1 }, last_booked: new Date() });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Server running on port ${PORT}`));