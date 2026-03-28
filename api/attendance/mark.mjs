// ============================================================
//  /api/attendance/mark.mjs
//  Vercel Serverless Function — ES Module
// ============================================================

import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

const HEADERS = ['Name', 'Roll Number', 'Branch', 'Semester', 'Event Name', 'Timestamp'];

// ── Decode JWT payload without external library (ESM-safe) ────────────────────
// The handshake endpoint already validated the token. We just read the payload.
function decodeJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  // ── 1. OPTIONS preflight / POST only ─────────────────────────────────────
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  console.log('[mark.mjs] ▶ Request received:', new Date().toISOString());

  const { token, name, rollNumber, branch, semester } = req.body;

  // ── 2. Validate payload fields ────────────────────────────────────────────
  if (!token) {
    return res.status(400).json({ error: 'Missing submission token' });
  }
  if (!name || !rollNumber || !branch || !semester) {
    return res.status(400).json({
      error: 'Missing required student fields',
      received: { name, rollNumber, branch, semester }
    });
  }

  // ── 3. Decode JWT & extract eventName ─────────────────────────────────────
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or corrupt token' });
  }

  const eventName = payload.eventName;
  if (!eventName) {
    return res.status(401).json({ error: 'Token missing eventName — scan the QR again' });
  }

  // Check expiry manually
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    return res.status(401).json({ error: 'SCAN EXPIRED: Please scan the latest code on the projector.' });
  }

  console.log('[mark.mjs] ✔ Token decoded. Event:', eventName);

  // ── 4. Google Sheets ──────────────────────────────────────────────────────
  let sheetId;
  try {
    const rawSheetId = (process.env.SHEET_ID || '').trim();
    const rawEmail   = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_EMAIL || '').trim();

    // Auto-extract ID if a full URL was pasted
    const urlMatch = rawSheetId.match(/\/d\/([a-zA-Z0-9\-_]+)/);
    sheetId = urlMatch ? urlMatch[1] : rawSheetId;

    const serviceEmail = rawEmail;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
      : null;

    if (!sheetId || !serviceEmail || !privateKey) {
      return res.status(500).json({
        error: `Server misconfiguration — missing env vars. sheetId="${sheetId}" email="${serviceEmail}" key=${!!privateKey}`
      });
    }

    const jwtClient = new JWT({
      email: serviceEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, jwtClient);
    await doc.loadInfo();
    console.log('[mark.mjs] ✔ Connected to sheet:', doc.title);

    // Find or create a tab named after the event
    let sheet = doc.sheetsByTitle[eventName];
    if (!sheet) {
      console.log('[mark.mjs] Creating new tab:', eventName);
      sheet = await doc.addSheet({ title: eventName });
      await sheet.setHeaderRow(HEADERS);
    } else {
      await sheet.loadHeaderRow().catch(() => null);
      if (!sheet.headerValues || sheet.headerValues.length === 0) {
        await sheet.setHeaderRow(HEADERS);
      }
    }

    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    await sheet.addRow({
      'Name': name,
      'Roll Number': rollNumber,
      'Branch': branch,
      'Semester': semester,
      'Event Name': eventName,
      'Timestamp': timestamp
    });

    console.log(`[mark.mjs] ✔ Logged: ${name} → tab "${eventName}"`);

    return res.status(200).json({
      success: true,
      message: 'Attendance marked successfully!',
      data: { name, rollNumber, branch, semester, eventName, timestamp }
    });

  } catch (error) {
    console.error('[mark.mjs] ✖ CRASH:', error.message);
    console.error(error.stack);

    let msg = `Failed: ${error.message}`;
    if (error.message.includes('404')) {
      msg = `Sheet not found (SHEET_ID="${sheetId}"). Share your Google Sheet with the service account email and verify SHEET_ID in Vercel.`;
    }

    return res.status(500).json({ success: false, error: msg });
  }
}
