const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./user'); 
const path = require('path');
const session = require('express-session');
const fs = require('fs');

const app = express();

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
.then(()=>console.log("Connected to MongoDB"))
.catch(err=>console.error("MongoDB connection error:",err));

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
    groups: [[{ golfer_id: String, name: String, booker: Boolean }]]
}));

// 5. AUTHENTICATION ROUTES
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
        const golfer = new Golfer(req.body);
        await golfer.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
        const record = new Unavailable(req.body);
        await record.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Save failed" }); }
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
        const history = await Rollup.find({}).lean();
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

// 10. BOOKER UPDATES
app.post('/api/booker/:id', protect, async (req, res) => {
    try {
        await Golfer.findByIdAndUpdate(req.params.id, { $inc: { booking_count: 1 }, last_booked: new Date() });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(3000, () => console.log(`Server running on port 3000`));