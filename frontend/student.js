document.addEventListener('DOMContentLoaded', () => {
  const statusScreen = document.getElementById('status-screen');
  const statusText = document.getElementById('status-text');
  const statusSub = document.getElementById('status-sub');
  const formContainer = document.getElementById('form-container');
  const attendanceForm = document.getElementById('attendance-form');

  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  // Hardcoded Venue Coordinates: Amity University Chhattisgarh
  const VENUE_LAT = 21.1852;
  const VENUE_LON = 81.7103;
  const MAX_DISTANCE_METERS = 100000; // TEMP: increased to 100km for remote testing (revert to 20 after)

  if (!token) {
    showError("NO TOKEN DECTECTED", "Scan a physical QR code to begin.");
    return;
  }

  // Helper to decode JWT to check session uniqueness locally
  function parseJwt(jwtToken) {
    try {
      const base64Url = jwtToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  const payload = parseJwt(token);
  if (!payload || !payload.sessionId) {
    showError("CORRUPT TOKEN", "The QR code signature is invalid.");
    return;
  }

  const sessionId = payload.sessionId;

  // 1. Device Local Storage Check
  if (localStorage.getItem(`codician_attended_${sessionId}`)) {
    showError("ACCESS DENIED", "Attendance already recorded for this device.");
    return;
  }

  // 2. Geolocation Flow
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const studentLat = position.coords.latitude;
        const studentLon = position.coords.longitude;
        const distance = getDistanceFromLatLonInM(studentLat, studentLon, VENUE_LAT, VENUE_LON);
        
        if (distance > MAX_DISTANCE_METERS) {
          showError("ACCESS DENIED", `You are not at the event venue. (${Math.round(distance)}m away)`);
        } else {
          showSuccess("LOCATION VERIFIED", "PROCEED WITH ID TRANSMISSION");
        }
      },
      (error) => {
        showError("GPS FAULT", "Location access is required for attendance.");
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  } else {
    showError("HARDWARE INCOMPATIBLE", "Geolocation API not supported on this device.");
  }


  // 3. Form Submission
  attendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // UI Loading state
    statusScreen.classList.remove('error');
    statusText.textContent = "TRANSMITTING...";
    statusSub.textContent = "DO NOT TURN OFF DEVICE";
    formContainer.classList.add('hidden');

    const studentName = document.getElementById('student-name').value;
    const rollNumber = document.getElementById('roll-number').value;
    const branch = document.getElementById('branch').value;
    const semester = document.getElementById('semester').value;

    try {
      const response = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, studentName, rollNumber, branch, semester })
      });

      const data = await response.json();

      if (response.ok) {
        // Mark locally to prevent resubmission
        localStorage.setItem(`codician_attended_${sessionId}`, 'true');
        showSuccess("TRANSMISSION COMPLETE", "Attendance securely logged.");
      } else {
        showError("TRANSMISSION FAILED", data.error || "Server rejected payload.");
      }
    } catch (err) {
      console.error('Attendance submission error:', err);
      showError("NETWORK FAULT", "Unable to reach Codician Server.");
    }
  });


  // Helpers
  function showError(main, sub) {
    statusScreen.classList.add('error');
    statusText.textContent = main;
    statusSub.textContent = sub;
    formContainer.classList.add('hidden');
  }

  function showSuccess(main, sub) {
    statusScreen.classList.remove('error');
    statusText.textContent = main;
    statusSub.textContent = sub;
    formContainer.classList.remove('hidden');
  }

  // Haversine formula
  function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const dLat = (lat2 - lat1) * (Math.PI/180);
    const dLon = (lon2 - lon1) * (Math.PI/180);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
  }
});
