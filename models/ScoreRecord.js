const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer', required: true },
    name: { type: String, required: true }
}, { _id: false });

const scoreRecordSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    competition_name: { type: String, required: true },
    score_type: { 
        type: String, 
        required: true, 
        enum: ['stableford', 'net', 'gross'] 
    },
    player_count: { type: Number, required: true, min: 1, max: 4 },
    players: [playerSchema],
    overall_score: { type: Number, required: true }
}, { 
    collection: 'score-records', 
    timestamps: true 
});

module.exports = mongoose.model('ScoreRecord', scoreRecordSchema);