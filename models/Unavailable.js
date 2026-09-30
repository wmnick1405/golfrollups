const mongoose = require('mongoose');

const unavailableSchema = new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer' },
    date_from: Date,
    date_to: Date,
    indefinite: Boolean
});

module.exports = mongoose.model('Unavailable', unavailableSchema);