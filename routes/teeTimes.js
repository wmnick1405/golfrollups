const express = require('express');
const router = express.Router();
const TeeTime = require('../models/TeeTime');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
    try {
        const times = await TeeTime.find().sort({ time: 1 });
        res.json(times);
    } catch (err) {
        res.status(500).json({ error: "Tee times fetch failed" });
    }
});

module.exports = router;