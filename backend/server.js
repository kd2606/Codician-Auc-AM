require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-default-key-123';
const PORT = process.env.PORT || 3000;

// Serve frontend assets statically (local dev only)
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// ── /api/qr/token ───────────────────────────────────────────────────────────
// Generates a 10s short-lived JWT that embeds the eventName, rendering the backend completely stateless
app.get('/api/qr/token', (req, res) => {
  const { eventName } = req.query;

  if (!eventName) {
    return res.status(400).json({ error: 'Missing eventName parameter' });
  }

  const token = jwt.sign(
    { eventName, exp: Math.floor(Date.now() / 1000) + 10 },
    JWT_SECRET
  );

  res.json({ token, expires_in: 10 });
});

// ── /api/qr/handshake ────────────────────────────────────────────────────────
// Exchanges a rapid 10s scan token for a 5-minute submission token
app.post('/api/qr/handshake', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing QR token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const eventName = decoded.eventName;

    if (!eventName) {
      return res.status(400).json({ error: 'Invalid session payload' });
    }

    const submissionToken = jwt.sign(
      { eventName, exp: Math.floor(Date.now() / 1000) + 300 }, // 5m
      JWT_SECRET
    );

    res.json({ submissionToken });
  } catch (err) {
    return res.status(401).json({ error: 'SCAN EXPIRED: Please scan the latest code.' });
  }
});

// ── /api/attendance/mark ──────────────────────────────────────────────────────
app.post('/api/attendance/mark', async (req, res) => {
  const { token, studentName, rollNumber, branch, semester } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing QR token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const eventName = decoded.eventName;

    if (!eventName) {
      return res.status(400).json({ error: 'Invalid session payload' });
    }

    const studentRecord = { studentName, rollNumber, branch, semester, timestamp: new Date() };

    // Lazy-load sheets to safely handle database writes
    try {
      const { appendAttendanceRow } = require('./sheets');
      await appendAttendanceRow(eventName, studentRecord);
    } catch (sheetsErr) {
      console.error('Sheets append failed (FATAL):', sheetsErr.message);
      return res.status(500).json({ error: "Sheet Database Error", details: sheetsErr.message });
    }

    res.json({ message: 'Attendance marked successfully!' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'QR Code expired. Please scan the latest code on the projector.' });
    }
    return res.status(401).json({ error: 'Invalid QR token' });
  }
});

// Local dev only
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Codician AUC Server running on port ${PORT}`);
  });
}

// Export for Vercel Serverless
module.exports = app;
