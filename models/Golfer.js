const mongoose = require('mongoose');

const golferSchema = new mongoose.Schema({
    name: { type: String, required: true },
    tel: String,
    email: String,
    play_days: [String],
    booking_count: { type: Number, default: 0 },
    last_booked: { type: Date, default: new Date("2000-01-01") },
    booking_exempt: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    reminders_opt_in: { type: Boolean, default: false }
});

module.exports = mongoose.model('Golfer', golferSchema);