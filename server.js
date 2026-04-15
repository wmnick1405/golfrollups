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
const nodemailer = require('nodemailer');

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

//
app.use(express.static(path.join(__dirname, 'public')));

// 2. THE GATEKEEPER
const protect = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ error: "Unauthorized" });
};

// 3. DATABASE CONNECTION
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        const host = mongoose.connection.host;
        console.log(`Connected to: ${host}`); // This will tell the truth!
        if (host.includes('mongodb.net')) {
            console.log("Cloud status: ONLINE (Atlas)");
        } else {
            console.log("Cloud status: OFFLINE (Local Pi)");
        }
    });

// 4. DATA SCHEMAS
// --- AUTHENTICATION SCHEMA ---

// This runs once when the server starts to "fix" old users
mongoose.connection.once('open', async () => {
    const User = mongoose.model('User');
    // Find users who don't have the passwordChangedAt field and set it to now
    await User.updateMany(
        { passwordChangedAt: { $exists: false } },
        { $set: { passwordChangedAt: new Date() } }
    );
    console.log("Verified all admin users have password age tracking.");
});

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true,
        match: [/.+\@.+\..+/, 'Please use a valid email address']
    },
    password: { type: String, required: true },
    passwordChangedAt: { type: Date, default: Date.now }, // <--- Add this
    otp: String,
    otpExpires: Date
});

// This function checks if a password meets our security requirements
function isPasswordRobust(password) {
    const regex = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{8,}$/;
    return regex.test(password);
}

// PRE-SAVE HOOK: Automatically hashes password before saving to DB
userSchema.pre('save', async function () {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        // DO NOT call next() here
    } catch (err) {
        // If there's an error, just throw it; Mongoose will catch it
        throw err;
    }
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
    // Back to a simple array of player objects per group
    groups: [[{ golfer_id: String, name: String, booker: Boolean }]]
}));

// Absence records for golfers
const Unavailable = mongoose.model('Unavailable', new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer' },
    date_from: Date,
    date_to: Date,
    indefinite: Boolean
}));

const CompetitionName = mongoose.model('CompetitionName', new mongoose.Schema({
    'comp-name': { type: String, required: true }
}), 'competition-names');

// Extra Availability for golfers (e.g. if they can play on a day they normally don't)
const ExtraAvailability = mongoose.model('ExtraAvailability', new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer', required: true },
    date: { type: Date, required: true },
    note: String
}, { collection: 'extra-availabilities' }));

const ClubCalendar = mongoose.model('ClubCalendar', new mongoose.Schema({
    uid: { type: String, unique: true },
    title: String,
    start: Date,
    end: Date,
    location: String
}, { collection: 'club-calendar' }));

// Create the transporter (The "Email Account" login)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'wmnick1405@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD // We will add this to your .env file
    }
});

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

// OTP LOGIN ROUTE
app.post('/api/auth/request-otp', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ username: email });

    if (!user) return res.status(404).json({ error: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60000); // 10 mins
    await user.save();

    await transporter.sendMail({
        from: 'wmnick1405@gmail.com',
        to: email,
        subject: 'Your Login Code',
        text: `Your code is ${otp}. It expires in 10 minutes.`
    });

    res.json({ success: true });
});

// This route now handles both password and OTP logins
app.post('/api/login', async (req, res) => {
    try {
        const { username, password, otp } = req.body;
        const user = await User.findOne({ username });

        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        // OPTION 1: User provided a password
        if (password) {
            const match = await bcrypt.compare(password, user.password);
            if (!match) return res.status(401).json({ error: "Invalid password" });
        }
        if (password) {
            const match = await bcrypt.compare(password, user.password);
            if (!match) return res.status(401).json({ error: "Invalid password" });

            // 90 Day Policy Check
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            if (user.passwordChangedAt < ninetyDaysAgo) {
                return res.status(403).json({
                    error: "Password Expired",
                    message: "Your password is older than 90 days. Please use the OTP method to log in and update your password."
                });
            }
        }
        // OPTION 2: User provided an OTP
        else if (otp) {
            if (user.otp !== otp || user.otpExpires < Date.now()) {
                return res.status(401).json({ error: "Invalid or expired code" });
            }
            // Clear OTP after successful use
            user.otp = undefined;
            user.otpExpires = undefined;
            await user.save();
        }
        else {
            return res.status(400).json({ error: "Password or OTP required" });
        }

        // Common Session Logic
        req.session.userId = user._id;
        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/admin/change-password', protect, async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        if (!isPasswordRobust(newPassword)) {
            return res.status(400).json({ 
                error: "Password too weak. Must be at least 8 characters long and include a number and a special character (!@#$%^&*)." 
            });
        }

        const user = await User.findById(req.session.userId);
        user.password = newPassword; // Bcrypt hook handles hashing
        user.passwordChangedAt = Date.now();
        await user.save();

        res.json({ success: true, message: "Password updated successfully." });
    } catch (err) {
        res.status(500).json({ error: "Failed to update password." });
    }
});

