// No top-level require for google-spreadsheet to prevent ESM crash

// Initialize the sheet
// Ensure you have these variables in your Vercel Environment Variables later
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SERVICE_EMAIL = process.env.GOOGLE_SERVICE_EMAIL;
// Private key needs newlines replaced if loaded from env var string
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '';

let doc;

async function initSheets() {
  if (!SHEET_ID || !GOOGLE_SERVICE_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.warn('Google Sheets API keys not found. Attendance will not be saved to sheets.');
    return;
  }

  try {
    const pkg = await import('google-spreadsheet');
    const GoogleSpreadsheet = pkg.GoogleSpreadsheet || pkg.default?.GoogleSpreadsheet || pkg;
    
    doc = new GoogleSpreadsheet(SHEET_ID);
    
    // Authenticate using the service account credential
    await doc.useServiceAccountAuth({
      client_email: GOOGLE_SERVICE_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY,
    });
    
    // Load the document properties and worksheets
    await doc.loadInfo(); 
    console.log(`Google Sheets Connected: ${doc.title}`);
  } catch (err) {
    console.error('Failed to initialize Google Sheets:', err);
  }
}

async function appendAttendanceRow(eventName, studentData) {
  if (!doc) {
    console.warn('Google Sheets not initialized. Skipping row append.');
    return;
  }

  try {
    // If doc isn't initialized yet, try initializing it
    if (!doc) {
      await initSheets();
      if (!doc) throw new Error("Google Sheets failed to initialize.");
    }

    // Append standard row to the first sheet
    let sheet = doc.sheetsByIndex[0]; 

    // Explicitly auto-set the headers before appending to guarantee a valid data map
    await sheet.setHeaderRow(['Name', 'Roll Number', 'Branch', 'Semester', 'Event Name', 'Timestamp']);

    await sheet.addRow({
      'Name': studentData.studentName,
      'Roll Number': studentData.rollNumber,
      'Branch': studentData.branch,
      'Semester': studentData.semester,
      'Event Name': eventName,
      'Timestamp': new Date().toISOString()
    });
    
    console.log(`Appended attendance record for ${studentData.studentName} to Sheets.`);
  } catch (err) {
    console.error('Error appending row to Google Sheets:', err);
    throw err; // Crucial: Throw error so server.js catches it and returns HTTP 500
  }
}

module.exports = {
  initSheets,
  appendAttendanceRow
};
