const express = require('express');
const router = express.Router();
const Golfer = require('../models/Golfer');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
    try {
        const golfers = await Golfer.find({}).sort({ name: 1 });
        res.json(golfers);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch golfers" });
    }
});

router.post('/', protect, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: "Golfer name is required." });
        }
        const cleanName = name.trim();
        const existing = await Golfer.findOne({
            name: { $regex: new RegExp(`^${cleanName}$`, 'i') }
        });
        if (existing) {
            return res.status(400).json({ error: `The golfer "${cleanName}" already exists in the database.` });
        }
        const golfer = new Golfer(req.body);
        await golfer.save();
        res.json({ success: true });
    } catch (err) {
        console.error("Add Golfer Error:", err);
        res.status(500).json({ error: "Server error while adding golfer." });
    }
});

router.put('/:id', protect, async (req, res) => {
    try {
        await Golfer.findByIdAndUpdate(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

router.delete('/:id', protect, async (req, res) => {
    try {
        await Golfer.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// Booker update
router.post('/booker/:id', protect, async (req, res) => {
    try {
        await Golfer.findByIdAndUpdate(req.params.id, { $inc: { booking_count: 1 }, last_booked: new Date() });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

module.exports = router;