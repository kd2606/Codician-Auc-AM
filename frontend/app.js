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

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('session-form');
  const powerToggle = document.getElementById('power-toggle');
  const startBtn = document.getElementById('start-btn');
  const endBtn = document.getElementById('end-btn');
  const statusDisplay = document.getElementById('status-display');
  const eventNameInput = document.getElementById('event-name');
  
  let isPowered = false;
  let sessionActive = false;

  powerToggle.addEventListener('change', (e) => {
    isPowered = e.target.checked;
    updateHardwareState();
  });

  function updateHardwareState() {
    const screen = document.querySelector('.screen');
    if (!isPowered) {
      statusDisplay.textContent = 'SYSTEM OFFLINE';
      document.body.style.opacity = '0.9';
      startBtn.disabled = true;
      endBtn.disabled = true;
      eventNameInput.disabled = true;
      screen.classList.remove('active');
    } else {
      statusDisplay.textContent = sessionActive ? 'ENCRYPTING...' : 'SYSTEM STANDBY';
      document.body.style.opacity = '1';
      eventNameInput.disabled = sessionActive;
      startBtn.disabled = sessionActive;
      endBtn.disabled = !sessionActive;
      
      if (sessionActive) {
        screen.classList.add('active');
        setTimeout(() => {
          statusDisplay.textContent = 'SESSION ACTIVE';
        }, 1000);
      } else {
        screen.classList.remove('active');
      }
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isPowered || sessionActive) return;

    const eventName = eventNameInput.value.trim();
    if (!eventName) return;

    try {
      statusDisplay.textContent = 'INITIALIZING...';
      
      // Write to Firebase Realtime Database
      await database.ref('/currentSession').set({
        isActive: true,
        eventName: eventName
      });

      sessionActive = true;
      updateHardwareState();
      statusDisplay.textContent = 'SESSION ACTIVE';
      
      // Open the projector screen automatically in a new window/tab
      window.open('projector.html', '_blank');
      
    } catch (err) {
      console.error('Session start error:', err);
      statusDisplay.textContent = 'ERR: SYSTEM FAULT';
    }
  });

  endBtn.addEventListener('click', async () => {
    if (!sessionActive) return;
    try {
      statusDisplay.textContent = 'TERMINATING...';
      
      // Update Firebase
      await database.ref('/currentSession').set({
        isActive: false,
        eventName: ""
      });

      sessionActive = false;
      updateHardwareState();
      statusDisplay.textContent = 'SESSION ENDED';
      form.reset();
      
    } catch (err) {
      console.error('Session end error:', err);
      statusDisplay.textContent = 'ERR: TERMINATION FAULT';
    }
  });

  // Initial UI state
  updateHardwareState();
});
