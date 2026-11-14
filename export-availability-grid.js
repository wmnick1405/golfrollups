/**
 * export-availability-grid.js
 * ----------------------------------
 * Command-line version of the website's availability grid download.
 * The logic lives in utils/availabilityGrid.js so both share it.
 *
 *   node export-availability-grid.js
 *
 * Requires:  npm install exceljs
 * Requires:  your .env file with MONGO_URI.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { buildAvailabilityGrid } = require('./utils/availabilityGrid');

(async () => {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to: ${mongoose.connection.host}`);

    const { buffer, filename, summary } = await buildAvailabilityGrid();
    require('fs').writeFileSync(filename, buffer);

    console.log(`\nDone. Created: ${filename}`);
    console.log(`Grid: ${summary.golfers} golfers, ${summary.dates} dates (${summary.range})`);
    await mongoose.disconnect();
})().catch(err => {
    console.error('Export failed:', err);
    process.exit(1);
});