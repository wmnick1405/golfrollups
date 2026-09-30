const mongoose = require('mongoose');

const competitionTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    date: { type: Date, required: false },
    course: { type: String, required: true, default: "Churchill & Blakedown" },
    holes: { type: Number, enum: [9, 18], default: 18 },
    tees: { type: String, required: true, enum: ['white', 'yellow', 'red'], default: 'yellow' },
    format: {
        type: String,
        enum: ['medal', 'stableford', 'match_play', 'four_ball', 'foursomes', 'scramble', 'pairs', 'singles'],
        required: true
    },
    handicap: {
        required: { type: Boolean, default: true },
        basis: {
            type: String,
            enum: ['handicap_index', 'course_handicap', 'playing_handicap', 'none'],
            default: 'course_handicap'
        },
        allowance: { type: Number, default: 100 },
        maxHandicapIndex: { type: Number, default: 54 }
    },
    scoring: {
        type: String,
        enum: ['gross', 'net', 'stableford', 'match_play'],
        required: true
    },
    tieBreak: {
        type: String,
        enum: ['countback', 'playoff', 'shared', 'none'],
        default: 'countback'
    },
    countback: {
        holes: { type: [Number], default: [9, 6, 3, 1] }
    },
    eligibility: {
        membersOnly: { type: Boolean, default: true },
        minimumAge: Number,
        maximumAge: Number,
        categories: [String]
    },
    maxPlayers: Number,
    conditions: {
        preferredLie: { type: Boolean, default: false },
        preferredLieArea: {
            type: String,
            enum: ['fairway', 'closely_mown', 'all_grass', 'none'],
            default: 'none'
        },
        localRulesApply: { type: Boolean, default: true },
        buggiesAllowed: { type: Boolean, default: true },
        caddiesAllowed: { type: Boolean, default: true }
    },
    entry: {
        opens: Date,
        closes: Date,
        scoreSubmission: {
            type: String,
            enum: ['paper', 'electronic', 'both'],
            default: 'both'
        }
    },
    prizes: [{ position: Number, description: String }],
    notes: String,
    status: {
        type: String,
        enum: ['draft', 'open', 'closed', 'completed', 'cancelled'],
        default: 'draft'
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CompetitionTemplate', competitionTemplateSchema);