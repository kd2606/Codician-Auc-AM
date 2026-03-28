// ============================================================
//  /api/attendance/mark.js
//  Vercel Serverless Function — ES Module
//  Google Sheets v5+ JWT Authentication (google-auth-library)
// ============================================================

import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

// ── Required Vercel Environment Variables ──────────────────────────────────────
//   SHEET_ID                   → Google Spreadsheet ID
//   GOOGLE_SERVICE_ACCOUNT_EMAIL → Service account client_email
//   GOOGLE_PRIVATE_KEY          → PEM private key (may have \\n escaped by Vercel UI)
// ─────────────────────────────────────────────────────────────────────────────

const HEADERS = ['Timestamp', 'Name', 'Roll Number', 'Branch', 'Semester'];

export default async function handler(req, res) {
  // ── Only allow POST ──────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  console.log('[mark.js] ▶ Request received:', req.method, new Date().toISOString());

  const { name, rollNumber, branch, semester } = req.body;

  // ── Validate payload ─────────────────────────────────────────────────────────
  if (!name || !rollNumber || !branch || !semester) {
    console.error('[mark.js] ✖ Missing required fields:', { name, rollNumber, branch, semester });
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['name', 'rollNumber', 'branch', 'semester'],
      received: { name, rollNumber, branch, semester }
    });
  }

  console.log('[mark.js] ✔ Payload validated:', { name, rollNumber, branch, semester });

  try {
    // ── Step 1: Read environment variables ──────────────────────────────────────
    console.log('[mark.js] [1/5] Reading environment variables...');

    const sheetId = process.env.SHEET_ID;
    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

    // CRITICAL: Vercel stores keys with escaped \n — we must convert them to real newlines.
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : null;

    if (!sheetId || !serviceEmail || !privateKey) {
      const missing = [];
      if (!sheetId) missing.push('SHEET_ID');
      if (!serviceEmail) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
      if (!privateKey) missing.push('GOOGLE_PRIVATE_KEY');
      console.error('[mark.js] ✖ Missing env vars:', missing);
      return res.status(500).json({
        error: 'Server misconfiguration: missing environment variables',
        missing
      });
    }

    console.log('[mark.js] ✔ Env vars loaded. SHEET_ID:', sheetId, '| Email:', serviceEmail);

    // ── Step 2: Create JWT auth object ─────────────────────────────────────────
    console.log('[mark.js] [2/5] Initializing JWT auth with google-auth-library...');

    const jwtClient = new JWT({
      email: serviceEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('[mark.js] ✔ JWT client created.');

    // ── Step 3: Initialize GoogleSpreadsheet with JWT auth ─────────────────────
    console.log('[mark.js] [3/5] Connecting to Google Spreadsheet...');

    const doc = new GoogleSpreadsheet(sheetId, jwtClient);
    await doc.loadInfo();

    console.log('[mark.js] ✔ Sheet connected. Title:', doc.title);

    // ── Step 4: Get first sheet tab & auto-set headers if empty ────────────────
    console.log('[mark.js] [4/5] Accessing first sheet tab...');

    const sheet = doc.sheetsByIndex[0];

    console.log('[mark.js] ✔ Sheet tab found:', `"${sheet.title}"`, '| Row count:', sheet.rowCount);

    // Auto-initialize headers only if the sheet is completely empty (headerRowIndex 0, no rows)
    await sheet.loadHeaderRow().catch(() => null); // populate sheet._headerValues safely

    const existingHeaders = sheet.headerValues;
    const needsHeaders = !existingHeaders || existingHeaders.length === 0 || existingHeaders.every(h => !h);

    if (needsHeaders) {
      console.log('[mark.js] ℹ Sheet appears empty — auto-setting headers:', HEADERS);
      await sheet.setHeaderRow(HEADERS);
      console.log('[mark.js] ✔ Headers set successfully.');
    } else {
      console.log('[mark.js] ✔ Existing headers detected:', existingHeaders);
    }

    // ── Step 5: Append the row ─────────────────────────────────────────────────
    console.log('[mark.js] [5/5] Appending attendance row...');

    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    await sheet.addRow({
      'Timestamp': timestamp,
      'Name': name,
      'Roll Number': rollNumber,
      'Branch': branch,
      'Semester': semester,
    });

    console.log('[mark.js] ✔ Row appended successfully!', { timestamp, name, rollNumber, branch, semester });

    // ── Success ────────────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: 'Attendance marked successfully!',
      data: { timestamp, name, rollNumber, branch, semester }
    });

  } catch (error) {
    // ── Full error dump for Vercel logs ────────────────────────────────────────
    console.error('[mark.js] ✖ FATAL ERROR:', error.message);
    console.error('[mark.js] Stack:', error.stack);

    return res.status(500).json({
      success: false,
      error: 'Failed to mark attendance',
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
}
