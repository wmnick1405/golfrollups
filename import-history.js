const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');

const filePath = '/mnt/historical_data.csv';
mongoose.connect('mongodb://localhost:27017/rollupsdb'); 

const Golfer = mongoose.model('Golfer', new mongoose.Schema({ name: String }), 'golfers');
const Rollup = mongoose.model('Rollup', new mongoose.Schema({
    date: { type: Date, required: true },
    groups: [[{ golfer_id: String, name: String, booker: Boolean }]]
}), 'rollups');

// Function to strip ALL invisible characters and extra spaces
function cleanName(name) {
    if (!name) return "";
    return name
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove BOM and zero-width spaces
        .replace(/\u00A0/g, ' ')               // Convert non-breaking spaces to regular spaces
        .trim()                                // Remove outer spaces
        .toLowerCase();
}

async function importData() {
    const golfersMap = {};
    const missingGolfers = new Set();
    const historicalRows = [];

    try {
        const allGolfers = await Golfer.find({});
        allGolfers.forEach(g => {
            golfersMap[cleanName(g.name)] = g._id.toString();
        });

        console.log(`Loaded ${allGolfers.length} golfers from DB.`);

        fs.createReadStream(filePath)
            .pipe(csv({
                mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '')
            }))
            .on('data', (row) => historicalRows.push(row))
            .on('end', async () => {
                const rollupsByDate = {};

                historicalRows.forEach((row, index) => {
                    const rawName = row.Name;
                    const cleanedName = cleanName(rawName);
                    
                    // --- DEBUG LINE ---
                    if (index < 3) {
                        console.log(`Debug: Comparing CSV Name [${cleanedName}] to Map... Found ID: ${golfersMap[cleanedName] || 'NO MATCH'}`);
                    }

                    const parts = row.Date.split('/');
                    if (parts.length !== 3) return;
                    const dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
                    const isoDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;

                    if (!rollupsByDate[isoDate]) rollupsByDate[isoDate] = {};
                    if (!rollupsByDate[isoDate][row.Group]) rollupsByDate[isoDate][row.Group] = [];

                    const golferId = golfersMap[cleanedName];
                    if (!golferId && rawName) missingGolfers.add(rawName);

                    rollupsByDate[isoDate][row.Group].push({
                        golfer_id: golferId || null,
                        name: rawName.trim(),
                        booker: (row.Book && row.Book.trim().toLowerCase() === 'yes')
                    });
                });

                // Save logic
                for (const date in rollupsByDate) {
                    await Rollup.create({ date: new Date(date), groups: Object.values(rollupsByDate[date]) });
                }

                console.log(`\nImport finished. ${Object.keys(rollupsByDate).length} dates imported.`);
                if (missingGolfers.size > 0) {
                    console.log("⚠️ Still no match for:", Array.from(missingGolfers).join(', '));
                } else {
                    console.log("✅ All names matched!");
                }
                process.exit();
            });
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
importData();