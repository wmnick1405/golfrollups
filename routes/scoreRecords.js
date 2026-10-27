const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models & Middleware
const ScoreRecord = require('../models/ScoreRecord');
const Golfer = require('../models/Golfer');
const { protect } = require('../middleware/auth');

// 1. GET all score records
router.get('/', protect, async (req, res) => {
    try {
        const records = await ScoreRecord.find().sort({ date: -1 });
        res.json(records);
    } catch (err) {
        console.error("Fetch score records error:", err);
        res.status(500).json({ error: "Failed to fetch score records" });
    }
});

// 2. GET setup data for dropdowns
router.get('/setup-data', protect, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const compsRaw = await db.collection('competition-names').find({}).sort({ 'comp-name': 1 }).toArray();
        const competitions = compsRaw.map(c => c['comp-name'] || c.name || '').filter(Boolean);

        const golfers = await Golfer.find({ active: { $ne: false } }, '_id name').sort({ name: 1 }).lean();

        res.json({ competitions, golfers });
    } catch (err) {
        console.error("setup-data error:", err);
        res.status(500).json({ error: "Failed to load setup data" });
    }
});

// 3. POST save score record
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
        res.status(201).json({ success: true, message: "Overall score record saved successfully", record: scoreRecord });
    } catch (err) {
        console.error("Save score record error:", err);
        res.status(400).json({ error: err.message || "Failed to save score record" });
    }
});

// 4. PUT update score record by ID
router.put('/:id', protect, async (req, res) => {
    try {
        const { date, competition_name, score_type, player_count, players, overall_score } = req.body;

        const updatedRecord = await ScoreRecord.findByIdAndUpdate(
            req.params.id,
            {
                date: new Date(date),
                competition_name,
                score_type,
                player_count: Number(player_count),
                players,
                overall_score: Number(overall_score)
            },
            { returnDocument: 'after', runValidators: true }
        );

        if (!updatedRecord) {
            return res.status(404).json({ error: "Record not found" });
        }

        res.json({ success: true, message: "Record updated successfully", record: updatedRecord });
    } catch (err) {
        console.error("Update Score Record Error:", err);
        res.status(400).json({ error: err.message || "Failed to update record" });
    }
});

// 5. DELETE score record by ID
router.delete('/:id', protect, async (req, res) => {
    try {
        console.log(`[DELETE ROUTE HIT] Attempting to delete ID: ${req.params.id}`);
        const deletedRecord = await ScoreRecord.findByIdAndDelete(req.params.id);
        
        if (!deletedRecord) {
            return res.status(404).json({ error: "Record not found in database" });
        }
        res.json({ success: true, message: "Record deleted successfully" });
    } catch (err) {
        console.error("Delete Score Record Error:", err);
        res.status(500).json({ error: "Failed to delete record" });
    }
});

// 6. GET single score record by ID
router.get('/:id', protect, async (req, res) => {
    try {
        const record = await ScoreRecord.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ error: "Score record not found" });
        }
        res.json(record);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch record" });
    }
});

module.exports = router;