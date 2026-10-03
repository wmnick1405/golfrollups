const mongoose = require('mongoose');

const competitionNameSchema = new mongoose.Schema({
    'comp-name': { type: String, required: true },
    'desc': { type: String, default: "" },
    'CompetitionDates': [String],
    'entryFee': { type: Number, default: 0 },
}, { collection: 'competition-names' });

module.exports = mongoose.model('CompetitionName', competitionNameSchema);