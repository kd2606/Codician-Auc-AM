const { GoogleSpreadsheet } = require('google-spreadsheet');

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

async function appendAttendanceRow(session, studentData) {
  if (!doc) {
    console.warn('Google Sheets not initialized. Skipping row append.');
    return;
  }

  try {
    // Attempt to select the specific worksheet for the Subject or use the first one
    // Fallback: If no dedicated sheet, use first sheet
    let sheet = doc.sheetsByTitle[session.subjectCode];
    if (!sheet) {
      sheet = doc.sheetsByIndex[0]; 
    }

    // Append standard row
    await sheet.addRow({
      Timestamp: new Date().toISOString(),
      'Event Name': session.eventName,
      'Subject Code': session.subjectCode,
      'Instructor': session.teacherName,
      'Student Name': studentData.studentName,
      'Roll Number': studentData.rollNumber,
      'Branch': studentData.branch,
      'Semester': studentData.semester
    });
    
    console.log(`Appended attendance record for ${studentData.studentName} to Sheets.`);
  } catch (err) {
    console.error('Error appending row to Google Sheets:', err);
  }
}

module.exports = {
  initSheets,
  appendAttendanceRow
};
