/**
 * utils/availabilityGrid.js
 * ----------------------------------
 * Builds the availability grid spreadsheet:
 * golfers down the left, every Mon/Wed/Fri for the next 12 months
 * across the top. GREEN = due to play, RED = normally plays but
 * unavailable, blank = not a normal day, 'E' = playing by exception.
 *
 * Used by routes/availability.js (GET /api/availability-grid) so
 * logged-in admins can download it from the site.
 */

const ExcelJS = require('exceljs');
const Golfer = require('../models/Golfer');
const Unavailable = require('../models/Unavailable');
const ExtraAvailability = require('../models/ExtraAvailability');

// --- CONFIGURATION -------------------------------------------------------
const MONTHS_AHEAD = 12;
const TARGET_DAYS = new Set(['Monday', 'Wednesday', 'Friday']);
const INCLUDE_INACTIVE_GOLFERS = false;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Excel "Good"/"Bad" style colours
const GREEN_FILL = { argb: 'FFC6EFCE' };
const GREEN_TEXT = { argb: 'FF006100' };
const RED_FILL   = { argb: 'FFFFC7CE' };
const RED_TEXT   = { argb: 'FF9C0006' };

// --- DATE HELPERS ---------------------------------------------------------
function buildDateColumns() {
    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + MONTHS_AHEAD);

    const cols = [];
    const d = new Date(start);
    while (d <= end) {
        if (TARGET_DAYS.has(DAY_NAMES[d.getUTCDay()])) {
            cols.push(new Date(d.getTime()));
        }
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return cols;
}

// Same away-detection logic as routes/availability.js (/api/available)
function isUnavailable(records, golferId, date) {
    return records.some(r =>
        r.golfer_id && r.golfer_id.toString() === golferId &&
        r.date_from <= date &&
        (r.indefinite === true || (r.date_to && r.date_to >= date))
    );
}

function isExtraAvailable(records, golferId, date) {
    const dateStr = date.toISOString().slice(0, 10);
    return records.some(r =>
        r.golfer_id && r.golfer_id.toString() === golferId &&
        r.date && r.date.toISOString().slice(0, 10) === dateStr
    );
}

// --- MAIN BUILDER ----------------------------------------------------------
/**
 * Queries the database and builds the workbook.
 * @returns {Promise<{buffer: Buffer, filename: string, summary: object}>}
 */
async function buildAvailabilityGrid() {
    const dateColumns = buildDateColumns();

    const golferFilter = INCLUDE_INACTIVE_GOLFERS ? {} : { active: { $ne: false } };
    const golfers = await Golfer.find(golferFilter).sort({ name: 1 }).lean();
    const unavailableRecords = await Unavailable.find({}).lean();
    const extraRecords = await ExtraAvailability.find({}).lean();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Availability Grid');

    // Header row
    const header = sheet.getRow(1);
    header.getCell(1).value = 'Golfer';
    header.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
    sheet.getColumn(1).width = 22;

    dateColumns.forEach((date, i) => {
        const cell = header.getCell(2 + i);
        cell.value = date;
        cell.numFmt = 'dd/mm/yyyy';
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
        cell.alignment = { textRotation: 90, horizontal: 'center' };
        sheet.getColumn(2 + i).width = 4.5;
    });

    // Golfer rows
    golfers.forEach((golfer, rowIdx) => {
        const row = sheet.getRow(2 + rowIdx);
        row.getCell(1).value = golfer.name;

        const golferId = golfer._id.toString();
        const playDays = golfer.play_days || [];

        dateColumns.forEach((date, i) => {
            const cell = row.getCell(2 + i);
            const dayName = DAY_NAMES[date.getUTCDay()];

            if (playDays.includes(dayName)) {
                if (isUnavailable(unavailableRecords, golferId, date)) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: RED_FILL };
                    cell.font = { color: RED_TEXT };
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: GREEN_FILL };
                    cell.font = { color: GREEN_TEXT };
                }
            } else if (isExtraAvailable(extraRecords, golferId, date)) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: GREEN_FILL };
                cell.font = { color: GREEN_TEXT };
                cell.value = 'E';
            }
        });
    });

    // Legend
    const legendRow = 2 + golfers.length + 1;
    sheet.getRow(legendRow).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: GREEN_FILL };
    sheet.getRow(legendRow).getCell(2).value = 'Due to play (normal day, not marked away)';
    sheet.getRow(legendRow + 1).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: RED_FILL };
    sheet.getRow(legendRow + 1).getCell(2).value = 'Normally plays but unavailable';
    sheet.getRow(legendRow + 2).getCell(2).value = 'E = playing by exception (ExtraAvailability), blank = not a normal day';

    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

    const startStr = dateColumns[0].toISOString().slice(0, 10);
    const endStr = dateColumns[dateColumns.length - 1].toISOString().slice(0, 10);
    const filename = `Availability_Grid_${startStr}_to_${endStr}.xlsx`;

    // Render the workbook into a buffer we can send over HTTP
    const arrayBuffer = await workbook.xlsx.writeBuffer();

    return {
        buffer: Buffer.from(arrayBuffer),
        filename,
        summary: {
            golfers: golfers.length,
            dates: dateColumns.length,
            range: `${startStr} to ${endStr}`
        }
    };
}

module.exports = { buildAvailabilityGrid };