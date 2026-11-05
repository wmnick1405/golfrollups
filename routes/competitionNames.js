const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');

const router = express.Router();
const collectionName = 'competition-names';

function getCollection() {
    return mongoose.connection.db.collection(collectionName);
}

function isValidId(id) {
    return /^[a-f\d]{24}$/i.test(id);
}

router.get('/', protect, async (req, res) => {
    try {
        const competitions = await getCollection()
            .find({})
            .sort({ 'comp-name': 1 })
            .toArray();
        res.json(competitions);
    } catch (err) {
        console.error('Error fetching competition names:', err);
        res.status(500).json({ error: 'Failed to fetch competition names' });
    }
});

router.post('/', protect, async (req, res) => {
    const { 'comp-name': rawName, desc, CompetitionDates } = req.body || {};

    if (typeof rawName !== 'string' || !rawName.trim()) {
        return res.status(400).json({ error: 'Competition name is required.' });
    }
    if (desc !== undefined && typeof desc !== 'string') {
        return res.status(400).json({ error: 'Competition description must be text.' });
    }
    if (CompetitionDates !== undefined &&
        (!Array.isArray(CompetitionDates) || !CompetitionDates.every(date => typeof date === 'string'))) {
        return res.status(400).json({ error: 'Competition dates must be an array of text values.' });
    }

    try {
        const competition = {
            'comp-name': rawName.trim(),
            desc: desc === undefined ? '' : desc.trim(),
            CompetitionDates: CompetitionDates || []
        };
        const result = await getCollection().insertOne(competition);
        res.status(201).json({ success: true, _id: result.insertedId });
    } catch (err) {
        console.error('Error creating competition name:', err);
        res.status(500).json({ error: 'Failed to create competition name' });
    }
});

router.put('/:id', protect, async (req, res) => {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid competition ID.' });
    }

    const { 'comp-name': rawName, desc, CompetitionDates } = req.body || {};
    if (rawName !== undefined && (typeof rawName !== 'string' || !rawName.trim())) {
        return res.status(400).json({ error: 'Competition name must not be empty.' });
    }
    if (desc !== undefined && typeof desc !== 'string') {
        return res.status(400).json({ error: 'Competition description must be text.' });
    }
    if (CompetitionDates !== undefined &&
        (!Array.isArray(CompetitionDates) || !CompetitionDates.every(date => typeof date === 'string'))) {
        return res.status(400).json({ error: 'Competition dates must be an array of text values.' });
    }

    const updates = {};
    if (rawName !== undefined) updates['comp-name'] = rawName.trim();
    if (desc !== undefined) updates.desc = desc.trim();
    if (CompetitionDates !== undefined) updates.CompetitionDates = CompetitionDates;
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No supported competition fields were provided.' });
    }

    try {
        const result = await getCollection().updateOne(
            { _id: new mongoose.Types.ObjectId(req.params.id) },
            { $set: updates }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Competition not found.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating competition name:', err);
        res.status(500).json({ error: 'Failed to update competition name' });
    }
});

router.delete('/:id', protect, async (req, res) => {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid competition ID.' });
    }

    try {
        const result = await getCollection().deleteOne({
            _id: new mongoose.Types.ObjectId(req.params.id)
        });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Competition not found.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting competition name:', err);
        res.status(500).json({ error: 'Failed to delete competition name' });
    }
});

module.exports = router;
