const mongoose = require('mongoose');

const extraAvailabilitySchema = new mongoose.Schema({
    golfer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Golfer', required: true },
    date: { type: Date, required: true },
    note: String
}, { collection: 'extra-availabilities' });

module.exports = mongoose.model('ExtraAvailability', extraAvailabilitySchema);