const express = require('express');
const router = express.Router();
const Rollup = require('../models/Rollup');
const { protect } = require('../middleware/auth');

router.get('/check', async (req, res) => {
    try {
        const { date } = req.query;
        const startOfDay = new Date(date);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const existing = await Rollup.findOne({
            date: { $gte: startOfDay,$lte: endOfDay }
        });

        res.json({ exists: !!existing });
    } catch (err) {
        res.status(500).json({ error: "Database check failed" });
    }
});

router.post('/', protect, async (req, res) => {
    try {
        const rollup = new Rollup(req.body);
        await rollup.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/find', protect, async (req, res) => {
    const queryDate = new Date(req.query.date);
    const start = new Date(queryDate).setHours(0, 0, 0, 0);
    const end = new Date(queryDate).setHours(23, 59, 59, 999);
    const rollup = await Rollup.findOne({ date: { $gte: start,$lte: end } });
    if (!rollup) return res.status(404).json({ message: "Not found" });
    res.json(rollup);
});

router.get('/', protect, async (req, res) => {
    const rollups = await Rollup.find().sort({ date: -1 });
    res.json(rollups);
});

router.get('/:id', protect, async (req, res) => {
    try {
        const rollup = await Rollup.findById(req.params.id);
        res.json(rollup);
    } catch (err) {
        res.status(404).json({ error: "Not found" });
    }
});

router.put('/:id', protect, async (req, res) => {
    try {
        await Rollup.findByIdAndUpdate(req.params.id, req.body);
        res.status(200).json({ success: true, message: "Rollup groups saved cleanly" });
    } catch (err) {
        console.error("Booking Sheet save failed:", err);
        res.status(500).json({ error: "Failed to update rollup grid setup" });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await Rollup.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Rollup deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Could not delete rollup" });
    }
});

// REPORTS
router.get('/reports/participation', protect, async (req, res) => {
    try {
        const { from, to } = req.query;
        let query = {};
        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = new Date(from);
            if (to) query.date.$lte = new Date(to);
        }

        const history = await Rollup.find(query).lean();
        const stats = {};
        history.forEach(rollup => {
            rollup.groups.forEach(group => {
                group.forEach(player => {
                    if (!stats[player.name]) stats[player.name] = { played: 0, booked: 0 };
                    stats[player.name].played++;
                    if (player.booker) stats[player.name].booked++;
                });
            });
        });
        const report = Object.keys(stats).map(name => ({
            name,
            played: stats[name].played,
            booked: stats[name].booked,
            percentage: ((stats[name].booked / stats[name].played) * 100).toFixed(1) + '%'
        })).sort((a, b) => a.name.localeCompare(b.name));
        res.json(report);
    } catch (err) {
        res.status(500).json([]);
    }
});

