const express = require('express');
const router = express.Router();
const Golfer = require('../models/Golfer');
const Unavailable = require('../models/Unavailable');
const { protect } = require('../middleware/auth');

router.get('/email-data', protect, async (req, res) => {
    try {
        const { start, end, absence } = req.query;

        const absences = await Unavailable.find({
            $or: [
                { date_from: { $gte: new Date(absence) } },
                { indefinite: true }
            ]
        }).populate('golfer_id');

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
            sessions: [],
            absences: formattedAbsences
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch email data" });
    }
});

router.get('/golfer-emails', protect, async (req, res) => {
    try {
        const golfers = await Golfer.find({ active: { $ne: false } }, 'email');
        const emailList = golfers
            .map(g => g.email)
            .filter(email => email && email.trim() !== "");

        res.json(emailList);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch recipient list" });
    }
});

module.exports = router;