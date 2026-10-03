const express = require('express');
const router = express.Router();
const CompetitionName = require('../models/Competitions'); // Fixed model import
const { protect } = require('../middleware/auth');

// 1. GET all competition names
// Route is relative because server.js mounts this router at '/api/competition-names'
router.get('/', protect, async (req, res) => {
    try {
        const comps = await CompetitionName.find().sort({ 'comp-name': 1 });
        res.json(comps);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch competition names" });
    }
});

// 2. POST (Create new competition name)
router.post('/', protect, async (req, res) => {
    try {
        const newComp = new CompetitionName(req.body);
        await newComp.save();
        res.status(201).json(newComp);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 3. PUT (Update existing competition name)
router.put('/:id', protect, async (req, res) => {
    try {
        const updated = await CompetitionName.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: "Competition not found" });
        res.json({ success: true, updated });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 4. DELETE (Remove competition name)
router.delete('/:id', protect, async (req, res) => {
    try {
        const deleted = await CompetitionName.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Competition not found" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete competition name" });
    }
});

module.exports = router;