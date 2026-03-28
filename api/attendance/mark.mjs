// ============================================================
//  /api/attendance/mark.mjs
//  Vercel Serverless Function — ES Module
//  Fixes JWT Validation & Restores Original Column Format
// ============================================================

import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import jwt from 'jsonwebtoken';

const HEADERS = ['Name', 'Roll Number', 'Branch', 'Semester', 'Event Name', 'Timestamp'];
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-default-key-123';

export default async function handler(req, res) {
  // ── 1. Allow CORS / Handle OPTIONS / POST Only ───────────────────────────
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  console.log('[mark.mjs] ▶ Request received:', new Date().toISOString());

  const { token, name, rollNumber, branch, semester } = req.body;

  // ── 2. Validate payload ──────────────────────────────────────────────────
  if (!token) {
    return res.status(400).json({ error: 'Missing QR token' });
  }
  if (!name || !rollNumber || !branch || !semester) {
    return res.status(400).json({
      error: 'Missing required student fields',
      received: { name, rollNumber, branch, semester }
    });
  }

  // ── 3. Verify JWT & Extract Event Name ───────────────────────────────────
  let eventName;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    eventName = decoded.eventName;
    if (!eventName) {
      return res.status(400).json({ error: 'Invalid session payload: Missing event Name' });
    }
    console.log('[mark.mjs] ✔ JWT Validated. Event:', eventName);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'SCAN EXPIRED: Please scan the latest code on the projector.' });
    }
    return res.status(401).json({ error: 'Invalid QR token' });
  }

  // ── 4. Google Sheets Connection & Append ─────────────────────────────────
  try {
    const rawSheetId = process.env.SHEET_ID || '';
    const rawServiceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_EMAIL || '';
    
    let sheetId = rawSheetId.trim();
    // Auto-fix if user pasted the entire URL into SHEET_ID variable
    const urlMatch = sheetId.match(/\/d\/([a-zA-Z0-9\-_]+)/);
    if (urlMatch) {
      sheetId = urlMatch[1];
    }

    const serviceEmail = rawServiceEmail.trim();

    // Ensure newlines are parsed correctly from Vercel env
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
      : null;

    if (!sheetId || !serviceEmail || !privateKey) {
      console.error('[mark.mjs] ✖ Missing Sheets credentials in Environment.');
      return res.status(500).json({ error: 'Server missing Google Sheets credentials (SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY)' });
    }

    // Google Auth Library v10+ setup (Fixing v5 crash)
    const jwtClient = new JWT({
      email: serviceEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, jwtClient);
    await doc.loadInfo();
    console.log('[mark.mjs] ✔ Connected to Sheet:', doc.title);

    // ── Restoring original event-based Tab logic ─────────────────────────
    let targetSheet;
    try {
      targetSheet = doc.sheetsByTitle[eventName];
    } catch (e) { /* ignore */ }
    
    // Create new sheet tab if none exists for this event
    if (!targetSheet) {
      console.log(`[mark.mjs] Creating new sheet tab for event: ${eventName}`);
      targetSheet = await doc.addSheet({ title: eventName });
      await targetSheet.setHeaderRow(HEADERS);
    } else {
      // Ensure headers exist just in case it was created manually
      await targetSheet.loadHeaderRow().catch(() => null);
      if (!targetSheet.headerValues || targetSheet.headerValues.length === 0) {
        await targetSheet.setHeaderRow(HEADERS);
      }
    }

    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Append standard row to the target sheet
    await targetSheet.addRow({
      'Name': name,
      'Roll Number': rollNumber,
      'Branch': branch,
      'Semester': semester,
      'Event Name': eventName,
      'Timestamp': timestamp
    });

    console.log(`[mark.mjs] ✔ Successfully logged ${name} to tab "${eventName}"`);

    return res.status(200).json({
      success: true,
      message: 'Attendance marked successfully!',
      data: { name, rollNumber, branch, semester, eventName, timestamp }
    });

  } catch (error) {
    console.error('[mark.mjs] ✖ SERVER CRASH:', error.message);
    console.error(error.stack);
    
    let userFriendlyError = `Failed to mark attendance: ${error.message}`;
    if (error.message.includes('404')) {
      userFriendlyError = `Google Sheet Not Found! You must click "Share" on your Google Sheet and invite the service account email: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_EMAIL} with Editor access. Also check if SHEET_ID is fully correct in Vercel.`;
    }

    // Send the raw error directly so we stop guessing what fails
    return res.status(500).json({
      success: false,
      error: userFriendlyError
    });
  }
}
