const express = require('express');
const router = express.Router();
const ical = require('node-ical');
const ClubCalendar = require('../models/ClubCalendar');
const { protect } = require('../middleware/auth');

router.get('/', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const events = await ClubCalendar.find({ start: { $gte: today } }).sort({ start: 1 });
        res.json(events);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

router.get('/check-date', protect, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: "Date parameter is required" });

        const startOfDay = new Date(date + "T00:00:00.000Z");
        const endOfDay = new Date(date + "T23:59:59.999Z");

        const events = await ClubCalendar.find({
            start: { $lte: endOfDay },
            end: { $gte: startOfDay }
        });

        res.json(events);
    } catch (err) {
        console.error("Calendar check failed:", err);
        res.status(500).json({ error: "Failed to check calendar" });
    }
});

router.post('/sync', async (req, res) => {
    const ICS_URL = 'https://clubv1.blob.core.windows.net/diary-events/822/bc1d725c-ddfb-4a2d-b3bc-f1dbc6eb0021.ics';

    try {
        const events = await ical.async.fromURL(ICS_URL);

        for (let k in events) {
            if (events.hasOwnProperty(k)) {
                const ev = events[k];
                if (ev.type === 'VEVENT') {
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

router.delete('/', async (req, res) => {
    try {
        await ClubCalendar.deleteMany({});
        res.json({ success: true, message: "Events deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Could not delete events" });
    }
});

module.exports = router;