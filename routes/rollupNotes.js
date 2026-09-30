const express = require('express');
const router = express.Router();
const RollupNote = require('../models/RollupNote');
const { protect } = require('../middleware/auth');

router.post('/', protect, async (req, res) => {
    try {
        const { requested_by, date_from, date_to, content } = req.body;
        if (!requested_by || !date_from || !date_to || !content) {
            return res.status(400).json({ error: "All fields are required." });
        }

        const cleanFrom = new Date(date_from + "T00:00:00.000Z");
        const cleanTo = new Date(date_to + "T23:59:59.999Z");

        const note = new RollupNote({
            requested_by: requested_by.trim(),
            date_from: cleanFrom,
            date_to: cleanTo,
            content: content.trim()
        });

        await note.save();
        res.json({ success: true, note });
    } catch (err) {
        console.error("Error creating note:", err);
        res.status(500).json({ error: "Failed to save note." });
    }
});

router.get('/check-date', protect, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: "Date is required." });

        const targetDate = new Date(date + "T00:00:00.000Z");
        const notes = await RollupNote.find({
            date_from: { $lte: targetDate },
            date_to: { $gte: targetDate }
        }).sort({ created_at: -1 });

        res.json(notes);
    } catch (err) {
        console.error("Error fetching notes for date:", err);
        res.status(500).json({ error: "Failed to fetch notes." });
    }
});

router.get('/', protect, async (req, res) => {
    try {
        const notes = await RollupNote.find().sort({ date_from: -1 });
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch notes." });
    }
});

router.delete('/:id', protect, async (req, res) => {
    try {
        await RollupNote.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete note." });
    }
});

router.put('/:id', protect, async (req, res) => {
    try {
        const { requested_by, date_from, date_to, content } = req.body;
        const cleanFrom = new Date(date_from + "T00:00:00.000Z");
        const cleanTo = new Date(date_to + "T23:59:59.999Z");

        await RollupNote.findByIdAndUpdate(req.params.id, {
            requested_by: requested_by.trim(),
            date_from: cleanFrom,
            date_to: cleanTo,
            content: content.trim()
        });

        res.json({ success: true });
    } catch (err) {
        console.error("Error updating note:", err);
        res.status(500).json({ error: "Failed to update note." });
    }
});

module.exports = router;