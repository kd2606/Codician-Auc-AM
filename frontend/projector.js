// Add your Firebase configuration here
const firebaseConfig = {
  apiKey: "AIzaSyBdrdMchIOKM-WYvSlV1yhUYsqhqCQpw2w",
  authDomain: "codician-auc-am.firebaseapp.com",
  databaseURL: "https://codician-auc-am-default-rtdb.firebaseio.com",
  projectId: "codician-auc-am",
  storageBucket: "codician-auc-am.firebasestorage.app",
  messagingSenderId: "199835691387",
  appId: "1:199835691387:web:516aaf4b535c9c6e0e75de"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let qrCode;
let countdownInterval;
let pollTimeout;
let count = 10;
let currentEventName = '';
const baseStudentUrl = window.location.origin + '/student.html';

document.addEventListener('DOMContentLoaded', () => {
  const qrcodeDiv = document.getElementById('qrcode');
  const timerDisplay = document.getElementById('timer');
  const indicator = document.querySelector('.led-indicator');
  const readoutText = document.querySelector('.security-readout span');
  const endedMessage = document.getElementById('session-ended-message');
  const line = document.getElementById('scanning-line');

  qrCode = new QRCode(qrcodeDiv, {
    text: baseStudentUrl,
    width: 250,
    height: 250,
    colorDark : "#000000",
    colorLight : "#effcf2",
    correctLevel : QRCode.CorrectLevel.H
  });

  // Listen to Firebase Realtime Database
  database.ref('/currentSession').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.isActive && data.eventName) {
      // Session is active
      if (currentEventName !== data.eventName) {
        currentEventName = data.eventName;
        startPolling(); // Restart fresh polling for this event
      }
      qrcodeDiv.style.opacity = '1';
      line.style.display = 'block';
      endedMessage.style.setProperty('display', 'none', 'important');
      indicator.classList.add('active');
      indicator.style.backgroundColor = '#4ade80';
      indicator.style.boxShadow = '0 0 10px #4ade80';
      readoutText.innerHTML = `ENCRYPTED LINK ACTIVE • REFRESHING IN <strong id="timer">10</strong> SECONDS`;
    } else {
      // Session ended or not active
      stopPolling();
      currentEventName = '';
      
      qrcodeDiv.style.opacity = '0'; // Hide QR
      line.style.display = 'none';
      endedMessage.style.setProperty('display', 'flex', 'important');
      
      indicator.classList.remove('active');
      indicator.style.backgroundColor = '#ff3333';
      indicator.style.boxShadow = '0 0 10px #ff3333';
      readoutText.innerHTML = 'ENCRYPTED LINK <strong style="color:#ff3333">TERMINATED</strong>';
    }
  });

  async function fetchNewToken() {
    if (!currentEventName) return;

    try {
      // Calls new stateless endpoint with eventName
      const response = await fetch(`/api/qr/token?eventName=${encodeURIComponent(currentEventName)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch token');
      }
      
      const data = await response.json();
      const tokenUrl = `${baseStudentUrl}?token=${data.token}`;
      
      qrCode.clear(); 
      qrCode.makeCode(tokenUrl);

      // Start Countdown
      count = 10;
      updateDisplay();
      
      // Schedule next token fetch
      pollTimeout = setTimeout(fetchNewToken, 10000);
    } catch (err) {
      console.error('Error fetching token:', err);
      const tDisp = document.getElementById('timer');
      if(tDisp) tDisp.textContent = 'ERR';
      // Retry faster on error
      pollTimeout = setTimeout(fetchNewToken, 3000);
    }
  }

  function updateDisplay() {
    const tDisp = document.getElementById('timer');
    if(tDisp) tDisp.textContent = count;
  }

  function startPolling() {
    stopPolling();
    // Start countdown timer independent of fetch latency
    countdownInterval = setInterval(() => {
      count--;
      if (count <= 0) count = 10;
      updateDisplay();
    }, 1000);

    fetchNewToken();
  }

  function stopPolling() {
    clearInterval(countdownInterval);
    clearTimeout(pollTimeout);
  }
});
