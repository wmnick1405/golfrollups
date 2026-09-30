const express = require('express');
const router = express.Router();
const CompetitionTemplate = require('../models/CompetitionTemplate');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
    try {
        const templates = await CompetitionTemplate.find().sort({ name: 1 });
        res.json(templates);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch templates" });
    }
});

router.post('/', protect, async (req, res) => {
    try {
        const template = new CompetitionTemplate(req.body);
        await template.save();
        res.status(201).json({ success: true, template });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:id', protect, async (req, res) => {
    try {
        await CompetitionTemplate.findByIdAndUpdate(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', protect, async (req, res) => {
    try {
        await CompetitionTemplate.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete template" });
    }
});

module.exports = router;