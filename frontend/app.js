document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('session-form');
  const powerToggle = document.getElementById('power-toggle');
  const startBtn = document.getElementById('start-btn');
  const endBtn = document.getElementById('end-btn');
  const statusDisplay = document.getElementById('status-display');
  
  const branchSelect = document.getElementById('branch-select');
  const semesterSelect = document.getElementById('semester-select');
  const subjectSelect = document.getElementById('subject-code');
  const teacherSelect = document.getElementById('teacher-name');
  
  let collegeConfig = {};
  
  let isPowered = false;
  let sessionActive = false;
  let sessionId = null;

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
      disableInputs(true);
      screen.classList.remove('active');
    } else {
      statusDisplay.textContent = sessionActive ? 'ENCRYPTING...' : 'SYSTEM STANDBY';
      document.body.style.opacity = '1';
      disableInputs(sessionActive);
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

  function disableInputs(disabled) {
    document.getElementById('event-name').disabled = disabled;
    branchSelect.disabled = disabled;
    semesterSelect.disabled = disabled || !branchSelect.value;
    subjectSelect.disabled = disabled || !semesterSelect.value;
    teacherSelect.disabled = disabled || !subjectSelect.value;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isPowered || sessionActive) return;

    const eventName = document.getElementById('event-name').value;
    const branch = branchSelect.value;
    const semester = semesterSelect.value;
    const subjectCode = subjectSelect.value;
    const teacherName = teacherSelect.value;

    try {
      statusDisplay.textContent = 'INITIALIZING...';
      const response = await fetch('http://localhost:3000/api/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ eventName, teacherName, subjectCode, branch, semester })
      });

      if (response.ok) {
        const data = await response.json();
        sessionId = data.sessionId;
        sessionActive = true;
        updateHardwareState();
        statusDisplay.textContent = 'SESSION ACTIVE';
        // Open the projector screen automatically in a new window/tab
        window.open(`projector.html?sessionId=${sessionId}`, '_blank');
      } else {
        throw new Error('Failed to start session');
      }
    } catch (err) {
      console.error(err);
      statusDisplay.textContent = 'ERR: SYSTEM FAULT';
    }
  });

  endBtn.addEventListener('click', async () => {
    if (!sessionActive || !sessionId) return;
    try {
      statusDisplay.textContent = 'TERMINATING...';
      const response = await fetch(`http://localhost:3000/api/session/end/${sessionId}`, {
        method: 'POST'
      });

      if (response.ok) {
        sessionActive = false;
        sessionId = null;
        updateHardwareState();
        statusDisplay.textContent = 'SESSION ENDED';
        form.reset();
      }
    } catch (err) {
      console.error(err);
      statusDisplay.textContent = 'ERR: TERMINATION FAULT';
    }
  });

  // Dynamic Dropdowns Logic
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      collegeConfig = await res.json();
      
      Object.keys(collegeConfig).forEach(branch => {
        const opt = document.createElement('option');
        opt.value = branch;
        opt.textContent = branch;
        branchSelect.appendChild(opt);
      });
    } catch (err) {
      console.error('Failed to load college config', err);
    }
  }

  branchSelect.addEventListener('change', () => {
    const branch = branchSelect.value;
    semesterSelect.innerHTML = '<option value="" disabled selected>-- SELECT SEMESTER --</option>';
    subjectSelect.innerHTML = '<option value="" disabled selected>-- SELECT SUBJECT --</option>';
    teacherSelect.innerHTML = '<option value="" disabled selected>-- SELECT INSTRUCTOR --</option>';
    
    if (branch && collegeConfig[branch]) {
      semesterSelect.disabled = false;
      Object.keys(collegeConfig[branch]).forEach(sem => {
        const opt = document.createElement('option');
        opt.value = sem;
        opt.textContent = sem;
        semesterSelect.appendChild(opt);
      });
    } else {
      semesterSelect.disabled = true;
      subjectSelect.disabled = true;
      teacherSelect.disabled = true;
    }
  });

  semesterSelect.addEventListener('change', () => {
    const branch = branchSelect.value;
    const sem = semesterSelect.value;
    subjectSelect.innerHTML = '<option value="" disabled selected>-- SELECT SUBJECT --</option>';
    teacherSelect.innerHTML = '<option value="" disabled selected>-- SELECT INSTRUCTOR --</option>';
    
    if (branch && sem && collegeConfig[branch][sem]) {
      subjectSelect.disabled = false;
      collegeConfig[branch][sem].forEach(subject => {
        const opt = document.createElement('option');
        opt.value = subject.id;
        opt.textContent = `${subject.id} (${subject.name})`;
        subjectSelect.appendChild(opt);
      });
    } else {
      subjectSelect.disabled = true;
      teacherSelect.disabled = true;
    }
  });

  subjectSelect.addEventListener('change', () => {
    const branch = branchSelect.value;
    const sem = semesterSelect.value;
    const subjId = subjectSelect.value;
    teacherSelect.innerHTML = '<option value="" disabled selected>-- SELECT INSTRUCTOR --</option>';
    
    if (branch && sem && subjId) {
      const subject = collegeConfig[branch][sem].find(s => s.id === subjId);
      if (subject) {
        teacherSelect.disabled = false;
        subject.instructors.forEach(inst => {
          const opt = document.createElement('option');
          opt.value = inst;
          opt.textContent = inst;
          teacherSelect.appendChild(opt);
        });
      }
    } else {
      teacherSelect.disabled = true;
    }
  });

  loadConfig();

  // Initial UI state
  updateHardwareState();
});
