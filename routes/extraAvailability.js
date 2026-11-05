const express = require('express');
const router = express.Router();
const ExtraAvailability = require('../models/ExtraAvailability');
const Golfer = require('../models/Golfer');
const transporter = require('../utils/mailer');
const { protect } = require('../middleware/auth');

router.post('/send-summary', protect, async (req, res) => {
    try {
        const { golfer_id, dates } = req.body;
        const golfer = await Golfer.findById(golfer_id);

        if (!golfer || !golfer.email) {
            return res.status(400).json({ error: "Golfer has no email on file." });
        }

        const dateList = dates.map(d => `• ${d}`).join('\n');
        const mailOptions = {
            from: 'wmnick1405@gmail.com',
            to: golfer.email,
            subject: 'Rollup Extra Play Day Confirmation',
            text: `Hello ${golfer.name},\n\nThis is to confirm that extra play day(s) have been recorded for you on the following dates:\n\n${dateList}\n\nRegards,\nNick Osborne`
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (err) {
        console.error("Extra Play Email Error:", err);
        res.status(500).json({ error: "Failed to send extra play email." });
    }
});

router.post('/', protect, async (req, res) => {
    try {
        const record = new ExtraAvailability(req.body);
        await record.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Save failed" });
    }
});

router.get('/golfer/:id', protect, async (req, res) => {
    const records = await ExtraAvailability.find({ golfer_id: req.params.id }).sort({ date: 1 });
    res.json(records);
});

// GET /api/extra-availabilities
router.get('/', protect, async (req, res) => {
    try {
        let query = {};

        // If a specific date is passed: ?date=YYYY-MM-DD
        if (req.query.date) {
            const targetDate = new Date(req.query.date + "T00:00:00.000Z");
            const nextDay = new Date(targetDate);
            nextDay.setDate(nextDay.getDate() + 1);

            query.date = { $gte: targetDate, $lt: nextDay };
        } 
        // Optional: If a start date is passed: ?startDate=YYYY-MM-DD
        else if (req.query.startDate) {
            query.date = { $gte: new Date(req.query.startDate + "T00:00:00.000Z") };
        }

        // Fetch records based on filter (or all records if no query param supplied)
        const records = await ExtraAvailability.find(query).sort({ date: 1 }).lean();
        res.json(records);

    } catch (err) {
        console.error("Error in GET /api/extra-availabilities:", err);
        res.status(500).json({ error: "Failed to fetch extra availabilities" });
    }
});

router.delete('/:id', protect, async (req, res) => {
    await ExtraAvailability.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

module.exports = router;