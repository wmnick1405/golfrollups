require('dotenv').config();

if (!process.env.SESSION_SECRET) {
    console.error("FATAL ERROR: SESSION_SECRET is not defined in .env file.");
    process.exit(1);
}

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const morgan = require('morgan');
const cron = require('node-cron');

// Models
const User = require('./models/User');
const Golfer = require('./models/Golfer');
const Rollup = require('./models/Rollup');

// Utilities
const transporter = require('./utils/mailer');

const app = express();

// 1. MIDDLEWARE SETUP
app.use(morgan('tiny'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    name: 'golf_sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

// 2. DATABASE CONNECTION & INITIALIZATION
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        const host = mongoose.connection.host;
        console.log(`Connected to: ${host}`); 
        if (host.includes('mongodb.net')) {
            console.log("Cloud status: ONLINE (Atlas)");
        } else {
            console.log("Cloud status: OFFLINE (Local Pi)");
        }
    });

mongoose.connection.once('open', async () => {
    await User.updateMany(
        { passwordChangedAt: { $exists: false } },
        { $set: { passwordChangedAt: new Date() } }
    );
    console.log("Verified all admin users have password age tracking.");
});

// 3. MOUNT ROUTE MODULES
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/auth')); // Maintains compatibility with /login & /api/login
app.use('/api/golfers', require('./routes/golfers'));
app.use('/api/tee-times', require('./routes/teeTimes'));
app.use('/api/competition-templates', require('./routes/competitionTemplates'));
app.use('/api', require('./routes/availability'));
app.use('/api/extra-availabilities', require('./routes/extraAvailability'));
app.use('/api/rollup-notes', require('./routes/rollupNotes'));
app.use('/api/rollups', require('./routes/rollups'));
app.use('/api', require('./routes/rollups')); // Serves /api/reports/...
app.use('/api/club-calendar', require('./routes/clubCalendar'));
app.use('/api', require('./routes/email'));
// app.use('/api/scorecards', require('./routes/scorecards'));

// 4. AUTOMATED 24-HOUR BOOKING REMINDER CRON DAEMON
cron.schedule('0 8 * * *', async () => {
    console.log('\n==================================================================');
    console.log('[LIVE SCAN] Triggering daily 8am booking sheet checklist scan...');
    console.log(`Current Run Time: ${new Date().toLocaleString('en-GB')}`);
    console.log('==================================================================');

    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 7);

        const startOfTargetDay = new Date(targetDate).setHours(0, 0, 0, 0);
        const endOfTargetDay = new Date(targetDate).setHours(23, 59, 59, 999);

        const targetDateObject = new Date(startOfTargetDay);
        console.log(`[Scheduler] Searching for rollups on target date: ${targetDateObject.toDateString()}`);

        const targetRollup = await Rollup.findOne({
            date: { $gte: startOfTargetDay,$lte: endOfTargetDay }
        }).lean();

        if (!targetRollup) {
            console.log(`[Scheduler] Result: No rollups found scheduled for 7 days out. Test complete.`);
            console.log('==================================================================\n');
            return;
        }

        const compName = targetRollup.competition || "Social";
        const dateString = targetDateObject.toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

        console.log(`[Scheduler] Found Rollup! Competition: "${compName}" | Total Groups: ${targetRollup.groups.length}`);

        for (let i = 0; i < targetRollup.groups.length; i++) {
            const group = targetRollup.groups[i];
            if (group.length === 0) continue;

            const bookerProfile = group.find(p => p.booker === true) || group[0];
            if (!bookerProfile || !bookerProfile.golfer_id) continue;

            const golferRecord = await Golfer.findById(bookerProfile.golfer_id).lean();
            if (!golferRecord) continue;

            const lineupNames = group.map(p => p.name).join(', ');

            if (!golferRecord.email || golferRecord.reminders_opt_in !== true) continue;

            const reminderMailOptions = {
                from: 'wmnick1405@gmail.com',
                to: golferRecord.email,
                subject: `🏌️ Golf Roll up Booking Reminder: Group ${i + 1}`,
                text: `Hello ${golferRecord.name},\n\n` +
                      `You are designated as the booker for Group ${i + 1} on the upcoming Rollup sheet.\n\n` +
                      `• Match Date: ${dateString}\n` +
                      `• Play Type / Competition: ${compName}\n` +
                      `• Your Assigned Group Lineup: ${lineupNames}\n\n` +
                      `This is a friendly reminder that you are scheduled to carry out the booking for this group tomorrow morning.\n\n` +
                      `Regards,\nNick Osborne\n\n[This is an automated reminder. Please do not reply to this email.]`
            };

            try {
                await transporter.sendMail(reminderMailOptions);
                console.log(`    🚀 [LIVE DISPATCH] Email successfully sent to ${golferRecord.email}`);
            } catch (mailError) {
                console.error(`    ❌ [MAIL ERROR] Failed to send email to ${golferRecord.email}:`, mailError);
            }
        }

        console.log('\n==================================================================');
        console.log('[LIVE SCAN] Log analysis completed successfully.');
        console.log('==================================================================\n');

    } catch (daemonErr) {
        console.error("\n[CRITICAL ERROR] Automated Reminder Scan failure occurred:", daemonErr);
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Server running on port ${PORT}`));