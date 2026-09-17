/**
 * LingoLedger - Euro Calendar & Private English Lesson Tracker
 * Enhanced with Smooth Month Sliding, View Transitions, Touch Swipe, and Micro-Animations
 */

(() => {
  'use strict';

  // Local Storage Keys
  const STORAGE_KEY_STUDENTS = 'lingo_euro_students_v2';
  const STORAGE_KEY_TRANSACTIONS = 'lingo_euro_tx_v2';
  const STORAGE_KEY_SETTINGS = 'lingo_euro_settings_v2';
  const STORAGE_KEY_CLOUD = 'lingo_euro_cloud_v2';

  // Fixed Currency: Strictly Euro
  const CURRENCY_SYMBOL = '€';

  // App State
  let appSettings = {
    theme: 'dark'
  };

  let cloudSettings = {
    webAppUrl: '',
    spreadsheetUrl: '',
    excelExportUrl: '',
    lastSynced: null,
    autoSync: true
  };

  let students = [];
  let transactions = [];

  // Calendar State
  const now = new Date();
  let calYear = now.getFullYear();
  let calMonth = now.getMonth(); // 0-indexed
  let selectedDateStr = getFormattedDate(now); // YYYY-MM-DD
  let isNavigatingMonth = false;

  // View state: 'calendar' | 'clients'
  let currentView = 'calendar';

  // Client filtering & searching
  let clientFilter = 'all'; // 'all' | 'owes' | 'settled' | 'credit'
  let clientSearchQuery = '';

  // Active student selections
  let activeStudentForLedger = null;
  let activeStudentForReminder = null;
  let studentPendingDeleteId = null;

  // Avatar gradient options
  const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
    'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
    'linear-gradient(135deg, #10b981 0%, #047857 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
    'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
    'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)'
  ];

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const DAY_NAMES_FULL = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  // ==========================================
  // INITIALIZATION
  // ==========================================

  function initApp() {
    loadFromLocalStorage();
    setupTheme();
    updateCloudSyncUI();
    setupEventListeners();
    setupSwipeGestures();

    renderAll();

    // If cloud is connected, check for remote updates in background
    if (cloudSettings.webAppUrl) {
      fetchFromCloud(false);
    }
  }

  function loadFromLocalStorage() {
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) appSettings = Object.assign(appSettings, JSON.parse(savedSettings));

      const savedCloud = localStorage.getItem(STORAGE_KEY_CLOUD);
      if (savedCloud) cloudSettings = Object.assign(cloudSettings, JSON.parse(savedCloud));

      const savedStudents = localStorage.getItem(STORAGE_KEY_STUDENTS);
      if (savedStudents) students = JSON.parse(savedStudents);

      const savedTx = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
      if (savedTx) transactions = JSON.parse(savedTx);
    } catch (e) {
      console.error('Error reading localStorage:', e);
    }
  }

  function saveCloudSettings() {
    try {
      localStorage.setItem(STORAGE_KEY_CLOUD, JSON.stringify(cloudSettings));
    } catch (e) {
      console.error('Error saving cloud settings:', e);
    }
  }

  let cloudAutoSyncTimer = null;
  function triggerAutoCloudSync() {
    if (!cloudSettings.webAppUrl || !cloudSettings.autoSync) return;
    if (cloudAutoSyncTimer) clearTimeout(cloudAutoSyncTimer);
    cloudAutoSyncTimer = setTimeout(() => {
      syncToCloud('syncAll', null, false);
    }, 800);
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(appSettings));
      localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(students));
      localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(transactions));
      triggerAutoCloudSync();
    } catch (e) {
      console.error('Error saving to localStorage:', e);
      showToast('Error writing to storage', 'danger');
    }
  }

  // ==========================================
  // DATE & CURRENCY HELPERS
  // ==========================================

  function formatEuro(amount) {
    const num = Number(amount) || 0;
    const formatted = Math.abs(num).toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${CURRENCY_SYMBOL}${formatted}`;
  }

  function getFormattedDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateString(dateStr) {
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getAvatarGradient(name) {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
  }

  // ==========================================
  // FINANCIAL CALCULATIONS
  // ==========================================

  function calculateStudentFinances(studentId) {
    const studentTx = transactions.filter(t => t.studentId === studentId);
    let totalBilled = 0;
    let totalPaid = 0;
    let totalHours = 0;
    let sessionCount = 0;

    studentTx.forEach(tx => {
      if (tx.type === 'lesson' || tx.type === 'initial_balance') {
        totalBilled += Number(tx.amount) || 0;
        if (tx.type === 'lesson') {
          sessionCount += 1;
          totalHours += Number(tx.hours) || 1.0;
        }
      } else if (tx.type === 'payment') {
        totalPaid += Number(tx.amount) || 0;
      }
    });

    const balance = Math.round((totalBilled - totalPaid) * 100) / 100;

    return {
      balance,
      totalBilled: Math.round(totalBilled * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalHours: Math.round(totalHours * 10) / 10,
      sessionCount
    };
  }

  // ==========================================
  // CALENDAR LOGIC WITH SLIDING ANIMATIONS
  // ==========================================

  function renderCalendar(slideDirection = null) {
    const grid = document.getElementById('calendarDaysGrid');
    if (!grid) return;

    if (slideDirection && !isNavigatingMonth) {
      isNavigatingMonth = true;
      const outClass = slideDirection > 0 ? 'slide-out-left' : 'slide-out-right';
      const inClass = slideDirection > 0 ? 'slide-in-right' : 'slide-in-left';

      grid.classList.add(outClass);

      setTimeout(() => {
        calMonth += slideDirection;
        if (calMonth > 11) {
          calMonth = 0;
          calYear += 1;
        } else if (calMonth < 0) {
          calMonth = 11;
          calYear -= 1;
        }

        renderCalendarDOM();

        grid.classList.remove(outClass);
        grid.classList.add(inClass);

        setTimeout(() => {
          grid.classList.remove(inClass);
          isNavigatingMonth = false;
        }, 260);
      }, 140);
    } else {
      renderCalendarDOM();
    }
  }

  function renderCalendarDOM() {
    const monthTitleEl = document.getElementById('calendarMonthTitle');
    const monthIncomeBadge = document.getElementById('calMonthIncomeBadge');
    const grid = document.getElementById('calendarDaysGrid');
    if (!grid) return;

    if (monthTitleEl) {
      monthTitleEl.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;
    }

    // European calendar (Monday = 0 ... Sunday = 6)
    const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
    const startOffset = (firstDayIndex + 6) % 7;

    const daysInCurrentMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();

    const todayStr = getFormattedDate(new Date());

    let monthTotalBilled = 0;
    let monthTotalHours = 0;

    grid.innerHTML = '';

    // Leading days from previous month
    for (let i = startOffset - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(calYear, calMonth - 1, dayNum);
      const dateStr = getFormattedDate(prevDate);
      grid.appendChild(createDayCell(dayNum, dateStr, true, todayStr));
    }

    // Days of current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const currDate = new Date(calYear, calMonth, d);
      const dateStr = getFormattedDate(currDate);

      const daySessions = transactions.filter(t => t.type === 'lesson' && t.date === dateStr);
      daySessions.forEach(s => {
        monthTotalBilled += Number(s.amount) || 0;
        monthTotalHours += Number(s.hours) || 1.0;
      });

      grid.appendChild(createDayCell(d, dateStr, false, todayStr));
    }

    // Trailing days to fill 7-column grid
    const totalFilled = startOffset + daysInCurrentMonth;
    const trailingSlots = (7 - (totalFilled % 7)) % 7;
    for (let t = 1; t <= trailingSlots; t++) {
      const nextDate = new Date(calYear, calMonth + 1, t);
      const dateStr = getFormattedDate(nextDate);
      grid.appendChild(createDayCell(t, dateStr, true, todayStr));
    }

    if (monthIncomeBadge) {
      monthIncomeBadge.textContent = `${formatEuro(monthTotalBilled)} billed (${monthTotalHours.toFixed(1)} hrs)`;
    }

    renderDayInspector();
  }

  function createDayCell(dayNum, dateStr, isOtherMonth, todayStr) {
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell';
    cell.setAttribute('data-date', dateStr);

    if (isOtherMonth) cell.classList.add('other-month');
    if (dateStr === todayStr) cell.classList.add('is-today');
    if (dateStr === selectedDateStr) cell.classList.add('selected-day');

    const daySessions = transactions.filter(t => t.type === 'lesson' && t.date === dateStr);
    let dayHours = 0;
    daySessions.forEach(s => { dayHours += Number(s.hours) || 1.0; });

    // Cell Top
    const cellTop = document.createElement('div');
    cellTop.className = 'day-cell-top';

    const numBadge = document.createElement('span');
    numBadge.className = 'day-number-badge';
    numBadge.textContent = dayNum;
    cellTop.appendChild(numBadge);

    // Glowing TODAY badge on today's cell
    if (dateStr === todayStr && !isOtherMonth) {
      const todayBadge = document.createElement('span');
      todayBadge.className = 'today-glow-badge';
      todayBadge.textContent = 'TODAY';
      cellTop.appendChild(todayBadge);
    }

    if (dayHours > 0) {
      const hoursBadge = document.createElement('span');
      hoursBadge.className = 'day-hours-sum';
      hoursBadge.textContent = `${dayHours}h`;
      cellTop.appendChild(hoursBadge);
    }
    cell.appendChild(cellTop);

    // Sessions Stack
    const sessionsStack = document.createElement('div');
    sessionsStack.className = 'day-sessions-stack';

    const displaySessions = daySessions.slice(0, 2);
    displaySessions.forEach(s => {
      const student = students.find(st => st.id === s.studentId);
      const chip = document.createElement('div');
      const isPaid = s.isPaid === true || s.isImmediatePayment === true;
      chip.className = `session-chip ${isPaid ? 'status-paid' : 'status-unpaid'}`;
      chip.title = `${student ? student.name : 'Client'}: ${s.hours}h (${formatEuro(s.amount)})`;

      const clientName = student ? student.name.split(' ')[0] : 'Client';
      chip.innerHTML = `
        <span class="chip-client-name">${escapeHtml(clientName)}</span>
        <span class="chip-hours">${s.hours}h</span>
        <span class="chip-fee">${formatEuro(s.amount)}</span>
      `;
      sessionsStack.appendChild(chip);
    });

    if (daySessions.length > 2) {
      const moreBadge = document.createElement('div');
      moreBadge.className = 'more-sessions-badge';
      moreBadge.textContent = `+${daySessions.length - 2} more`;
      sessionsStack.appendChild(moreBadge);
    }

    cell.appendChild(sessionsStack);

    // Click handler with micro-interaction
    cell.addEventListener('click', () => {
      selectedDateStr = dateStr;
      document.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected-day'));
      cell.classList.add('selected-day');

      renderDayInspector();

      if (window.innerWidth <= 768) {
        const inspector = document.getElementById('dayInspectorCard');
        if (inspector) {
          inspector.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });

    return cell;
  }

  // ==========================================
  // SWIPE & GESTURE NAVIGATION
  // ==========================================

  function setupSwipeGestures() {
    const viewport = document.getElementById('calendarViewport');
    const grid = document.getElementById('calendarDaysGrid');
    if (!viewport || !grid) return;

    let startX = 0;
    let startY = 0;
    let isSwiping = false;
    let currentDeltaX = 0;

    // Touch events
    viewport.addEventListener('touchstart', (e) => {
      if (isNavigatingMonth) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      isSwiping = true;
      currentDeltaX = 0;
      grid.style.transition = 'none';
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (!isSwiping || isNavigatingMonth) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // Only horizontal swipe
      if (Math.abs(dx) > Math.abs(dy)) {
        currentDeltaX = dx;
        grid.style.transform = `translateX(${dx * 0.35}px)`;
      }
    }, { passive: true });

    viewport.addEventListener('touchend', () => {
      if (!isSwiping || isNavigatingMonth) return;
      isSwiping = false;
      grid.style.transition = '';
      grid.style.transform = '';

      if (currentDeltaX < -45) {
        renderCalendar(1); // Swipe left -> next month
      } else if (currentDeltaX > 45) {
        renderCalendar(-1); // Swipe right -> prev month
      }
    });

    // Mouse drag support for desktop
    let isMouseDown = false;
    let mouseStartX = 0;
    let mouseDeltaX = 0;

    viewport.addEventListener('mousedown', (e) => {
      if (isNavigatingMonth || e.button !== 0) return;
      isMouseDown = true;
      mouseStartX = e.clientX;
      mouseDeltaX = 0;
      grid.style.transition = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown || isNavigatingMonth) return;
      mouseDeltaX = e.clientX - mouseStartX;
      grid.style.transform = `translateX(${mouseDeltaX * 0.28}px)`;
    });

    window.addEventListener('mouseup', () => {
      if (!isMouseDown) return;
      isMouseDown = false;
      grid.style.transition = '';
      grid.style.transform = '';

      if (mouseDeltaX < -50) {
        renderCalendar(1);
      } else if (mouseDeltaX > 50) {
        renderCalendar(-1);
      }
    });
  }

  // ==========================================
  // DAY INSPECTOR PANEL
  // ==========================================

  function renderDayInspector() {
    const inspectorTitle = document.getElementById('inspectorDateTitle');
    const dayOfWeekLabel = document.getElementById('inspectorDayOfWeek');
    const dayHoursEl = document.getElementById('inspectorDayHours');
    const dayBilledEl = document.getElementById('inspectorDayBilled');
    const dayUnpaidEl = document.getElementById('inspectorDayUnpaid');
    const sessionsList = document.getElementById('inspectorSessionsList');

    if (!sessionsList) return;

    const parsedDate = parseDateString(selectedDateStr);
    const dayName = DAY_NAMES_FULL[parsedDate.getDay()];
    const dayFormatted = `${parsedDate.getDate()} ${MONTH_NAMES[parsedDate.getMonth()]} ${parsedDate.getFullYear()}`;
    const todayStr = getFormattedDate(new Date());
    const isToday = selectedDateStr === todayStr;

    if (dayOfWeekLabel) {
      dayOfWeekLabel.innerHTML = isToday
        ? `<span class="inspector-today-glow-badge">✨ TODAY</span> ${dayName}`
        : dayName;
    }
    if (inspectorTitle) inspectorTitle.textContent = dayFormatted;

    const daySessions = transactions.filter(t => t.type === 'lesson' && t.date === selectedDateStr);

    let totalHours = 0;
    let totalBilled = 0;
    let totalUnpaid = 0;

    daySessions.forEach(s => {
      const hours = Number(s.hours) || 1.0;
      const amount = Number(s.amount) || 0;
      totalHours += hours;
      totalBilled += amount;
      if (!s.isPaid && !s.isImmediatePayment) {
        totalUnpaid += amount;
      }
    });

    if (dayHoursEl) dayHoursEl.textContent = `${totalHours.toFixed(1)} hrs`;
    if (dayBilledEl) dayBilledEl.textContent = formatEuro(totalBilled);
    if (dayUnpaidEl) dayUnpaidEl.textContent = formatEuro(totalUnpaid);

    if (daySessions.length === 0) {
      sessionsList.innerHTML = `
        <div class="empty-day-message">
          <div class="empty-day-icon">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <p>No lessons recorded for this day.</p>
          <button class="btn btn-sm btn-primary" id="emptyDayAddBtn" style="margin-top: 10px;">Add Client Hours</button>
        </div>
      `;

      const emptyBtn = document.getElementById('emptyDayAddBtn');
      if (emptyBtn) emptyBtn.addEventListener('click', () => openAddHoursModal(selectedDateStr));
      return;
    }

    sessionsList.innerHTML = daySessions.map((s, idx) => {
      const student = students.find(st => st.id === s.studentId);
      const isPaid = s.isPaid === true || s.isImmediatePayment === true;
      const statusBadge = isPaid
        ? `<span class="status-badge-inline badge-paid-green">✓ Paid (${formatEuro(s.amount)})</span>`
        : `<span class="status-badge-inline badge-owes-red">⚠ Unpaid Debt (${formatEuro(s.amount)})</span>`;

      return `
        <div class="inspector-session-item ${isPaid ? 'paid-item' : 'unpaid-item'}" data-tx-id="${s.id}" style="animation-delay: ${idx * 35}ms;">
          <div class="session-item-top">
            <div class="session-item-client">${escapeHtml(student ? student.name : 'Unknown Client')}</div>
            <div class="session-item-fee ${isPaid ? 'text-success' : 'text-danger'}">${formatEuro(s.amount)}</div>
          </div>
          <div class="session-item-meta">
            <span class="meta-hours-pill">${s.hours} hours</span>
            <span>Rate: ${formatEuro(student ? student.rate : 35)}/hr</span>
          </div>
          ${s.topic ? `<div class="session-item-topic">"${escapeHtml(s.topic)}"</div>` : ''}
          <div class="session-item-actions">
            ${statusBadge}
            <div class="session-action-btns">
              ${!isPaid ? `
                <button class="btn btn-sm btn-secondary-success mark-session-paid-btn" data-id="${s.id}" data-student="${s.studentId}" data-amount="${s.amount}" title="Mark this lesson as paid">
                  Mark Paid
                </button>
              ` : ''}
              <button class="btn-icon-xs delete-session-btn" data-id="${s.id}" title="Delete session">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    sessionsList.querySelectorAll('.mark-session-paid-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const txId = e.currentTarget.getAttribute('data-id');
        const studentId = e.currentTarget.getAttribute('data-student');
        const amount = parseFloat(e.currentTarget.getAttribute('data-amount')) || 0;
        markSessionAsPaid(txId, studentId, amount);
      });
    });

    sessionsList.querySelectorAll('.delete-session-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const txId = e.currentTarget.getAttribute('data-id');
        deleteTransaction(txId);
      });
    });
  }

  function markSessionAsPaid(txId, studentId, amount) {
    const tx = transactions.find(t => t.id === txId);
    if (tx) {
      tx.isPaid = true;
      transactions.push({
        id: 'tx_pay_' + Date.now(),
        studentId,
        type: 'payment',
        amount,
        method: 'Marked Paid at Lesson',
        notes: `Settled for lesson on ${tx.date}`,
        date: tx.date || getFormattedDate(new Date()),
        createdAt: new Date().toISOString()
      });

      saveToLocalStorage();
      renderAll();
      showToast(`Marked lesson as paid (${formatEuro(amount)})`, 'success');
    }
  }

  function deleteTransaction(txId) {
    const idx = transactions.findIndex(t => t.id === txId);
    if (idx > -1) {
      transactions.splice(idx, 1);
      saveToLocalStorage();
      renderAll();
      showToast('Record deleted', 'info');
    }
  }

  // ==========================================
  // CLIENTS & BALANCES VIEW
  // ==========================================

  function renderClientsView() {
    const rosterGrid = document.getElementById('clientsRosterGrid');
    const emptyState = document.getElementById('clientsEmptyState');
    if (!rosterGrid) return;

    let filtered = students.filter(s => {
      const fin = calculateStudentFinances(s.id);
      if (clientFilter === 'owes' && fin.balance <= 0.009) return false;
      if (clientFilter === 'settled' && (fin.balance > 0.009 || fin.balance < -0.009)) return false;
      if (clientFilter === 'credit' && fin.balance >= -0.009) return false;

      if (clientSearchQuery.trim()) {
        const q = clientSearchQuery.toLowerCase().trim();
        const matchesName = (s.name || '').toLowerCase().includes(q);
        const matchesLevel = (s.level || '').toLowerCase().includes(q);
        const matchesPhone = (s.phone || '').toLowerCase().includes(q);
        const matchesEmail = (s.email || '').toLowerCase().includes(q);
        return matchesName || matchesLevel || matchesPhone || matchesEmail;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const finA = calculateStudentFinances(a.id);
      const finB = calculateStudentFinances(b.id);
      return finB.balance - finA.balance;
    });

    if (filtered.length === 0) {
      rosterGrid.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    rosterGrid.innerHTML = filtered.map((s, idx) => {
      const fin = calculateStudentFinances(s.id);
      const isOwing = fin.balance > 0.009;
      const isSettled = fin.balance >= -0.009 && fin.balance <= 0.009;
      const isCredit = fin.balance < -0.009;

      let cardClass = 'student-card';
      let bannerHtml = '';

      if (isOwing) {
        cardClass += ' has-debt';
        bannerHtml = `
          <div class="card-balance-banner debt-banner">
            <div>
              <span class="balance-title-label">Amount Owed</span>
              <span class="balance-sub-tag">${fin.sessionCount} lessons recorded</span>
            </div>
            <div class="balance-number">${formatEuro(fin.balance)}</div>
          </div>
        `;
      } else if (isCredit) {
        cardClass += ' has-credit';
        bannerHtml = `
          <div class="card-balance-banner credit-banner">
            <div>
              <span class="balance-title-label">Prepaid Balance</span>
              <span class="balance-sub-tag">Account has credit</span>
            </div>
            <div class="balance-number">${formatEuro(Math.abs(fin.balance))}</div>
          </div>
        `;
      } else {
        cardClass += ' is-settled';
        bannerHtml = `
          <div class="card-balance-banner settled-banner">
            <div>
              <span class="balance-title-label">Payment Status</span>
              <span class="balance-sub-tag">All hours paid up</span>
            </div>
            <div class="balance-number">${formatEuro(0)}</div>
          </div>
        `;
      }

      const avatarGradient = getAvatarGradient(s.name);
      const initials = getInitials(s.name);

      return `
        <div class="${cardClass}" data-client-id="${s.id}" style="animation-delay: ${idx * 40}ms;">
          <div class="card-header-row">
            <div class="student-identity">
              <div class="avatar-circle" style="background: ${avatarGradient};">
                ${escapeHtml(initials)}
              </div>
              <div class="student-headings">
                <h3>${escapeHtml(s.name)}</h3>
                <span class="level-badge">${escapeHtml(s.level || 'General English')}</span>
              </div>
            </div>
            <div class="card-actions-menu">
              <button class="icon-action-btn edit-client-btn" data-id="${s.id}" title="Edit Client">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="icon-action-btn delete-btn delete-client-btn" data-id="${s.id}" data-name="${escapeHtml(s.name)}" title="Remove Client">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>

          ${bannerHtml}

          <div class="student-meta-list">
            <div class="meta-item">
              <span class="meta-label">Rate:</span>
              <span class="meta-val">${formatEuro(s.rate || 0)}/hr</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Hours Done:</span>
              <span class="meta-val text-accent">${fin.totalHours} hrs</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Total Paid:</span>
              <span class="meta-val text-success">${formatEuro(fin.totalPaid)}</span>
            </div>
            ${s.phone ? `
              <div class="meta-item">
                <span class="meta-label">Phone:</span>
                <span class="meta-val">${escapeHtml(s.phone)}</span>
              </div>
            ` : ''}
          </div>

          ${s.notes ? `<div class="student-notes-box">"${escapeHtml(s.notes)}"</div>` : ''}

          <div class="card-footer-buttons">
            <button class="btn btn-secondary-accent card-add-hours-btn" data-id="${s.id}">
              + Hours
            </button>
            <button class="btn btn-secondary-success card-add-pay-btn" data-id="${s.id}">
              + Pay (€)
            </button>
            <button class="btn btn-secondary card-ledger-btn" data-id="${s.id}">
              Ledger
            </button>
            ${isOwing ? `
              <button class="btn btn-whatsapp card-reminder-btn" data-id="${s.id}" title="Send polite WhatsApp reminder in €">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    rosterGrid.querySelectorAll('.edit-client-btn').forEach(btn => {
      btn.addEventListener('click', (e) => openEditClientModal(e.currentTarget.getAttribute('data-id')));
    });

    rosterGrid.querySelectorAll('.delete-client-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        openDeleteClientModal(id, name);
      });
    });

    rosterGrid.querySelectorAll('.card-add-hours-btn').forEach(btn => {
      btn.addEventListener('click', (e) => openAddHoursModal(selectedDateStr, e.currentTarget.getAttribute('data-id')));
    });

    rosterGrid.querySelectorAll('.card-add-pay-btn').forEach(btn => {
      btn.addEventListener('click', (e) => openPaymentModal(e.currentTarget.getAttribute('data-id')));
    });

    rosterGrid.querySelectorAll('.card-ledger-btn').forEach(btn => {
      btn.addEventListener('click', (e) => openHistoryModal(e.currentTarget.getAttribute('data-id')));
    });

    rosterGrid.querySelectorAll('.card-reminder-btn').forEach(btn => {
      btn.addEventListener('click', (e) => openReminderModal(e.currentTarget.getAttribute('data-id')));
    });
  }

  // ==========================================
  // DASHBOARD AGGREGATES & METRICS
  // ==========================================

  function renderMetrics() {
    let grandTotalOwed = 0;
    let grandTotalPaid = 0;
    let grandTotalHours = 0;
    let owingClientsCount = 0;
    let settledClientsCount = 0;
    let creditClientsCount = 0;

    students.forEach(s => {
      const fin = calculateStudentFinances(s.id);
      if (fin.balance > 0.009) {
        grandTotalOwed += fin.balance;
        owingClientsCount += 1;
      } else if (fin.balance < -0.009) {
        creditClientsCount += 1;
      } else {
        settledClientsCount += 1;
      }
      grandTotalPaid += fin.totalPaid;
      grandTotalHours += fin.totalHours;
    });

    const calTotalOwed = document.getElementById('calTotalOwed');
    if (calTotalOwed) calTotalOwed.textContent = formatEuro(grandTotalOwed);

    const calTotalPaid = document.getElementById('calTotalPaid');
    if (calTotalPaid) calTotalPaid.textContent = formatEuro(grandTotalPaid);

    const calMonthHours = document.getElementById('calMonthHours');
    if (calMonthHours) calMonthHours.textContent = `${grandTotalHours.toFixed(1)} hrs`;

    const calActiveClients = document.getElementById('calActiveClients');
    if (calActiveClients) calActiveClients.textContent = students.length;

    const navOwesBadge = document.getElementById('navOwesCountBadge');
    if (navOwesBadge) {
      navOwesBadge.textContent = owingClientsCount;
      navOwesBadge.style.display = owingClientsCount > 0 ? 'inline-block' : 'none';
    }

    const mobileOwesDot = document.getElementById('mobileOwesBadgeDot');
    if (mobileOwesDot) {
      mobileOwesDot.classList.toggle('hidden', owingClientsCount === 0);
    }

    const bAll = document.getElementById('badgeClientsAll');
    if (bAll) bAll.textContent = students.length;

    const bOwes = document.getElementById('badgeClientsOwes');
    if (bOwes) bOwes.textContent = owingClientsCount;

    const bSettled = document.getElementById('badgeClientsSettled');
    if (bSettled) bSettled.textContent = settledClientsCount;

    const bCredit = document.getElementById('badgeClientsCredit');
    if (bCredit) bCredit.textContent = creditClientsCount;
  }

  function renderAll() {
    renderMetrics();
    renderCalendar();
    renderClientsView();
    populateClientDropdowns();
  }

  function populateClientDropdowns() {
    const selects = [
      document.getElementById('hoursClientSelect'),
      document.getElementById('paymentClientSelect')
    ];

    selects.forEach(sel => {
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = students.map(s => {
        return `<option value="${s.id}">${escapeHtml(s.name)} (${formatEuro(s.rate || 0)}/hr)</option>`;
      }).join('');
      if (cur && students.some(s => s.id === cur)) {
        sel.value = cur;
      }
    });
  }

  // ==========================================
  // VIEW SWITCHING WITH SLIDE TRANSITIONS
  // ==========================================

  function switchView(targetView) {
    if (currentView === targetView) return;

    const calSection = document.getElementById('calendarViewSection');
    const clientsSection = document.getElementById('clientsViewSection');
    const calBtn = document.getElementById('viewCalendarBtn');
    const clientsBtn = document.getElementById('viewClientsBtn');
    const mobCal = document.getElementById('mobileNavCalendar');
    const mobClients = document.getElementById('mobileNavClients');
    const mobFab = document.getElementById('mobileFabAddHours');

    const isToClients = targetView === 'clients';
    currentView = targetView;

    // Clean up animation classes
    calSection.classList.remove('slide-in-right', 'slide-in-left');
    clientsSection.classList.remove('slide-in-right', 'slide-in-left');

    if (isToClients) {
      calSection.classList.add('hidden');
      calSection.classList.remove('active');

      clientsSection.classList.remove('hidden');
      clientsSection.classList.add('active', 'slide-in-right');

      if (clientsBtn) clientsBtn.classList.add('active');
      if (calBtn) calBtn.classList.remove('active');
      if (mobClients) mobClients.classList.add('active');
      if (mobCal) mobCal.classList.remove('active');
      if (mobFab) mobFab.style.display = 'none';

      renderClientsView();
    } else {
      clientsSection.classList.add('hidden');
      clientsSection.classList.remove('active');

      calSection.classList.remove('hidden');
      calSection.classList.add('active', 'slide-in-left');

      if (calBtn) calBtn.classList.add('active');
      if (clientsBtn) clientsBtn.classList.remove('active');
      if (mobCal) mobCal.classList.add('active');
      if (mobClients) mobClients.classList.remove('active');
      if (mobFab) mobFab.style.display = 'flex';

      renderCalendar();
    }

    setTimeout(() => {
      calSection.classList.remove('slide-in-right', 'slide-in-left');
      clientsSection.classList.remove('slide-in-right', 'slide-in-left');
    }, 320);
  }

  // ==========================================
  // MODALS & ACTIONS
  // ==========================================

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  // 1. Add Hours Modal
  function openAddHoursModal(prefilledDate = null, preselectedClientId = null) {
    if (students.length === 0) {
      showToast('Please add a client first before logging hours.', 'info');
      openAddClientModal();
      return;
    }

    populateClientDropdowns();
    const clientSelect = document.getElementById('hoursClientSelect');
    if (preselectedClientId && clientSelect) {
      clientSelect.value = preselectedClientId;
    }

    const dateInput = document.getElementById('hoursDateInput');
    if (dateInput) {
      dateInput.value = prefilledDate || selectedDateStr || getFormattedDate(new Date());
    }

    document.getElementById('hoursDurationSelect').value = '1.0';
    document.getElementById('hoursTopicInput').value = '';
    document.getElementById('hoursPaidCheckbox').checked = false;

    recalculateHoursFee();
    openModal('addHoursModal');
  }

  function recalculateHoursFee() {
    const clientId = document.getElementById('hoursClientSelect').value;
    const hours = parseFloat(document.getElementById('hoursDurationSelect').value) || 1.0;
    const client = students.find(s => s.id === clientId);
    const rate = client ? (client.rate || 35) : 35;
    const fee = Math.round((rate * hours) * 100) / 100;

    const feeInput = document.getElementById('hoursFeeInput');
    const hint = document.getElementById('hoursCalculatedRateHint');

    if (feeInput) feeInput.value = fee.toFixed(2);
    if (hint) {
      hint.textContent = `Auto-calculated: ${hours} hr × ${formatEuro(rate)}/hr = ${formatEuro(fee)}`;
    }
  }

  function handleSaveHours(e) {
    e.preventDefault();
    const clientId = document.getElementById('hoursClientSelect').value;
    const date = document.getElementById('hoursDateInput').value;
    const hours = parseFloat(document.getElementById('hoursDurationSelect').value) || 1.0;
    const fee = parseFloat(document.getElementById('hoursFeeInput').value);
    const topic = document.getElementById('hoursTopicInput').value.trim();
    const isPaidImmediately = document.getElementById('hoursPaidCheckbox').checked;

    if (!clientId || isNaN(fee) || fee < 0) {
      showToast('Please enter a valid session fee.', 'danger');
      return;
    }

    const client = students.find(s => s.id === clientId);

    const lessonTx = {
      id: 'tx_les_' + Date.now(),
      studentId: clientId,
      type: 'lesson',
      hours,
      amount: fee,
      topic: topic || 'English Session',
      date: date || selectedDateStr,
      isPaid: isPaidImmediately,
      isImmediatePayment: isPaidImmediately,
      createdAt: new Date().toISOString()
    };
    transactions.push(lessonTx);

    if (isPaidImmediately) {
      transactions.push({
        id: 'tx_pay_' + Date.now() + '_imm',
        studentId: clientId,
        type: 'payment',
        amount: fee,
        method: 'Cash / Immediate Transfer',
        notes: `Paid on date for ${hours}h lesson`,
        date: date || selectedDateStr,
        createdAt: new Date().toISOString()
      });
    }

    saveToLocalStorage();

    if (date) {
      selectedDateStr = date;
      const dObj = parseDateString(date);
      calYear = dObj.getFullYear();
      calMonth = dObj.getMonth();
    }

    renderAll();
    closeModal('addHoursModal');

    const msg = isPaidImmediately
      ? `Logged ${hours}h for ${client ? client.name : 'Client'} and marked as Paid (${formatEuro(fee)})`
      : `Logged ${hours}h for ${client ? client.name : 'Client'}! (${formatEuro(fee)} added to balance)`;
    showToast(msg, 'success');
  }

  // 2. Add / Edit Client Modal
  function openAddClientModal() {
    document.getElementById('clientModalTitle').textContent = 'Add New Client';
    document.getElementById('clientEditId').value = '';
    document.getElementById('clientForm').reset();
    document.getElementById('clientRateInput').value = '35';
    document.getElementById('clientInitialBalanceInput').value = '0';
    document.getElementById('clientInitialBalanceGroup').style.display = 'block';

    openModal('clientModal');
    setTimeout(() => document.getElementById('clientNameInput').focus(), 50);
  }

  function openEditClientModal(clientId) {
    const client = students.find(s => s.id === clientId);
    if (!client) return;

    document.getElementById('clientModalTitle').textContent = 'Edit Client Profile';
    document.getElementById('clientEditId').value = client.id;
    document.getElementById('clientNameInput').value = client.name || '';
    document.getElementById('clientRateInput').value = client.rate || 35;
    document.getElementById('clientLevelSelect').value = client.level || 'General English';
    document.getElementById('clientPhoneInput').value = client.phone || '';
    document.getElementById('clientEmailInput').value = client.email || '';
    document.getElementById('clientNotesInput').value = client.notes || '';
    document.getElementById('clientInitialBalanceGroup').style.display = 'none';

    openModal('clientModal');
  }

  function handleSaveClient(e) {
    e.preventDefault();
    const editId = document.getElementById('clientEditId').value;
    const name = document.getElementById('clientNameInput').value.trim();
    const rate = parseFloat(document.getElementById('clientRateInput').value) || 35;
    const level = document.getElementById('clientLevelSelect').value;
    const phone = document.getElementById('clientPhoneInput').value.trim();
    const email = document.getElementById('clientEmailInput').value.trim();
    const notes = document.getElementById('clientNotesInput').value.trim();
    const initialDebt = parseFloat(document.getElementById('clientInitialBalanceInput').value) || 0;

    if (!name) {
      showToast('Client name is required.', 'danger');
      return;
    }

    if (editId) {
      const client = students.find(s => s.id === editId);
      if (client) {
        client.name = name;
        client.rate = rate;
        client.level = level;
        client.phone = phone;
        client.email = email;
        client.notes = notes;
        showToast(`Updated client ${name}`, 'success');
      }
    } else {
      const newClient = {
        id: 'cli_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name,
        rate,
        level,
        phone,
        email,
        notes,
        createdAt: new Date().toISOString()
      };
      students.push(newClient);

      if (initialDebt !== 0) {
        transactions.push({
          id: 'tx_init_' + Date.now(),
          studentId: newClient.id,
          type: initialDebt > 0 ? 'initial_balance' : 'payment',
          amount: Math.abs(initialDebt),
          date: getFormattedDate(new Date()),
          notes: 'Starting balance',
          createdAt: new Date().toISOString()
        });
      }
      showToast(`Added client "${name}"`, 'success');
    }

    saveToLocalStorage();
    renderAll();
    closeModal('clientModal');
  }

  // 3. Delete Client
  function openDeleteClientModal(clientId, clientName) {
    studentPendingDeleteId = clientId;
    document.getElementById('deleteClientName').textContent = clientName || 'this client';
    openModal('deleteModal');
  }

  function handleConfirmDeleteClient() {
    if (!studentPendingDeleteId) return;

    const idx = students.findIndex(s => s.id === studentPendingDeleteId);
    if (idx > -1) {
      const removedName = students[idx].name;
      students.splice(idx, 1);
      transactions = transactions.filter(t => t.studentId !== studentPendingDeleteId);
      saveToLocalStorage();
      renderAll();
      showToast(`Removed client "${removedName}"`, 'info');
    }
    studentPendingDeleteId = null;
    closeModal('deleteModal');
  }

  // 4. Log Payment
  function openPaymentModal(preselectedClientId = null) {
    if (students.length === 0) {
      showToast('Please add a client first before logging payment.', 'info');
      openAddClientModal();
      return;
    }

    populateClientDropdowns();
    const sel = document.getElementById('paymentClientSelect');
    if (preselectedClientId && sel) sel.value = preselectedClientId;

    document.getElementById('paymentDateInput').value = getFormattedDate(new Date());
    document.getElementById('paymentNotesInput').value = '';

    const curId = sel ? sel.value : null;
    if (curId) {
      const fin = calculateStudentFinances(curId);
      const amtInput = document.getElementById('paymentAmountInput');
      if (amtInput) amtInput.value = fin.balance > 0 ? fin.balance.toFixed(2) : '';
    }

    openModal('paymentModal');
  }

  function handleSavePayment(e) {
    e.preventDefault();
    const clientId = document.getElementById('paymentClientSelect').value;
    const date = document.getElementById('paymentDateInput').value;
    const amount = parseFloat(document.getElementById('paymentAmountInput').value);
    const method = document.getElementById('paymentMethodSelect').value;
    const notes = document.getElementById('paymentNotesInput').value.trim();

    if (!clientId || isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid payment amount.', 'danger');
      return;
    }

    const client = students.find(s => s.id === clientId);

    transactions.push({
      id: 'tx_pay_' + Date.now(),
      studentId: clientId,
      type: 'payment',
      amount,
      method,
      notes,
      date: date || getFormattedDate(new Date()),
      createdAt: new Date().toISOString()
    });

    saveToLocalStorage();
    renderAll();
    closeModal('paymentModal');
    showToast(`Recorded payment of ${formatEuro(amount)} from ${client ? client.name : 'client'}`, 'success');
  }

  // 5. Client Ledger History
  let currentHistoryTab = 'all';

  function openHistoryModal(clientId) {
    const client = students.find(s => s.id === clientId);
    if (!client) return;

    activeStudentForLedger = client;
    currentHistoryTab = 'all';

    document.getElementById('historyClientName').textContent = `${client.name}'s Ledger`;
    document.getElementById('historyClientMeta').textContent = `${client.level || 'General English'} • ${formatEuro(client.rate || 0)}/hr`;

    document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
    const tabAll = document.getElementById('historyTabAll');
    if (tabAll) tabAll.classList.add('active');

    renderHistoryModalContent();
    openModal('historyModal');
  }

  function renderHistoryModalContent() {
    if (!activeStudentForLedger) return;
    const client = activeStudentForLedger;
    const fin = calculateStudentFinances(client.id);

    const balEl = document.getElementById('historyCurrentBalance');
    if (balEl) {
      balEl.textContent = formatEuro(fin.balance);
      balEl.className = 'strip-val font-bold ' + (fin.balance > 0 ? 'text-danger' : (fin.balance < 0 ? 'text-credit' : 'text-success'));
    }

    const hoursEl = document.getElementById('historyTotalHours');
    if (hoursEl) hoursEl.textContent = `${fin.totalHours} hrs (${fin.sessionCount} lessons)`;

    const billedEl = document.getElementById('historyTotalBilled');
    if (billedEl) billedEl.textContent = formatEuro(fin.totalBilled);

    const paidEl = document.getElementById('historyTotalPaid');
    if (paidEl) paidEl.textContent = formatEuro(fin.totalPaid);

    let clientTx = transactions.filter(t => t.studentId === client.id);
    if (currentHistoryTab === 'lessons') {
      clientTx = clientTx.filter(t => t.type === 'lesson' || t.type === 'initial_balance');
    } else if (currentHistoryTab === 'payments') {
      clientTx = clientTx.filter(t => t.type === 'payment');
    }

    clientTx.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

    const timeline = document.getElementById('historyTimelineList');
    if (!timeline) return;

    if (clientTx.length === 0) {
      timeline.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">No records in this category.</div>`;
      return;
    }

    timeline.innerHTML = clientTx.map(tx => {
      const isLesson = tx.type === 'lesson' || tx.type === 'initial_balance';
      const badgeIcon = isLesson
        ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
        : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      const badgeClass = isLesson ? 'lesson-badge' : 'payment-badge';

      let title = isLesson ? (tx.topic || 'English Lesson') : `Payment (${escapeHtml(tx.method || 'Cash')})`;
      let meta = `Date: ${escapeHtml(tx.date || 'N/A')}`;
      if (tx.hours) meta += ` • ${tx.hours} hours`;
      if (tx.notes) meta += ` • <em>${escapeHtml(tx.notes)}</em>`;

      const amountFormatted = (isLesson ? '+ ' : '- ') + formatEuro(tx.amount || 0);
      const amountClass = isLesson ? 'text-danger' : 'text-success';

      return `
        <div class="timeline-item">
          <div class="timeline-left">
            <div class="timeline-icon-badge ${badgeClass}">
              ${badgeIcon}
            </div>
            <div>
              <div class="timeline-title">${escapeHtml(title)}</div>
              <div class="timeline-meta">${meta}</div>
            </div>
          </div>
          <div class="timeline-right">
            <span class="timeline-amount ${amountClass}">${amountFormatted}</span>
            <button class="timeline-delete-btn" data-tx-id="${tx.id}" title="Delete record">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    timeline.querySelectorAll('.timeline-delete-btn').forEach(b => {
      b.addEventListener('click', (e) => {
        deleteTransaction(e.currentTarget.getAttribute('data-tx-id'));
        renderHistoryModalContent();
      });
    });
  }

  // 6. WhatsApp / Reminder Modal (Euro Only)
  function openReminderModal(clientId) {
    const client = students.find(s => s.id === clientId);
    if (!client) return;

    activeStudentForReminder = client;
    const fin = calculateStudentFinances(client.id);

    document.getElementById('reminderClientName').textContent = client.name;
    document.getElementById('reminderTemplateSelect').value = 'friendly';

    generateReminderMessage(client, fin, 'friendly');
    openModal('reminderModal');
  }

  function generateReminderMessage(client, fin, tone) {
    const firstName = client.name.split(' ')[0] || client.name;
    const formattedAmount = formatEuro(fin.balance);
    const hoursCount = fin.totalHours || 1.0;

    let msg = '';
    if (tone === 'polite_formal') {
      msg = `Dear ${firstName},\n\nI hope you are having a pleasant week. This is an update regarding our private English lessons. You currently have an unpaid balance of ${formattedAmount} for our completed sessions (${hoursCount} hours).\n\nPlease arrange payment at your convenience via bank transfer / SEPA. Thank you very much for your dedication in class!\n\nBest regards,\nYour English Teacher`;
    } else if (tone === 'short') {
      msg = `Hi ${firstName}! Quick reminder: your outstanding balance for our English lessons is ${formattedAmount}. Let me know once sent. Thank you! 📚`;
    } else {
      // Friendly
      msg = `Hi ${firstName}! 👋 Hope you're doing great!\n\nJust a gentle note regarding our recent English sessions (${hoursCount} hours total) — your current balance is ${formattedAmount}. Whenever you get a moment, feel free to settle it.\n\nLooking forward to our next class! 📚✨`;
    }

    const textarea = document.getElementById('reminderMessageText');
    if (textarea) textarea.value = msg;

    const waLink = document.getElementById('whatsappSendLink');
    if (waLink) {
      const cleanPhone = (client.phone || '').replace(/[^\d]/g, '');
      const encodedMsg = encodeURIComponent(msg);
      waLink.href = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodedMsg}` : `https://wa.me/?text=${encodedMsg}`;
    }
  }

  // ==========================================
  // SAMPLE DATA
  // ==========================================

  function loadSampleDataset(showToastNotif = true) {
    const today = new Date();
    const getDaysOffset = (offset) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return getFormattedDate(d);
    };

    const demoClients = [
      {
        id: 'cli_1',
        name: 'Elena Rostova',
        rate: 35,
        level: 'IELTS Preparation',
        phone: '+34 611 234 567',
        email: 'elena.rostova@example.com',
        notes: 'Targeting Band 7.5 in Academic IELTS. Focus on Task 2 writing.',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cli_2',
        name: 'Kenji Takahashi',
        rate: 40,
        level: 'Business English',
        phone: '+34 622 345 678',
        email: 'kenji.takahashi@example.com',
        notes: 'Executive presentations and board meeting roleplay.',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cli_3',
        name: 'Sophie Dupont',
        rate: 30,
        level: 'Conversational / Fluency',
        phone: '+34 633 456 789',
        email: 'sophie.dupont@example.com',
        notes: 'Casual discussion, phrasal verbs and British idioms.',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cli_4',
        name: 'Mateo Silva',
        rate: 32,
        level: 'Intermediate (B1-B2)',
        phone: '+34 644 567 890',
        email: 'mateo.silva@example.com',
        notes: 'Prepaid monthly bundle for B2 First certificate.',
        createdAt: new Date().toISOString()
      }
    ];

    const demoSessions = [
      // Elena: 3 sessions billed = €122.50, 0 paid => Owes €122.50
      { id: 'tx_e1', studentId: 'cli_1', type: 'lesson', hours: 1.5, amount: 52.5, topic: 'IELTS Task 2 Essay Structure', date: getDaysOffset(-5), isPaid: false, createdAt: new Date().toISOString() },
      { id: 'tx_e2', studentId: 'cli_1', type: 'lesson', hours: 1.0, amount: 35.0, topic: 'Speaking Part 2 Simulation', date: getDaysOffset(-2), isPaid: false, createdAt: new Date().toISOString() },
      { id: 'tx_e3', studentId: 'cli_1', type: 'lesson', hours: 1.0, amount: 35.0, topic: 'Vocabulary: Environment & Technology', date: getDaysOffset(0), isPaid: false, createdAt: new Date().toISOString() },

      // Kenji: 2 sessions billed = €80.00, 0 paid => Owes €80.00
      { id: 'tx_k1', studentId: 'cli_2', type: 'lesson', hours: 1.0, amount: 40.0, topic: 'Contract Negotiations & Nuances', date: getDaysOffset(-4), isPaid: false, createdAt: new Date().toISOString() },
      { id: 'tx_k2', studentId: 'cli_2', type: 'lesson', hours: 1.0, amount: 40.0, topic: 'Pitch Deck Delivery Drill', date: getDaysOffset(0), isPaid: false, createdAt: new Date().toISOString() },

      // Sophie: 2 sessions billed = €60.00, paid €60.00 => Settled Up (€0)
      { id: 'tx_s1', studentId: 'cli_3', type: 'lesson', hours: 1.0, amount: 30.0, topic: 'Travel & Dining Idioms', date: getDaysOffset(-8), isPaid: true, createdAt: new Date().toISOString() },
      { id: 'tx_s2', studentId: 'cli_3', type: 'lesson', hours: 1.0, amount: 30.0, topic: 'Pronunciation & Connected Speech', date: getDaysOffset(-3), isPaid: true, createdAt: new Date().toISOString() },
      { id: 'tx_sp1', studentId: 'cli_3', type: 'payment', amount: 60.0, method: 'Bizum / Revolut', notes: 'Settled 2 sessions', date: getDaysOffset(-3), createdAt: new Date().toISOString() },

      // Mateo: 1 session billed = €32.00, paid €96.00 => Credit €64.00
      { id: 'tx_m1', studentId: 'cli_4', type: 'lesson', hours: 1.0, amount: 32.0, topic: 'Conditionals & Modals Review', date: getDaysOffset(-6), isPaid: true, createdAt: new Date().toISOString() },
      { id: 'tx_mp1', studentId: 'cli_4', type: 'payment', amount: 96.0, method: 'Bank Transfer / SEPA', notes: 'Prepaid 3 sessions in advance', date: getDaysOffset(-7), createdAt: new Date().toISOString() }
    ];

    students = demoClients;
    transactions = demoSessions;
    selectedDateStr = getDaysOffset(0);

    saveToLocalStorage();
    renderAll();

    if (showToastNotif) {
      showToast('Loaded sample clients and calendar sessions in Euros (€)!', 'success');
    }
  }

  function exportDataAsJSON() {
    const payload = {
      version: '2.0-euro',
      currency: 'EUR',
      exportedAt: new Date().toISOString(),
      students,
      transactions
    };
    const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', jsonStr);
    dl.setAttribute('download', `lingoledger_euro_backup_${getFormattedDate(new Date())}.json`);
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
    showToast('Exported backup file (JSON)', 'success');
  }

  function exportDataAsCSV() {
    let csv = 'data:text/csv;charset=utf-8,';
    csv += 'Client Name,Level,Hourly Rate (€),Total Hours Done,Balance Owed (€),Total Paid (€),Phone,Email,Notes\n';
    students.forEach(s => {
      const fin = calculateStudentFinances(s.id);
      const row = [
        `"${(s.name || '').replace(/"/g, '""')}"`,
        `"${(s.level || '').replace(/"/g, '""')}"`,
        s.rate || 35,
        fin.totalHours,
        fin.balance,
        fin.totalPaid,
        `"${(s.phone || '').replace(/"/g, '""')}"`,
        `"${(s.email || '').replace(/"/g, '""')}"`,
        `"${(s.notes || '').replace(/"/g, '""')}"`
      ];
      csv += row.join(',') + '\n';
    });
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `lingoledger_clients_${getFormattedDate(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Exported clients roster as CSV', 'success');
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data.students) && Array.isArray(data.transactions)) {
          students = data.students;
          transactions = data.transactions;
          saveToLocalStorage();
          renderAll();
          showToast(`Restored ${students.length} clients from backup!`, 'success');
        } else {
          showToast('Invalid backup file structure.', 'danger');
        }
      } catch (err) {
        showToast('Error reading backup file.', 'danger');
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (confirm('Are you sure you want to erase ALL clients, calendar hours, and balances?')) {
      students = [];
      transactions = [];
      saveToLocalStorage();
      renderAll();
      showToast('All data cleared.', 'info');
    }
  }

  // ==========================================
  // CLOUD SPREADSHEET & EXCEL API
  // ==========================================

  function updateCloudSyncUI(state) {
    const pill = document.getElementById('cloudSyncBtn');
    const label = pill ? pill.querySelector('.cloud-sync-label') : null;

    const banner = document.getElementById('cloudStatusBanner');
    const statusEmoji = document.getElementById('cloudStatusEmoji');
    const statusTitle = document.getElementById('cloudStatusTitle');
    const statusDesc = document.getElementById('cloudStatusDesc');
    const linksRow = document.getElementById('cloudLinksRow');
    const openSheetLink = document.getElementById('openGoogleSheetLink');
    const dlExcelLink = document.getElementById('downloadExcelLink');
    const urlInput = document.getElementById('appsScriptUrlInput');

    if (urlInput && !urlInput.value && cloudSettings.webAppUrl) {
      urlInput.value = cloudSettings.webAppUrl;
    }

    const currentState = state || (cloudSettings.webAppUrl ? 'linked' : 'unlinked');

    if (pill) {
      pill.className = `cloud-sync-pill ${currentState}`;
      if (currentState === 'linked') {
        if (label) label.textContent = 'Cloud Synced';
        pill.title = 'Connected to Google Sheets & Excel Cloud API';
      } else if (currentState === 'syncing') {
        if (label) label.textContent = 'Syncing...';
      } else if (currentState === 'error') {
        if (label) label.textContent = 'Sync Error';
      } else {
        if (label) label.textContent = 'Cloud Sheet';
        pill.title = 'Connect Google Sheets & Excel Cloud API';
      }
    }

    if (banner) {
      banner.className = `cloud-status-banner ${currentState}`;
      if (currentState === 'linked') {
        if (statusEmoji) statusEmoji.textContent = '🟢';
        if (statusTitle) statusTitle.textContent = 'Connected & Synced with Google Cloud';
        const lastTime = cloudSettings.lastSynced ? new Date(cloudSettings.lastSynced).toLocaleTimeString() : 'Just now';
        if (statusDesc) statusDesc.textContent = `All clients, hours taught, debts, and Euro balances are automatically synced. Last sync: ${lastTime}`;
        if (linksRow) linksRow.classList.remove('hidden');
        if (openSheetLink && cloudSettings.spreadsheetUrl) openSheetLink.href = cloudSettings.spreadsheetUrl;
        if (dlExcelLink && cloudSettings.excelExportUrl) dlExcelLink.href = cloudSettings.excelExportUrl;
      } else if (currentState === 'syncing') {
        if (statusEmoji) statusEmoji.textContent = '🔄';
        if (statusTitle) statusTitle.textContent = 'Synchronizing with Google Cloud...';
        if (statusDesc) statusDesc.textContent = 'Saving client records, lesson sessions, and balance sheets...';
      } else if (currentState === 'error') {
        if (statusEmoji) statusEmoji.textContent = '⚠️';
        if (statusTitle) statusTitle.textContent = 'Connection or Permission Issue';
        if (statusDesc) statusDesc.textContent = 'Unable to reach the Google Apps Script Web App. Please ensure "Who has access: Anyone" is selected in your deployment.';
      } else {
        if (statusEmoji) statusEmoji.textContent = '⚪';
        if (statusTitle) statusTitle.textContent = 'Not Connected to Google Sheets';
        if (statusDesc) statusDesc.textContent = 'Paste your deployed Google Apps Script Web App URL below to enable permanent, automatic cloud storage.';
        if (linksRow) linksRow.classList.add('hidden');
      }
    }
  }

  async function syncToCloud(action = 'syncAll', customPayload = null, showFeedback = true) {
    if (!cloudSettings.webAppUrl) return null;
    try {
      updateCloudSyncUI('syncing');
      const payload = customPayload || {
        action: action,
        students: students,
        transactions: transactions
      };

      // Send as text/plain to avoid browser CORS OPTIONS preflight check
      const res = await fetch(cloudSettings.webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data && data.status === 'success') {
        cloudSettings.lastSynced = new Date().toISOString();
        if (data.spreadsheetUrl) cloudSettings.spreadsheetUrl = data.spreadsheetUrl;
        if (data.excelExportUrl) cloudSettings.excelExportUrl = data.excelExportUrl;
        saveCloudSettings();
        updateCloudSyncUI('linked');
        if (showFeedback) {
          showToast('Synced with Google Sheet & Excel Cloud!', 'success');
        }
        return data;
      } else {
        throw new Error((data && data.message) || 'Sync returned error');
      }
    } catch (err) {
      console.warn('Cloud sync error:', err);
      updateCloudSyncUI('error');
      if (showFeedback) {
        showToast('Could not sync to cloud: ' + err.message, 'danger');
      }
      return null;
    }
  }

  async function fetchFromCloud(showFeedback = true) {
    if (!cloudSettings.webAppUrl) return null;
    try {
      updateCloudSyncUI('syncing');
      const sep = cloudSettings.webAppUrl.includes('?') ? '&' : '?';
      const res = await fetch(`${cloudSettings.webAppUrl}${sep}action=read&t=${Date.now()}`);
      const data = await res.json();

      if (data && data.status === 'success') {
        if (Array.isArray(data.students) && data.students.length > 0) {
          students = data.students;
        }
        if (Array.isArray(data.transactions) && data.transactions.length > 0) {
          transactions = data.transactions;
        }
        if (data.spreadsheetUrl) cloudSettings.spreadsheetUrl = data.spreadsheetUrl;
        if (data.excelExportUrl) cloudSettings.excelExportUrl = data.excelExportUrl;
        cloudSettings.lastSynced = new Date().toISOString();

        saveToLocalStorage();
        saveCloudSettings();
        renderAll();
        updateCloudSyncUI('linked');
        if (showFeedback) {
          showToast('Updated data from Google Cloud Sheet!', 'success');
        }
        return data;
      } else {
        throw new Error((data && data.message) || 'Read failed');
      }
    } catch (err) {
      console.warn('Fetch from cloud error:', err);
      updateCloudSyncUI('error');
      if (showFeedback) {
        showToast('Could not fetch from cloud spreadsheet.', 'danger');
      }
      return null;
    }
  }

  async function testAndConnectCloud() {
    const input = document.getElementById('appsScriptUrlInput');
    const url = input ? input.value.trim() : '';

    if (!url) {
      showToast('Please paste a valid Apps Script Web App URL.', 'danger');
      return;
    }

    if (!url.startsWith('https://script.google.com/')) {
      showToast('URL must start with https://script.google.com/macros/s/...', 'danger');
      return;
    }

    cloudSettings.webAppUrl = url;
    saveCloudSettings();
    updateCloudSyncUI('syncing');

    showToast('Testing connection to Google Apps Script...', 'info');

    try {
      const sep = url.includes('?') ? '&' : '?';
      const testRes = await fetch(`${url}${sep}action=test&t=${Date.now()}`);
      const testData = await testRes.json();

      if (testData && testData.status === 'success') {
        if (testData.spreadsheetUrl) cloudSettings.spreadsheetUrl = testData.spreadsheetUrl;
        if (testData.excelExportUrl) cloudSettings.excelExportUrl = testData.excelExportUrl;
        
        // Push local data so the spreadsheet is initialized immediately
        await syncToCloud('syncAll', null, false);

        cloudSettings.lastSynced = new Date().toISOString();
        saveCloudSettings();
        updateCloudSyncUI('linked');
        showToast('Successfully connected to Google Sheet & Excel Cloud!', 'success');
      } else {
        throw new Error('Script did not return success');
      }
    } catch (e) {
      console.warn('Connection test error:', e);
      // Try syncAll directly as fallback
      const syncResult = await syncToCloud('syncAll', null, false);
      if (syncResult) {
        showToast('Successfully connected and synced data!', 'success');
      } else {
        updateCloudSyncUI('error');
        showToast('Connection failed. Make sure deployment is set to "Anyone".', 'danger');
      }
    }
  }

  function exportToExcelWorkbook() {
    try {
      if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();

        // 1. Clients & Balances Sheet
        const clientHeaders = [
          'Client ID', 'Client Name', 'Rate (€/hr)', 'Level / Course', 'Phone', 'Email',
          'Hours Taught', 'Billed (€)', 'Paid (€)', 'Balance Due (€)', 'Status', 'Notes'
        ];
        const clientRows = students.map(s => {
          const fin = calculateStudentFinances(s.id);
          const statusStr = fin.balance > 0.01 
            ? `OWES €${fin.balance.toFixed(2)}` 
            : (fin.balance < -0.01 ? `CREDIT €${Math.abs(fin.balance).toFixed(2)}` : 'SETTLED');
          return [
            s.id,
            s.name,
            s.rate || 0,
            s.level || '',
            s.phone || '',
            s.email || '',
            Number(fin.totalHours.toFixed(1)),
            Number(fin.totalBilled.toFixed(2)),
            Number(fin.totalPaid.toFixed(2)),
            Number(fin.balance.toFixed(2)),
            statusStr,
            s.notes || ''
          ];
        });
        const wsClients = XLSX.utils.aoa_to_sheet([clientHeaders, ...clientRows]);
        XLSX.utils.book_append_sheet(wb, wsClients, 'Clients & Balances');

        // 2. Lessons & Transactions Sheet
        const txHeaders = [
          'Transaction ID', 'Date', 'Client Name', 'Client ID', 'Type', 'Hours',
          'Rate (€/hr)', 'Amount (€)', 'Status', 'Topic / Notes', 'Method'
        ];
        const txRows = transactions.map(t => {
          const s = students.find(st => st.id === t.studentId);
          const isPay = (t.type === 'payment');
          return [
            t.id,
            t.date || '',
            s ? s.name : t.studentId,
            t.studentId,
            isPay ? 'Payment' : 'Lesson',
            isPay ? '' : (t.hours || 0),
            isPay ? '' : (t.amount && t.hours ? Number((t.amount / t.hours).toFixed(2)) : ''),
            Number((t.amount || 0).toFixed(2)),
            isPay ? 'PAID' : (t.isPaid ? 'PAID' : 'UNPAID'),
            t.topic || t.notes || '',
            t.method || ''
          ];
        });
        const wsTx = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]);
        XLSX.utils.book_append_sheet(wb, wsTx, 'Lessons & Payments');

        // Trigger native Excel download
        XLSX.writeFile(wb, `LingoLedger_Tutor_Excel_${getFormattedDate(new Date())}.xlsx`);
        showToast('Downloaded Microsoft Excel (.xlsx) file!', 'success');
      } else {
        exportDataAsCSV();
      }
    } catch (err) {
      console.error('Error generating Excel file:', err);
      exportDataAsCSV();
    }
  }

  // ==========================================
  // THEME & TOAST SYSTEM
  // ==========================================

  function setupTheme() {
    const saved = appSettings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    appSettings.theme = next;
    saveToLocalStorage();
  }

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'danger') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(msg)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 180ms ease';
      setTimeout(() => toast.remove(), 200);
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================
  // EVENT LISTENERS & SETUP
  // ==========================================

  function setupEventListeners() {
    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // View switchers (Desktop Pill)
    const viewCalBtn = document.getElementById('viewCalendarBtn');
    if (viewCalBtn) viewCalBtn.addEventListener('click', () => switchView('calendar'));

    const viewClientsBtn = document.getElementById('viewClientsBtn');
    if (viewClientsBtn) viewClientsBtn.addEventListener('click', () => switchView('clients'));

    // Mobile Bottom Nav Switchers
    const mobCal = document.getElementById('mobileNavCalendar');
    if (mobCal) mobCal.addEventListener('click', () => switchView('calendar'));

    const mobClients = document.getElementById('mobileNavClients');
    if (mobClients) mobClients.addEventListener('click', () => switchView('clients'));

    // Mobile Center Add Hours button
    const mobAddHours = document.getElementById('mobileNavAddHours');
    if (mobAddHours) mobAddHours.addEventListener('click', () => openAddHoursModal(selectedDateStr));

    // Desktop primary add hours
    const primaryAddHoursBtn = document.getElementById('primaryAddHoursBtn');
    if (primaryAddHoursBtn) primaryAddHoursBtn.addEventListener('click', () => openAddHoursModal(selectedDateStr));

    const inspectorAddHoursBtn = document.getElementById('inspectorAddHoursBtn');
    if (inspectorAddHoursBtn) inspectorAddHoursBtn.addEventListener('click', () => openAddHoursModal(selectedDateStr));

    // Calendar navigation with smooth sliding
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', () => renderCalendar(-1));
    }

    const nextMonthBtn = document.getElementById('nextMonthBtn');
    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', () => renderCalendar(1));
    }

    const todayBtn = document.getElementById('todayBtn');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const todayObj = new Date();
        const diff = (todayObj.getFullYear() * 12 + todayObj.getMonth()) - (calYear * 12 + calMonth);
        calYear = todayObj.getFullYear();
        calMonth = todayObj.getMonth();
        selectedDateStr = getFormattedDate(todayObj);
        renderCalendar(diff !== 0 ? (diff > 0 ? 1 : -1) : null);
      });
    }

    // Modal forms & fee calculations
    const hoursClientSelect = document.getElementById('hoursClientSelect');
    if (hoursClientSelect) hoursClientSelect.addEventListener('change', recalculateHoursFee);

    const hoursDurationSelect = document.getElementById('hoursDurationSelect');
    if (hoursDurationSelect) hoursDurationSelect.addEventListener('change', recalculateHoursFee);

    const addHoursForm = document.getElementById('addHoursForm');
    if (addHoursForm) addHoursForm.addEventListener('submit', handleSaveHours);

    const clientForm = document.getElementById('clientForm');
    if (clientForm) clientForm.addEventListener('submit', handleSaveClient);

    const paymentForm = document.getElementById('paymentForm');
    if (paymentForm) paymentForm.addEventListener('submit', handleSavePayment);

    // Clients View Actions
    const addNewClientBtn = document.getElementById('addNewClientBtn');
    if (addNewClientBtn) addNewClientBtn.addEventListener('click', openAddClientModal);

    const emptyClientsAddBtn = document.getElementById('emptyClientsAddBtn');
    if (emptyClientsAddBtn) emptyClientsAddBtn.addEventListener('click', openAddClientModal);

    const recordPaymentGlobalBtn = document.getElementById('recordPaymentGlobalBtn');
    if (recordPaymentGlobalBtn) recordPaymentGlobalBtn.addEventListener('click', () => openPaymentModal());

    // Client Filter tabs
    document.querySelectorAll('[data-client-filter]').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('[data-client-filter]').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        clientFilter = e.currentTarget.getAttribute('data-client-filter');
        renderClientsView();
      });
    });

    // Client Search
    const clientSearchInput = document.getElementById('clientSearchInput');
    const clearClientSearchBtn = document.getElementById('clearClientSearchBtn');
    if (clientSearchInput) {
      clientSearchInput.addEventListener('input', (e) => {
        clientSearchQuery = e.target.value;
        if (clearClientSearchBtn) {
          clearClientSearchBtn.classList.toggle('hidden', !clientSearchQuery);
        }
        renderClientsView();
      });
    }

    if (clearClientSearchBtn) {
      clearClientSearchBtn.addEventListener('click', () => {
        if (clientSearchInput) clientSearchInput.value = '';
        clientSearchQuery = '';
        clearClientSearchBtn.classList.add('hidden');
        renderClientsView();
      });
    }

    // Ledger History Controls
    const historyAddLessonBtn = document.getElementById('historyAddLessonBtn');
    if (historyAddLessonBtn) {
      historyAddLessonBtn.addEventListener('click', () => {
        if (activeStudentForLedger) openAddHoursModal(selectedDateStr, activeStudentForLedger.id);
      });
    }

    const historyAddPaymentBtn = document.getElementById('historyAddPaymentBtn');
    if (historyAddPaymentBtn) {
      historyAddPaymentBtn.addEventListener('click', () => {
        if (activeStudentForLedger) openPaymentModal(activeStudentForLedger.id);
      });
    }

    document.querySelectorAll('.history-tab').forEach(t => {
      t.addEventListener('click', (e) => {
        document.querySelectorAll('.history-tab').forEach(tab => tab.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentHistoryTab = e.currentTarget.getAttribute('data-tab');
        renderHistoryModalContent();
      });
    });

    // Reminder Template Picker
    const reminderTemplateSelect = document.getElementById('reminderTemplateSelect');
    if (reminderTemplateSelect) {
      reminderTemplateSelect.addEventListener('change', (e) => {
        if (activeStudentForReminder) {
          const fin = calculateStudentFinances(activeStudentForReminder.id);
          generateReminderMessage(activeStudentForReminder, fin, e.target.value);
        }
      });
    }

    // Copy Reminder
    const copyReminderBtn = document.getElementById('copyReminderBtn');
    if (copyReminderBtn) {
      copyReminderBtn.addEventListener('click', () => {
        const text = document.getElementById('reminderMessageText').value;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Reminder copied to clipboard!', 'success');
          }).catch(() => {
            showToast('Could not copy automatically.', 'info');
          });
        }
      });
    }

    // Confirm Delete Client
    const confirmDeleteClientBtn = document.getElementById('confirmDeleteClientBtn');
    if (confirmDeleteClientBtn) {
      confirmDeleteClientBtn.addEventListener('click', handleConfirmDeleteClient);
    }

    // Modal Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(b => {
      b.addEventListener('click', (e) => {
        closeModal(e.currentTarget.getAttribute('data-close-modal'));
      });
    });

    // Background overlay click to close
    document.querySelectorAll('.modal-overlay').forEach(ov => {
      ov.addEventListener('click', (e) => {
        if (e.target === ov) closeModal(ov.id);
      });
    });

    // Options dropdown
    const optionsBtn = document.getElementById('optionsDropdownBtn');
    const optionsMenu = document.getElementById('optionsDropdownMenu');
    if (optionsBtn && optionsMenu) {
      optionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        optionsMenu.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!optionsBtn.contains(e.target) && !optionsMenu.contains(e.target)) {
          optionsMenu.classList.add('hidden');
        }
      });
    }

    // Backup & Demo menu items
    const loadSampleDataBtn = document.getElementById('loadSampleDataBtn');
    if (loadSampleDataBtn) {
      loadSampleDataBtn.addEventListener('click', () => {
        loadSampleDataset(true);
        if (optionsMenu) optionsMenu.classList.add('hidden');
      });
    }

    // Cloud Sync Modal & Actions
    const cloudSyncBtn = document.getElementById('cloudSyncBtn');
    if (cloudSyncBtn) cloudSyncBtn.addEventListener('click', () => openModal('cloudSyncModal'));

    const openCloudModalFromMenu = document.getElementById('openCloudModalFromMenu');
    if (openCloudModalFromMenu) {
      openCloudModalFromMenu.addEventListener('click', () => {
        openModal('cloudSyncModal');
        if (optionsMenu) optionsMenu.classList.add('hidden');
      });
    }

    const saveAndTestCloudBtn = document.getElementById('saveAndTestCloudBtn');
    if (saveAndTestCloudBtn) saveAndTestCloudBtn.addEventListener('click', testAndConnectCloud);

    const pushToCloudBtn = document.getElementById('pushToCloudBtn');
    if (pushToCloudBtn) pushToCloudBtn.addEventListener('click', () => syncToCloud('syncAll', null, true));

    const pullFromCloudBtn = document.getElementById('pullFromCloudBtn');
    if (pullFromCloudBtn) pullFromCloudBtn.addEventListener('click', () => fetchFromCloud(true));

    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportExcelBtn) {
      exportExcelBtn.addEventListener('click', () => {
        exportToExcelWorkbook();
        if (optionsMenu) optionsMenu.classList.add('hidden');
      });
    }

    const directExcelExportBtn = document.getElementById('directExcelExportBtn');
    if (directExcelExportBtn) directExcelExportBtn.addEventListener('click', exportToExcelWorkbook);

    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) exportDataBtn.addEventListener('click', exportDataAsJSON);

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportDataAsCSV);

    const importFileInput = document.getElementById('importFileInput');
    if (importFileInput) {
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleImportFile(file);
        e.target.value = '';
        if (optionsMenu) optionsMenu.classList.add('hidden');
      });
    }

    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    if (clearAllDataBtn) {
      clearAllDataBtn.addEventListener('click', () => {
        clearAllData();
        if (optionsMenu) optionsMenu.classList.add('hidden');
      });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => closeModal(m.id));
        if (optionsMenu) optionsMenu.classList.add('hidden');
      } else if (e.key === 'ArrowLeft' && currentView === 'calendar' && !document.querySelector('.modal-overlay:not(.hidden)')) {
        renderCalendar(-1);
      } else if (e.key === 'ArrowRight' && currentView === 'calendar' && !document.querySelector('.modal-overlay:not(.hidden)')) {
        renderCalendar(1);
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
