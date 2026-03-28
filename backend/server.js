require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');

const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const { initSheets, appendAttendanceRow } = require('./sheets');
initSheets();  // Initialize Google Sheets connection

// Firebase Admin Initialization (Placeholder for future actual integration)
// You should download the serviceAccountKey.json from Firebase and place it in the backend folder
// const serviceAccount = require('./serviceAccountKey.json');
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-default-key-123';
const PORT = process.env.PORT || 3000;

// Serve frontend assets statically
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// In-process memory store for sessions (Temporary until Firebase is fully connected)
const activeSessions = {};

app.get('/api/config', (req, res) => {
  res.sendFile(path.join(__dirname, 'data', 'collegeConfig.json'));
});

// 1. Organizer Endpoints
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

app.post('/api/session/end/:id', (req, res) => {
  const { id } = req.params;
  const session = activeSessions[id];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.status = 'ended';
  session.endTime = new Date();

  // Here, ideally write the final session.attendees array to Google Sheets or Firebase 
  // and trigger the email to teacherName.

  res.json({ message: 'Session ended successfully', totalAttendees: session.attendees.length });
});

// 2. Projector View / QR Token Generation
app.get('/api/token/generate/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  if (!activeSessions[sessionId] || activeSessions[sessionId].status !== 'active') {
    // Auto-recovery for testing: if session is gone, create a dummy one instead of crashing the projector
    console.log(`Auto-generating missing session ${sessionId} for projector view`);
    activeSessions[sessionId] = {
      eventName: "Demo Recovered Session",
      teacherName: "Demo Instructor",
      subjectCode: "RECOV-101",
      startTime: new Date(),
      status: 'active',
      attendees: []
    };
  }

  // Generate a token that expires in 10 seconds
  const token = jwt.sign({ sessionId, exp: Math.floor(Date.now() / 1000) + 10 }, JWT_SECRET);

  res.json({ token, expires_in: 10 });
});

// 3. Student Client / Attendance Submission
app.post('/api/attendance/mark', (req, res) => {
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

    // Checking for duplicates
    const alreadyMarked = session.attendees.find((s) => s.rollNumber === rollNumber);
    if (alreadyMarked) {
      return res.status(403).json({ error: 'Attendance already marked for this user' });
    }

    const studentRecord = {
      studentName,
      rollNumber,
      branch,
      semester,
      timestamp: new Date()
    };
    
    session.attendees.push(studentRecord);
    
    // Append to Google Sheets directly
    appendAttendanceRow(session, studentRecord);

    res.json({ message: 'Attendance marked successfully!' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'QR Code expired. Please scan the latest code on the projector.' });
    }
    return res.status(401).json({ error: 'Invalid QR token' });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Codician AUC Server running on port ${PORT}`);
  });
}

// Export for Vercel Serverless
module.exports = app;
