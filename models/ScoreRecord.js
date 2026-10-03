const mongoose = require('mongoose');

const playerRefSchema = new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer' },
    name: { type: String, required: true }
});

const scoreRecordSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    competition_name: { type: String, required: true },
    score_type: { 
        type: String, 
        enum: ['gross', 'net', 'stableford'], 
        required: true 
    },
    player_count: { type: Number, required: true },
    players: [playerRefSchema], // List of players in the group
    overall_score: { type: Number, required: true }, // Single total score
    created_at: { type: Date, default: Date.now }
}, { collection: 'score-records' });

module.exports = mongoose.model('ScoreRecord', scoreRecordSchema);