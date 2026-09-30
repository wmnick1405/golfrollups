const mongoose = require('mongoose');

const rollupNoteSchema = new mongoose.Schema({
    created_at: { type: Date, default: Date.now },
    requested_by: { type: String, required: true },
    date_from: { type: Date, required: true },
    date_to: { type: Date, required: true },
    content: { type: String, required: true }
}, { collection: 'rollup-notes' });

module.exports = mongoose.model('RollupNote', rollupNoteSchema);