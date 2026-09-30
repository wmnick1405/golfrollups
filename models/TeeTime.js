const mongoose = require('mongoose');

const teeTimeSchema = new mongoose.Schema({
    time: { type: String, required: true },
    season: { type: String, default: "Summer" }
}, { collection: 'tee-times' });

module.exports = mongoose.model('TeeTime', teeTimeSchema);