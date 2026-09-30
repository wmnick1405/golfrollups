const mongoose = require('mongoose');

const clubCalendarSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    title: String,
    start: Date,
    end: Date,
    location: String
}, { collection: 'club-calendar' });

module.exports = mongoose.model('ClubCalendar', clubCalendarSchema);