const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const ScoreRecord = require('../models/ScoreRecord');
const Golfer = require('../models/Golfer');
const { protect } = require('../middleware/auth');

// Add a logger right after defining router
router.use((req, res, next) => {
    console.log(`[SCORE-RECORDS ROUTER] ${req.method} request received for path: "${req.path}"`);
    next();
});

// 1. GET ALL SCORE RECORDS
router.get('/', protect, async (req, res) => {
    try {
        const records = await ScoreRecord.find().sort({ date: -1 });
        res.json(records);
    } catch (err) {
        console.error("Error fetching score records:", err);
        res.status(500).json({ error: "Failed to fetch score records" });
    }
});

// 2. GET DROPDOWN SETUP DATA
router.get('/setup-data', protect, async (req, res) => {
    try {
        const db = mongoose.connection.db;

        // Fetch competition names directly from competition-names collection
        const compsRaw = await db.collection('competition-names').find({}).sort({ 'comp-name': 1 }).toArray();
        const competitions = compsRaw.map(c => c['comp-name'] || c.name || '').filter(Boolean);

        // Fetch active golfers
        const golfers = await Golfer.find({ active: { $ne: false } }, '_id name').sort({ name: 1 }).lean();

        res.json({ competitions, golfers });
    } catch (err) {
        console.error("Error loading setup data:", err);
        res.status(500).json({ error: "Failed to load setup data" });
    }
});

// 3. POST CREATE NEW SCORE RECORD
router.post('/', protect, async (req, res) => {
    try {
        const { date, competition_name, score_type, player_count, players, overall_score } = req.body;

        if (!date || !competition_name || !score_type || overall_score === undefined || !players || players.length === 0) {
            return res.status(400).json({ error: "All required fields must be filled." });
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
        res.status(201).json({ success: true, message: "Score record created successfully", record: scoreRecord });
    } catch (err) {
        console.error("Save score record error:", err);
        res.status(400).json({ error: err.message || "Failed to save score record" });
    }
});

// 4. PUT UPDATE EXISTING RECORD BY ID
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

        if (!updatedRecord) return res.status(404).json({ error: "Record not found" });

        res.json({ success: true, message: "Record updated successfully", record: updatedRecord });
    } catch (err) {
        console.error("Update error:", err);
        res.status(400).json({ error: err.message || "Failed to update record" });
    }
});

// 5. DELETE RECORD BY ID
router.delete('/:id', protect, async (req, res) => {
    console.log(`[DELETE HANDLER HIT] req.params.id = "${req.params.id}"`);
    
    try {
        const record = await ScoreRecord.findById(req.params.id);
        console.log(`[DB SEARCH RESULT] Document found:`, record);

        if (!record) {
            return res.status(404).json({ error: "Record not found in database." });
        }

        await ScoreRecord.findByIdAndDelete(req.params.id);
        console.log(`[DELETE SUCCESS] Successfully deleted ID: ${req.params.id}`);
        
        res.json({ success: true, message: "Record deleted successfully" });
    } catch (err) {
        console.error("[DELETE ERROR]:", err);
        res.status(500).json({ error: err.message });
    }
});

// 6. GET SINGLE RECORD BY ID (Placed at the bottom to avoid routing conflicts)
router.get('/:id', protect, async (req, res) => {
    try {
        const record = await ScoreRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ error: "Score record not found" });
        res.json(record);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch record" });
    }
});

module.exports = router;