const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

// Automatically hash password before saving to database
UserSchema.pre('save', async function() {
  // 'this' refers to the user document being saved
  if (!this.isModified('password')) return;

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (err) {
    throw err; // This will be caught by your route's catch block
  }
});

module.exports = mongoose.model('User', UserSchema);