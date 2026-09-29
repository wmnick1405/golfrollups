const mongoose = require('mongoose');

const ScorecardSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    format: { type: String, enum: ['stableford', 'net', 'gross'], required: true },
    allowancePercentage: { type: Number, default: 95 },
    groupSize: { type: Number, required: true },
    players: [{
        playerName: String,
        courseHandicap: Number,
        playingHandicap: Number,
        scores: [{
            hole: Number,
            par: Number,
            si: Number,
            gross: Number,
            calculatedScore: Number
        }],
        totalGross: Number,
        totalCalculated: Number
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Scorecard', ScorecardSchema);