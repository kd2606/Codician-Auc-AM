document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  if (!sessionId) {
    document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:20vh;">CRITICAL ERROR: No Session ID provided. Please launch this from the Organizer Control Panel.</h1>';
    return;
  }

  const timerEl = document.getElementById('timer');
  let qrcode = new QRCode(document.getElementById("qrcode"), {
    text: "INITIALIZING",
    width: 400,
    height: 400,
    colorDark : "#000000",
    colorLight : "#eef5ee",
    correctLevel : QRCode.CorrectLevel.L
  });

  let refreshInterval = 10;
  let currentCountdown = refreshInterval;

  async function fetchNewToken() {
    try {
      const response = await fetch(`/api/token/generate/${sessionId}`);
      if (!response.ok) {
        throw new Error('Server rejected token generation.');
      }
      const data = await response.json();
      
      // Update the QR Code with the new Student Auth URL + JWT
      const serverUrl = window.location.origin; 
      const checkInUrl = `${serverUrl}/student.html?token=${data.token}`;
      qrcode.makeCode(checkInUrl);

      // Restore UI to Active state in case it recovered from an outage
      document.querySelector('.led-indicator').classList.add('active');
      document.querySelector('.security-readout span').innerHTML = "SYSTEM ONLINE &bull; REFRESHING IN <strong id=\"timer\">10</strong> SECONDS";
      document.querySelector('.security-readout span').style.color = '#88b588';

      // Reset timer
      currentCountdown = refreshInterval;
    } catch (err) {
      console.error('Fetch Token Error:', err);
      document.querySelector('.led-indicator').classList.remove('active');
      document.querySelector('.security-readout span').innerHTML = "SYSTEM OUTAGE - RECONNECTING... <strong style='display:none' id=\"timer\">ERR</strong>";
      document.querySelector('.security-readout span').style.color = '#ff4444';
    }
  }

  // Initial fetch
  fetchNewToken();

  // Heartbeat loop for the countdown and refresh
  setInterval(() => {
    currentCountdown--;
    const currentTimerEl = document.getElementById('timer');
    if (currentCountdown <= 0) {
      // Visual feedback for refresh taking place
      document.querySelector('.led-indicator').style.boxShadow = 'none';
      setTimeout(() => {
        document.querySelector('.led-indicator').style.boxShadow = '';
      }, 200);

      fetchNewToken();
    } else {
      if (currentTimerEl) currentTimerEl.textContent = currentCountdown;
    }
  }, 1000);
});
