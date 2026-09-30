const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');
const transporter = require('../utils/mailer');
const { protect } = require('../middleware/auth');

function isPasswordRobust(password) {
    const regex = /^(?=.*[0-9])(?=.*[!@#$%^&*\-_])[a-zA-Z0-9!@#$%^&*\-_]{8,}$/;
    return regex.test(password);
}

// Password or OTP Login
router.post('/login', async (req, res) => {
    try {
        const { username, password, otp } = req.body;
        const user = await User.findOne({ username });

        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        if (password) {
            const match = await bcrypt.compare(password, user.password);
            if (!match) return res.status(401).json({ error: "Invalid password" });

            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            if (user.passwordChangedAt < ninetyDaysAgo) {
                return res.status(403).json({
                    error: "Password Expired",
                    message: "Your password is older than 90 days. Please use the OTP method to log in and update your password."
                });
            }
        } else if (otp) {
            if (user.otp !== otp || user.otpExpires < Date.now()) {
                return res.status(401).json({ error: "Invalid or expired code" });
            }
            user.otp = undefined;
            user.otpExpires = undefined;
            await user.save();
        } else {
            return res.status(400).json({ error: "Password or OTP required" });
        }

        req.session.userId = user._id;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// Legacy /login endpoint
router.post('/login-legacy', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id;
            req.session.save((err) => {
                if (err) return res.status(500).json({ error: "Session save failed" });
                res.json({ success: true, message: "Logged in" });
            });
        } else {
            res.status(401).json({ error: "Invalid username or password" });
        }
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// Request OTP
router.post('/request-otp', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ username: email });

    if (!user) return res.status(404).json({ error: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60000);
    await user.save();

    await transporter.sendMail({
        from: 'wmnick1405@gmail.com',
        to: email,
        subject: 'Your Login Code',
        text: `Your code is ${otp}. It expires in 10 minutes.`
    });

    res.json({ success: true });
});

// Change Password
router.post('/admin/change-password', protect, async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!isPasswordRobust(newPassword)) {
            return res.status(400).json({
                error: "Password too weak. Must be at least 8 characters long and include a number and a special character (!@#$%^&*)."
            });
        }
        const user = await User.findById(req.session.userId);
        user.password = newPassword;
        user.passwordChangedAt = Date.now();
        await user.save();
        res.json({ success: true, message: "Password updated successfully." });
    } catch (err) {
        res.status(500).json({ error: "Failed to update password." });
    }
});

// Check Auth
router.get('/check-auth', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ loggedIn: true });
    } else {
        res.status(401).json({ loggedIn: false });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('golf_sid');
        res.json({ success: true });
    });
});

// Create Admin User
router.post('/admin/create-user', protect, async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: "This username is already taken." });
        }
        const newUser = new User({ username, password });
        await newUser.save();
        console.log(`[Success] New admin created: ${username}`);
        res.json({ success: true });
    } catch (err) {
        console.error("--- USER CREATION ERROR ---", err);
        res.status(500).json({ error: "Failed to create secure user", message: err.message });
    }
});

// List Admin Users
router.get('/admin/list', protect, async (req, res) => {
    try {
        const users = await User.find({}, 'username passwordChangedAt');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch admin list" });
    }
});

// Delete Admin User
router.post('/admin/delete-user', protect, async (req, res) => {
    try {
        const { userId } = req.body;
        if (userId === req.session.userId) {
            return res.status(400).json({ error: "You cannot delete your own account while logged in." });
        }
        await User.findByIdAndDelete(userId);
        res.json({ success: true, message: "User deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete user" });
    }
});

module.exports = router;