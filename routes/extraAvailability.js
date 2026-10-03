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

// GET all extra availabilities (for reports & email generator)
router.get('/all', protect, async (req, res) => {
    try {
        const extras = await ExtraAvailability.find({}).populate('golfer_id');
        res.json(extras);
    } catch (err) {
        console.error("Error in GET /api/extra-availabilities/all:", err);
        res.status(500).json({ error: "Failed to fetch extra availabilities" });
    }
});

// GET extra availability for a specific date
router.get('/', protect, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: "Date parameter is required" });

        const targetDate = new Date(date + "T00:00:00.000Z");
        const extras = await ExtraAvailability.find({ date: targetDate }).populate('golfer_id');

        const report = extras.map(e => {
            if (!e.golfer_id) return null;
            return {
                _id: e.golfer_id._id,
                name: e.golfer_id.name,
                booking_exempt: e.golfer_id.booking_exempt,
                isExtra: true,
                isUnavailable: false
            };
        }).filter(item => item !== null);

        res.json(report);
    } catch (err) {
        console.error("Error in GET /api/extra-availabilities:", err);
        res.status(500).json({ error: "Failed to fetch extra golfers" });
    }
});

router.delete('/:id', protect, async (req, res) => {
    await ExtraAvailability.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

module.exports = router;