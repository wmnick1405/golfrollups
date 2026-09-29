const express = require('express');
const router = express.Router();
const Scorecard = require('../models/Scorecard');

router.post('/', async (req, res) => {
    try {
        const scorecard = new Scorecard(req.body);
        const saved = await scorecard.save();
        res.status(201).json(saved);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const query = {};
        if (req.query.date) query.date = req.query.date;
        if (req.query.format) query.format = req.query.format;

        const scorecards = await Scorecard.find(query).sort({ date: -1 });
        res.json(scorecards);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;