const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        match: [/.+\@.+\..+/, 'Please use a valid email address']
    },
    password: { type: String, required: true },
    passwordChangedAt: { type: Date, default: Date.now },
    otp: String,
    otpExpires: Date
});

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('User', userSchema);