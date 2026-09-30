const express = require('express');
const router = express.Router();
const Golfer = require('../models/Golfer');
const Unavailable = require('../models/Unavailable');
const transporter = require('../utils/mailer');
const { protect } = require('../middleware/auth');

router.get('/available', protect, async (req, res) => {
    try {
        const dateStr = req.query.date;
        if (!dateStr) return res.status(400).json({ error: "Date is required" });

        const targetDate = new Date(dateStr + "T00:00:00.000Z");
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayName = dayNames[targetDate.getUTCDay()];

        const golfers = await Golfer.find({ play_days: dayName }).lean();
        const awayRecords = await Unavailable.find({
            date_from: { $lte: targetDate },$or: [
                { date_to: { $gte: targetDate } },
                { indefinite: true }
            ]
        });

        const awayIds = awayRecords.map(a => a.golfer_id ? a.golfer_id.toString() : "");

        const report = golfers.map(g => {
            const gId = g._id.toString();
            const isAway = awayIds.includes(gId);
            const personalRecord = awayRecords.find(a => a.golfer_id?.toString() === gId);

            return {
                ...g,
                isUnavailable: isAway,
                indefinite: personalRecord ? personalRecord.indefinite : false
            };
        });

        res.json(report);
    } catch (err) {
        console.error("CRITICAL ERROR in /api/available:", err);
        res.status(500).json({ error: "Internal Server Error during availability sync" });
    }
});

router.post('/unavailable', protect, async (req, res) => {
    try {
        const { date_from, date_to, indefinite, golfer_id, sendEmail } = req.body;
        const cleanFrom = new Date(new Date(date_from).toISOString().split('T')[0] + "T00:00:00.000Z");
        let cleanTo = null;
        if (!indefinite) {
            cleanTo = new Date(new Date(date_to).toISOString().split('T')[0] + "T00:00:00.000Z");
        }

        const record = new Unavailable({
            golfer_id,
            date_from: cleanFrom,
            date_to: cleanTo,
            indefinite
        });
        await record.save();

        if (sendEmail === true) {
            const golfer = await Golfer.findById(golfer_id);
            const adminMail = process.env.ADMIN_MAIL;

            if (golfer && golfer.email) {
                const startStr = cleanFrom.toDateString();
                let dateText = (indefinite) ? `from ${startStr} (Indefinite)` :
                    (startStr === cleanTo.toDateString()) ? `for ${startStr}` :
                        `from ${startStr} to ${cleanTo.toDateString()}`;

                const mailOptions = {
                    from: 'wmnick1405@gmail.com',
                    to: golfer.email,
                    subject: 'Unavailability Confirmation',
                    text: `Hello ${golfer.name},\n\nThis is to confirm that your rollup unavailability has been logged ${dateText}.\n\nRegards,\n${adminMail}`
                };

                transporter.sendMail(mailOptions).catch(err => console.error("Email skip/fail:", err));
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to save record." });
    }
});

router.get('/unavailable/all', protect, async (req, res) => {
    try {
        const list = await Unavailable.find({}).populate('golfer_id').sort({ date_from: -1 });
        res.json(list.filter(item => item.golfer_id));
    } catch (err) {
        res.status(500).json({ error: "Report data failed" });
    }
});

router.get('/unavailable/golfer/:id', protect, async (req, res) => {
    const records = await Unavailable.find({ golfer_id: req.params.id }).sort({ date_from: 1 });
    res.json(records);
});

router.get('/unavailable/indefinite', protect, async (req, res) => {
    const list = await Unavailable.find({ indefinite: true }).populate('golfer_id');
    res.json(list.filter(i => i.golfer_id));
});

router.delete('/unavailable/:id', protect, async (req, res) => {
    try {
        await Unavailable.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

router.post('/unavailable/send-summary', protect, async (req, res) => {
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
            subject: 'Rollup Absence Confirmation',
            text: `Hello ${golfer.name},\n\nThis is to confirm your absences have been recorded for the following dates:\n\n${dateList}\n\nRegards,\nNick Osborne`
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to send summary email." });
    }
});

module.exports = router;