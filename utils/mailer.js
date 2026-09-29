const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'wmnick1405@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

module.exports = transporter;