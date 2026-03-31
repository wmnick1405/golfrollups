const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./user');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const morgan= require('morgan');

const app = express();

// LOGGING MIDDLEWARE (Logs every request to the console in a simple format)
app.use(morgan('tiny')); 

// 1. MIDDLEWARE SETUP
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'a-very-secret-key-for-golfchurchill&blakedown',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

/**
 * SECTION 2: THE GATEKEEPER
 * Checks if the user is logged in before allowing access to data.
 */
const protect = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ error: "Unauthorized" });
};

// 3. DATABASE CONNECTION
mongoose.connect('mongodb://localhost:27017/rollupsdb')
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));

// 4. DATA SCHEMAS (The shape of your data)
const Golfer = mongoose.model('Golfer', new mongoose.Schema({
    name: { type: String, required: true },
    tel: String,
    email: String,
    play_days: [String],
    booking_count: { type: Number, default: 0 },
    last_booked: { type: Date, default: new Date("2000-01-01") },
    booking_exempt: { type: Boolean, default: false }
}));

const Unavailable = mongoose.model('Unavailable', new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer' },
    date_from: Date,
    date_to: Date,
    indefinite: Boolean
}));

const Rollup = mongoose.model('Rollup', new mongoose.Schema({
    date: { type: Date, required: true },
    competition: { type: String, default: "Social" },
    groups: [[{ golfer_id: String, name: String, booker: Boolean }]]
}));

const extraAvailabilitySchema = new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer', required: true },
    date: { type: Date, required: true },
    note: String
});
const ExtraAvailability = mongoose.model('ExtraAvailability', extraAvailabilitySchema);


// 5. AUTHENTICATION ROUTES
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id;
            // Force the session to save before sending the response
            req.session.save((err) => {
                if (err) return res.status(500).json({ error: "Session save failed" });
                res.json({ success: true, message: "Logged in" });
            });
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

// 6. ADMIN & BACKUP ROUTES
app.get('/api/admin/backup-status', protect, async (req, res) => {
    const backupDir = '/mnt/golf_backups';
    try {
        if (!fs.existsSync(backupDir)) return res.json({ lastBackup: "Never (Folder missing)" });
        const folders = fs.readdirSync(backupDir);
        if (folders.length === 0) return res.json({ lastBackup: "No backups found" });
        const latest = folders.sort().reverse()[0];
        res.json({ lastBackup: latest });
    } catch (err) {
        res.status(500).json({ error: "Could not read backup status" });
    }
});

// Admin route to create new users (for testing/demo purposes)
app.post('/api/admin/create-user', protect, async (req, res) => {
    try {
        const newUser = new User(req.body);
        await newUser.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
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

app.delete('/api/golfers/:id', protect, async (req, res) => {
    try {
        await Golfer.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

// 8. AVAILABILITY & ABSENCE ROUTES
app.get('/api/available', protect, async (req, res) => {
    try {
        const queryDate = new Date(req.query.date);
        const dayName = queryDate.toLocaleDateString('en-GB', { weekday: 'long' });

        // 1. Get ALL golfers to start the filtering process
        const allGolfers = await Golfer.find({});

        // 2. Get all Unavailability records that cover this date
        const unavailableRecords = await Unavailable.find({
            $and: [
                { date_from: { $lte: queryDate } },
                {
                    $or: [
                        { date_to: { $gte: queryDate } },
                        { indefinite: true }
                    ]
                }
            ]
        });
        const unavailableIds = unavailableRecords.map(r => r.golfer_id.toString());

        // 3. Get all Extra Availability records for exactly this date
        // We set start/end of day to catch the date correctly regardless of timestamps
        const startOfDay = new Date(queryDate).setHours(0, 0, 0, 0);
        const endOfDay = new Date(queryDate).setHours(23, 59, 59, 999);

        const extraRecords = await ExtraAvailability.find({
            date: { $gte: startOfDay, $lte: endOfDay }
        });
        const extraIds = extraRecords.map(r => r.golfer_id.toString());

        // 4. THE MASTER FILTER
        const availableGolfers = allGolfers.filter(golfer => {
            const idStr = golfer._id.toString();

            // RULE A: If they are explicitly marked as UNAVAILABLE today, they are out.
            if (unavailableIds.includes(idStr)) return false;

            // RULE B: If they have an EXTRA DAY record for today, they are in.
            if (extraIds.includes(idStr)) return true;

            // RULE C: If it's their NORMAL play day, they are in.
            if (golfer.play_days && golfer.play_days.includes(dayName)) return true;

            // Otherwise, they aren't playing today.
            return false;
        });

        res.json(availableGolfers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

// API to save extra availability
app.post('/api/extra-availability', protect, async (req, res) => {
    try {
        const record = new ExtraAvailability(req.body);
        await record.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Save failed" }); }
});

// API to get extra availability for a golfer
app.get('/api/extra-availability/golfer/:id', protect, async (req, res) => {
    const records = await ExtraAvailability.find({ golfer_id: req.params.id }).sort({ date: 1 });
    res.json(records);
});

// API to delete
app.delete('/api/extra-availability/:id', protect, async (req, res) => {
    await ExtraAvailability.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// 9. ROLLUP & PARTICIPATION REPORT ROUTES
// POST a new rollup (from the dashboard after the game)  
app.post('/api/rollups', protect, async (req, res) => {
    try {
        const rollup = new Rollup(req.body);
        await rollup.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET today's rollup (for main dashboard)
app.get('/api/rollups/find', protect, async (req, res) => {
    const queryDate = new Date(req.query.date);
    const start = new Date(queryDate).setHours(0, 0, 0, 0);
    const end = new Date(queryDate).setHours(23, 59, 59, 999);
    const rollup = await Rollup.findOne({ date: { $gte: start, $lte: end } });
    if (!rollup) return res.status(404).json({ message: "Not found" });
    res.json(rollup);
});

// GET all rollups (for admin/history view)
app.get('/api/rollups', protect, async (req, res) => {
    const rollups = await Rollup.find().sort({ date: -1 });
    res.json(rollups);
});

// GET a specific rollup by ID
app.get('/api/rollups/:id', protect, async (req, res) => {
    try {
        const rollup = await Rollup.findById(req.params.id);
        res.json(rollup);
    } catch (err) { res.status(404).json({ error: "Not found" }); }
});

// DELETE a specific rollup by ID
app.delete('/api/rollups/:id', async (req, res) => {
    try {
        await Rollup.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Rollup deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Could not delete rollup" });
    }
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

/**
 * HOME ROUTE
 * This ensures that when you click 'Home', the server checks your session
 * and sends you to index.html if you are logged in.
 */
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        // If logged in, send the actual dashboard/home page
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        // If NOT logged in, send them to the login page
        res.redirect('/index.html');
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(3000, () => console.log(`Server running on port 3000`));