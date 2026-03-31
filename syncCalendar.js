const mongoose = require('mongoose');
const fetch = require('node-fetch');
const ical = require('ical');

// ===== CONFIG =====
const ICS_URL = 'https://clubv1.blob.core.windows.net/diary-events/822/bc1d725c-ddfb-4a2d-b3bc-f1dbc6eb0021.ics';
const MONGO_URI = 'mongodb://localhost:27017/rollupsdb';

// ===== SCHEMA =====
const ClubCalendarSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    title: String,
    start: Date,
    end: Date,
    allDay: Boolean,
    location: String
}, {
    collection: 'club-calendar'
});

const ClubCalendar = mongoose.model('ClubCalendar', ClubCalendarSchema);

// ===== MAIN FUNCTION =====
async function syncCalendar() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB");

        // Fetch ICS file
        const axios = require('axios');

const res = await axios.get(ICS_URL);
const text = res.data;

        // Parse ICS
        const data = ical.parseICS(text);

        let count = 0;

        for (const key in data) {
            const ev = data[key];

            if (ev.type === 'VEVENT') {
                await ClubCalendar.updateOne(
                    { uid: ev.uid }, // prevents duplicates
                    {
                        uid: ev.uid,
                        title: ev.summary || "No Title",
                        start: ev.start,
                        end: ev.end,
                        allDay: ev.datetype === 'date',
                        location: ev.location || ""
                    },
                    { upsert: true }
                );

                count++;
            }
        }

        console.log(`✅ Synced ${count} events into 'club-calendar'`);
        await mongoose.disconnect();

    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

// ===== RUN =====
syncCalendar();