// This route allows the frontend to check if the user is currently logged in (e.g. on page refresh)
app.get('/api/check-auth', (req, res) => {
    if (req.session && req.session.userId) {
        // If the session exists and has a userId, they are logged in
        res.json({ loggedIn: true });
    } else {
        // Otherwise, they are a guest
        res.status(401).json({ loggedIn: false });
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
        const { username, password } = req.body;

        // 1. Check if the username already exists manually (just to be sure)
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: "This username is already taken." });
        }

        // 2. Attempt to save
        const newUser = new User({ username, password });
        await newUser.save();

        console.log(`[Success] New admin created: ${username}`);
        res.json({ success: true });

    } catch (err) {
        // This is the CRITICAL part: look at your Raspberry Pi terminal for this log!
        console.error("--- USER CREATION ERROR ---");
        console.error(err);

        // Return the actual technical error to the browser for debugging
        res.status(500).json({
            error: "Failed to create secure user",
            message: err.message
        });
    }
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

app.delete('/api/golfers/:id', protect, async (req, res) => {
    try {
        await Golfer.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

// Get list of all competition names for the dropdown in rollup creation
app.get('/api/competition-names', protect, async (req, res) => {
    try {
        const comps = await CompetitionName.find().sort({ 'comp-name': 1 });
        // This will now correctly return [{ 'comp-name': 'Winter League' }, ...]
        res.json(comps);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch competition names" });
    }
});

// 8. AVAILABILITY & ABSENCE ROUTES
app.get('/api/available', protect, async (req, res) => {
    try {
        const dateStr = req.query.date; // Expects "YYYY-MM-DD" from the frontend
        if (!dateStr) return res.status(400).json({ error: "Date is required" });

        // 1. NORMALIZE THE TARGET DATE
        // We create a date object and immediately strip the time to 00:00:00 UTC.
        // This makes it a "Calendar Day" rather than a specific timestamp.
        const targetDate = new Date(dateStr + "T00:00:00.000Z");

        // 2. DETERMINE THE DAY NAME (e.g., "Monday")
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayName = dayNames[targetDate.getUTCDay()];

        // 3. FETCH THE RELEVANT GOLFERS
        // Find everyone who normally plays on this day of the week
        const golfers = await Golfer.find({ play_days: dayName }).lean();

        // 4. FETCH UNAVAILABLE RECORDS
        // We look for any overlap: Absence starts on/before target date 
        // AND (ends on/after target date OR is indefinite)
        const awayRecords = await Unavailable.find({
            date_from: { $lte: targetDate },
            $or: [
                { date_to: { $gte: targetDate } },
                { indefinite: true }
            ]
        });

        // Create a simple array of String IDs for efficient matching
        const awayIds = awayRecords.map(a => a.golfer_id ? a.golfer_id.toString() : "");

        // 5. ASSEMBLE THE REPORT
        // We map through every golfer and "tag" them if they appear in the away list.
        const report = golfers.map(g => {
            const gId = g._id.toString();
            const isAway = awayIds.includes(gId);

            // Find the specific record to check for the 'indefinite' flag
            const personalRecord = awayRecords.find(a => a.golfer_id?.toString() === gId);

            return {
                ...g,
                isUnavailable: isAway,
                indefinite: personalRecord ? personalRecord.indefinite : false
            };
        });

        // Debugging logs - helpful for your terminal
        console.log(`--- Availability Check ---`);
        console.log(`Target: ${dateStr} (${dayName})`);
        console.log(`Found: ${golfers.length} total, ${awayRecords.length} away.`);

        res.json(report);

    } catch (err) {
        console.error("CRITICAL ERROR in /api/available:", err);
        res.status(500).json({ error: "Internal Server Error during availability sync" });
    }
});

app.post('/api/unavailable', protect, async (req, res) => {
    try {
        const { date_from, date_to, indefinite, golfer_id, sendEmail } = req.body;

        // 1. STRIP THE TIME (Your existing logic)
        const cleanFrom = new Date(new Date(date_from).toISOString().split('T')[0] + "T00:00:00.000Z");
        let cleanTo = null;
        if (!indefinite) {
            cleanTo = new Date(new Date(date_to).toISOString().split('T')[0] + "T00:00:00.000Z");
        }

        // 2. Save the record
        const record = new Unavailable({
            golfer_id,
            date_from: cleanFrom,
            date_to: cleanTo,
            indefinite
        });
        await record.save();

        // 3. CONDITIONAL EMAIL LOGIC
        // Only run this if sendEmail is true AND the golfer has an email
        if (sendEmail === true) {
            const golfer = await Golfer.findById(golfer_id);

            if (golfer && golfer.email) {
                const startStr = cleanFrom.toDateString();
                let dateText = (indefinite) ? `from ${startStr} (Indefinite)` :
                    (startStr === cleanTo.toDateString()) ? `for ${startStr}` :
                        `from ${startStr} to ${cleanTo.toDateString()}`;

                const mailOptions = {
                    from: 'your-email@gmail.com',
                    to: golfer.email,
                    subject: 'Unavailability Confirmation',
                    text: `Hello ${golfer.name},\n\nThis is to confirm that your rollup unavailability has been logged ${dateText}.\n\nRegards,\nGolf Rollup Admin`
                };

                transporter.sendMail(mailOptions).catch(err => console.error("Email skip/fail:", err));
            }
        }

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Failed to save record." });
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
app.post('/api/extra-availabilities', protect, async (req, res) => {
    try {
        const record = new ExtraAvailability(req.body);
        await record.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Save failed" }); }
});

// API to get extra availability for a golfer
app.get('/api/extra-availabilities/golfer/:id', protect, async (req, res) => {
    const records = await ExtraAvailability.find({ golfer_id: req.params.id }).sort({ date: 1 });
    res.json(records);
});

app.get('/api/extra-availabilities', protect, async (req, res) => {
    try {
        const { date } = req.query; // This gets the "YYYY-MM-DD" from the fetch call
        if (!date) return res.status(400).json({ error: "Date is required" });

        // Normalize the date to start of day UTC to match how you store dates
        const targetDate = new Date(date + "T00:00:00.000Z");

        // Find records for this date and 'populate' the golfer details
        // so we have the player's name and booking_exempt status
        const extras = await ExtraAvailability.find({ date: targetDate }).populate('golfer_id');

        // Map the data so it matches the format the frontend expects
        const report = extras.map(e => {
            if (!e.golfer_id) return null;
            return {
                _id: e.golfer_id._id,
                name: e.golfer_id.name,
                booking_exempt: e.golfer_id.booking_exempt,
                isExtra: true,
                isUnavailable: false // They are available by definition
            };
        }).filter(item => item !== null);

        res.json(report);
    } catch (err) {
        console.error("Error in GET /api/extra-availabilities:", err);
        res.status(500).json({ error: "Failed to fetch extra golfers" });
    }
});

// API to delete
app.delete('/api/extra-availabilities/:id', protect, async (req, res) => {
    await ExtraAvailability.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// 9. ROLLUP & PARTICIPATION REPORT ROUTES
// Check if a rollup already exists for a given date (to prevent duplicates)
app.get('/api/rollups/check', async (req, res) => {
    try {
        const { date } = req.query; // e.g. "2025-02-24"

        // Create a range for that specific day
        const startOfDay = new Date(date);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Search for any rollup that falls within that 24-hour window
        const existing = await Rollup.findOne({
            date: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });

        res.json({ exists: !!existing });
    } catch (err) {
        res.status(500).json({ error: "Database check failed" });
    }
});

app.post('/api/rollups', protect, async (req, res) => {
    try {
        const rollup = new Rollup(req.body);
        await rollup.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/rollups/find', protect, async (req, res) => {
    const queryDate = new Date(req.query.date);
    const start = new Date(queryDate).setHours(0, 0, 0, 0);
    const end = new Date(queryDate).setHours(23, 59, 59, 999);
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

app.get('/api/reports/booking-stress/:name', protect, async (req, res) => {
    try {
        const playerName = req.params.name;

        // 1. FIND ONLY THE GAMES THEY ATTENDED
        // This skips weeks they stayed home and finds their personal 'Last 10'
        const recentGames = await Rollup.find({
            groups: {
                $elemMatch: {
                    $elemMatch: { name: playerName }
                }
            }
        })
            .sort({ date: -1 }) // Get most recent first
            .limit(10)          // Stop after we find 10 matches
            .lean();

        let timesBooked = 0;
        const history = [];

        recentGames.forEach(rollup => {
            // Flatten the groups to find the player's specific status in this rollup
            const playerEntry = rollup.groups.flat().find(p => p.name === playerName);

            if (playerEntry) {
                if (playerEntry.booker) timesBooked++;

                // Keep track of the dates for the report
                history.push({
                    date: rollup.date.toDateString(),
                    wasBooker: playerEntry.booker,
                    comp: rollup.competition
                });
            }
        });

        res.json({
            name: playerName,
            gamesAnalyzed: history.length,
            timesBooked: timesBooked,
            percentage: history.length > 0 ? ((timesBooked / history.length) * 100).toFixed(1) + '%' : '0%',
            history: history // Send the dates back so we can show them the evidence
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to calculate stress levels" });
    }
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

// 11. CLUB CALENDAR SYNC ROUTES
app.get('/api/club-calendar', async (req, res) => {
    try {
        // Fetch future events only
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const events = await ClubCalendar.find({ start: { $gte: today } }).sort({ start: 1 });
        res.json(events);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

app.post('/api/club-calendar/sync', async (req, res) => {
    const ICS_URL = 'https://clubv1.blob.core.windows.net/diary-events/822/bc1d725c-ddfb-4a2d-b3bc-f1dbc6eb0021.ics';

    try {
        const events = await ical.async.fromURL(ICS_URL);
        const syncResults = [];

        for (let k in events) {
            if (events.hasOwnProperty(k)) {
                const ev = events[k];
                if (ev.type === 'VEVENT') {
                    // upsert: update if UID exists, otherwise insert
                    await ClubCalendar.findOneAndUpdate(
                        { uid: ev.uid },
                        {
                            title: ev.summary,
                            start: ev.start,
                            end: ev.end,
                            location: ev.location || ''
                        },
                        { upsert: true }
                    );
                }
            }
        }
        res.json({ success: true, message: "Calendar synced successfully" });
    } catch (err) {
        console.error("ICS Sync Error:", err);
        res.status(500).json({ error: "Failed to fetch or parse ICS file" });
    }
});

app.delete('/api/club-calendar/', async (req, res) => {
    try {
        // WARNING: This will delete ALL events in the calendar collection!
        await ClubCalendar.deleteMany({});
        res.json({ success: true, message: "Events deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Could not delete events" });
    }
});

// 12. ROLLUP EMAIL DATA and ADDRESSROUTE

app.get('/api/email-data', protect, async (req, res) => {
    try {
        const { start, end, absence } = req.query;

        // 1. Fetch Rollup Sessions (Planner Data)
        // We look for any sessions between the two selected dates
        // Note: Replace 'Session' with whatever model stores your 24-session data
        const sessions = await Session.find({
            date: { $gte: new Date(start), $lte: new Date(end) }
        }).sort({ date: 1 });

        // 2. Fetch Absences for the Report
        // We want anyone whose absence overlaps with or starts after the 'absence' date
        const absences = await unavailables.find({
            $or: [
                { date_from: { $gte: new Date(absence) } },
                { indefinite: true }
            ]
        }).populate('golfer_id');

        // 3. Format the data for the frontend
        const formattedSessions = sessions.map(s => ({
            date: new Date(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
            time: s.time || "09:00",
            count: s.golfers ? s.golfers.length : 0
        }));

        const formattedAbsences = absences.map(a => {
            const name = a.golfer_id ? a.golfer_id.name : "Unknown";
            let status = "";
            if (a.indefinite) {
                status = "Away Indefinitely";
            } else {
                const from = new Date(a.date_from).toLocaleDateString('en-GB');
                const to = new Date(a.date_to).toLocaleDateString('en-GB');
                status = `Away ${from} to ${to}`;
            }
            return { name, status };
        });

        res.json({
            sessions: formattedSessions,
            absences: formattedAbsences
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch email data" });
    }
});

app.get('/api/golfer-emails', protect, async (req, res) => {
    try {
        // Fetch only the email field from all golfers
        const golfers = await Golfer.find({}, 'email');

        // Filter out any golfers who don't have an email on file
        const emailList = golfers
            .map(g => g.email)
            .filter(email => email && email.trim() !== "");

        res.json(emailList);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch recipient list" });
    }
});

//END OF ROUTES

// START THE SERVER

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Server running on port ${PORT}`));