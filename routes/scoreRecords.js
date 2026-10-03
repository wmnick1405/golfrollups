const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ScoreRecord = require('../models/ScoreRecord');
const Golfer = require('../models/Golfer');
const { protect } = require('../middleware/auth');

// GET helper data for dropdowns (Competition Names & Active Golfers)
router.get('/setup-data', protect, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        
        // Fetch competition names directly from competition-names collection
        const competitionsRaw = await db.collection('competition-names').find({}).sort({ 'comp-name': 1 }).toArray();
        const competitions = competitionsRaw.map(c => c['comp-name']).filter(Boolean);

        // Fetch active golfers
        const golfers = await Golfer.find({ active: true }, '_id name').sort({ name: 1 });

        res.json({ competitions, golfers });
    } catch (err) {
        console.error("Setup data fetch error:", err);
        res.status(500).json({ error: "Failed to fetch setup data" });
    }
});

// POST save overall competition score record
router.post('/', protect, async (req, res) => {
    try {
        const { date, competition_name, score_type, player_count, players, overall_score } = req.body;

        if (!date || !competition_name || !score_type || overall_score === undefined || !players || players.length === 0) {
            return res.status(400).json({ error: "All fields including overall score are required." });
        }

        const scoreRecord = new ScoreRecord({
            date: new Date(date),
            competition_name,
            score_type,
            player_count: Number(player_count),
            players,
            overall_score: Number(overall_score)
        });

        await scoreRecord.save();
        res.status(201).json({ success: true, message: "Overall score record saved successfully" });
    } catch (err) {
        console.error("Save score record error:", err);
        res.status(400).json({ error: err.message || "Failed to save score record" });
    }
});

module.exports = router;