router.get('/reports/booking-stress/:name', protect, async (req, res) => {
    try {
        const playerName = req.params.name;
        const recentGames = await Rollup.find({
            groups: { $elemMatch: {$elemMatch: { name: playerName } } }
        }).sort({ date: -1 }).limit(10).lean();

        let timesBooked = 0;
        const history = [];

        recentGames.forEach(rollup => {
            const playerEntry = rollup.groups.flat().find(p => p.name === playerName);
            if (playerEntry) {
                if (playerEntry.booker) timesBooked++;
                history.push({
                    date: rollup.date.toDateString(),
                    wasBooker: playerEntry.booker,
                    comp: rollup.competition
                });
            }
        });

        res.json({
            name: playerName,
            gamesAnalyzed: history.length,
            timesBooked: timesBooked,
            percentage: history.length > 0 ? ((timesBooked / history.length) * 100).toFixed(1) + '%' : '0%',
            history: history
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to calculate stress levels" });
    }
});

router.get('/reports/player-history', protect, async (req, res) => {
    try {
        const { name, from, to } = req.query;
        const searchName = name.trim();
        const nameRegex = new RegExp(`^${searchName}$`, 'i');

        let query = {
            groups: { $elemMatch: {$elemMatch: { name: nameRegex } } }
        };

        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = new Date(from);
            if (to) query.date.$lte = new Date(to);
        }

        const rollups = await Rollup.find(query).sort({ date: -1 }).lean();
        const results = rollups.map(r => {
            let isBooker = false;
            const allPlayersInThisRollup = r.groups.flat();
            const me = allPlayersInThisRollup.find(p =>
                p.name.trim().toLowerCase() === searchName.toLowerCase()
            );
            if (me && me.booker) isBooker = true;
            return {
                date: r.date,
                isBooker: isBooker,
                rollupId: r._id
            };
        });

        res.json(results);
    } catch (err) {
        console.error("Deep Search Error:", err);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

router.get('/reports/partnership', protect, async (req, res) => {
    try {
        const { player1, player2, from, to, allDates } = req.query;
        if (!player1 || !player2) {
            return res.status(400).json({ error: "Both player names are required." });
        }

        let dateQuery = {};
        if (allDates !== 'true') {
            if (from || to) {
                dateQuery.date = {};
                if (from) dateQuery.date.$gte = new Date(from + "T00:00:00.000Z");
                if (to) dateQuery.date.$lte = new Date(to + "T23:59:59.999Z");
            }
        }

        const rollups = await Rollup.find(dateQuery).sort({ date: -1 }).lean();

        let player1Count = 0;
        let player2Count = 0;
        let togetherInGroupCount = 0;
        const matches = [];

        const p1 = player1.trim().toLowerCase();
        const p2 = player2.trim().toLowerCase();

        rollups.forEach(rollup => {
            const allPlayers = rollup.groups.flat().map(p => p.name.trim().toLowerCase());
            const p1Attended = allPlayers.includes(p1);
            const p2Attended = allPlayers.includes(p2);

            if (p1Attended) player1Count++;
            if (p2Attended) player2Count++;

            let playedTogetherThisDay = false;
            rollup.groups.forEach(group => {
                const groupNames = group.map(p => p.name.trim().toLowerCase());
                if (groupNames.includes(p1) && groupNames.includes(p2)) {
                    togetherInGroupCount++;
                    playedTogetherThisDay = true;
                }
            });

            if (playedTogetherThisDay) {
                matches.push({
                    date: new Date(rollup.date).toLocaleDateString('en-GB', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                    }),
                    competition: rollup.competition
                });
            }
        });

        res.json({
            player1,
            player2,
            player1Count,
            player2Count,
            togetherInGroupCount,
            history: matches
        });
    } catch (err) {
        console.error("Partnership Tracker Error:", err);
        res.status(500).json({ error: "Failed to compile partnership data." });
    }
});

router.get('/reports/frequency', protect, async (req, res) => {
    try {
        const { player, from, to, allDates } = req.query;
        if (!player) {
            return res.status(400).json({ error: "Golfer name is required." });
        }

        let dateQuery = {};
        if (allDates !== 'true') {
            if (from || to) {
                dateQuery.date = {};
                if (from) dateQuery.date.$gte = new Date(from + "T00:00:00.000Z");
                if (to) dateQuery.date.$lte = new Date(to + "T23:59:59.999Z");
            }
        }

        const rollups = await Rollup.find(dateQuery).lean();
        const targetPlayer = player.trim().toLowerCase();
        const counts = {};

        rollups.forEach(rollup => {
            rollup.groups.forEach(group => {
                const groupNames = group.map(p => p.name.trim());
                const groupNamesLower = groupNames.map(n => n.toLowerCase());

                if (groupNamesLower.includes(targetPlayer)) {
                    groupNames.forEach(name => {
                        if (name.toLowerCase() !== targetPlayer) {
                            counts[name] = (counts[name] || 0) + 1;
                        }
                    });
                }
            });
        });

        const matrix = Object.keys(counts).map(name => ({
            name: name,
            count: counts[name]
        })).sort((a, b) => b.count - a.count);

        res.json({
            targetPlayer: player,
            matrix: matrix
        });
    } catch (err) {
        console.error("Frequency Tracker Error:", err);
        res.status(500).json({ error: "Failed to compile frequency data." });
    }
});

module.exports = router;