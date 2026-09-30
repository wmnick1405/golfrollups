const mongoose = require('mongoose');

const rollupSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    competition: { type: String, default: "Social" },
    groups: [[{ golfer_id: String, name: String, booker: Boolean }]]
});

module.exports = mongoose.model('Rollup', rollupSchema);