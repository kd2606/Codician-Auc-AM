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

// Serve frontend assets statically (local dev only; Vercel handles static via vercel.json)
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// In-process memory store for sessions
const activeSessions = {};

// ── /api/config ──────────────────────────────────────────────────────────────
// Load college config via require (works reliably in Vercel serverless)
const collegeConfig = require('./data/collegeConfig.json');

app.get('/api/config', (req, res) => {
  res.json(collegeConfig);
});

// ── /api/session/start ───────────────────────────────────────────────────────
app.post('/api/session/start', (req, res) => {
  const { eventName, teacherName, subjectCode, branch, semester } = req.body;

  if (!eventName || !teacherName || !subjectCode) {
    return res.status(400).json({ error: 'Missing required session parameters' });
  }

  const sessionId = 'SESSION_' + Date.now();

  activeSessions[sessionId] = {
    eventName,
    teacherName,
    subjectCode,
    branch,
    semester,
    startTime: new Date(),
    status: 'active',
    attendees: []
  };

  res.json({ message: 'Session started', sessionId });
});

// ── /api/session/end/:id ──────────────────────────────────────────────────────
app.post('/api/session/end/:id', (req, res) => {
  const { id } = req.params;
  const session = activeSessions[id];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.status = 'ended';
  session.endTime = new Date();

  res.json({ message: 'Session ended successfully', totalAttendees: session.attendees.length });
});

// ── /api/token/generate/:sessionId ───────────────────────────────────────────
app.get('/api/token/generate/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  if (!activeSessions[sessionId] || activeSessions[sessionId].status !== 'active') {
    console.log(`Auto-generating missing session ${sessionId} for projector view`);
    activeSessions[sessionId] = {
      eventName: 'Demo Recovered Session',
      teacherName: 'Demo Instructor',
      subjectCode: 'RECOV-101',
      startTime: new Date(),
      status: 'active',
      attendees: []
    };
  }

  const token = jwt.sign(
    { sessionId, exp: Math.floor(Date.now() / 1000) + 10 },
    JWT_SECRET
  );

  res.json({ token, expires_in: 10 });
});

// ── /api/attendance/mark ──────────────────────────────────────────────────────
app.post('/api/attendance/mark', async (req, res) => {
  const { token, studentName, rollNumber, branch, semester } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing QR token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const sessionId = decoded.sessionId;
    const session = activeSessions[sessionId];

    if (!session || session.status !== 'active') {
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    const alreadyMarked = session.attendees.find((s) => s.rollNumber === rollNumber);
    if (alreadyMarked) {
      return res.status(403).json({ error: 'Attendance already marked for this user' });
    }

    const studentRecord = { studentName, rollNumber, branch, semester, timestamp: new Date() };
    session.attendees.push(studentRecord);

    // Lazy-load sheets to avoid crashing the module if Google credentials are missing
    try {
      const { appendAttendanceRow } = require('./sheets');
      await appendAttendanceRow(session, studentRecord);
    } catch (sheetsErr) {
      console.error('Sheets append failed (non-fatal):', sheetsErr.message);
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
