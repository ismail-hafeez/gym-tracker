/**
 * Gym Tracker - Calendar & Main App Logic
 * Manages state, calendar grid rendering, navigation, and streak counter.
 */

// Global App State
const AppState = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1, // 1 - 12
  workoutsCache: new Map(), // date (YYYY-MM-DD) -> workout summary object
  analyticsLoaded: false
};

// Muscle group color map matching design system
const MUSCLE_COLORS = {
  'Back': '#00d4ff',
  'Arms': '#7b2ff7',
  'Legs': '#00c853',
  'Chest+Shoulder': '#ff6b35',
  'Shoulder+Chest': '#ff2d7b',
  'Rest Day': '#6b7280'
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Toast notification helper
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-circle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Helper to format date strings
 * API expects: YYYY-MM-DD
 * Display format: DD/MM/YYYY
 */
function formatDateForDisplay(dateString) {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
}

function formatDateISO(year, month, day) {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Updates streak badge in the header from API summary
 */
async function updateStreak() {
  try {
    const summary = await API.getSummary();
    if (summary) {
      const streakEl = document.getElementById('streak-count');
      if (streakEl) {
        streakEl.textContent = summary.current_streak || summary.streak || 0;
      }
    }
  } catch (err) {
    // Graceful fallback if analytics/summary endpoint is not yet seeded
    console.warn('Could not fetch streak summary:', err.message);
  }
}

/**
 * Tab switching between Calendar and Analytics
 */
function setupTabs() {
  const calendarTab = document.getElementById('tab-calendar');
  const analyticsTab = document.getElementById('tab-analytics');
  const calendarSection = document.getElementById('calendar-section');
  const analyticsSection = document.getElementById('analytics-section');

  function switchTab(target) {
    if (target === 'calendar-section') {
      calendarTab.classList.add('active');
      calendarTab.setAttribute('aria-selected', 'true');
      analyticsTab.classList.remove('active');
      analyticsTab.setAttribute('aria-selected', 'false');

      calendarSection.classList.remove('hidden-section');
      analyticsSection.classList.add('hidden-section');
    } else {
      analyticsTab.classList.add('active');
      analyticsTab.setAttribute('aria-selected', 'true');
      calendarTab.classList.remove('active');
      calendarTab.setAttribute('aria-selected', 'false');

      analyticsSection.classList.remove('hidden-section');
      calendarSection.classList.add('hidden-section');

      // Initialize analytics on switch
      if (window.AnalyticsModule && typeof window.AnalyticsModule.initAnalytics === 'function') {
        window.AnalyticsModule.initAnalytics();
      }
    }
  }

  calendarTab.addEventListener('click', () => switchTab('calendar-section'));
  analyticsTab.addEventListener('click', () => switchTab('analytics-section'));
}

/**
 * Month navigation handler
 */
function navigateMonth(delta) {
  AppState.currentMonth += delta;
  if (AppState.currentMonth > 12) {
    AppState.currentMonth = 1;
    AppState.currentYear += 1;
  } else if (AppState.currentMonth < 1) {
    AppState.currentMonth = 12;
    AppState.currentYear -= 1;
  }
  renderCalendar(AppState.currentYear, AppState.currentMonth);
}

/**
 * Main calendar renderer
 */
async function renderCalendar(year, month) {
  const monthYearLabel = document.getElementById('current-month-year');
  if (monthYearLabel) {
    monthYearLabel.textContent = `${MONTH_NAMES[month - 1]} ${year}`;
  }

  const gridContainer = document.getElementById('calendar-grid');
  if (!gridContainer) return;

  gridContainer.innerHTML = '';

  // Fetch workouts for this month from API
  AppState.workoutsCache.clear();
  try {
    const workouts = await API.getWorkoutsByMonth(year, month);
    if (Array.isArray(workouts)) {
      workouts.forEach(w => {
        // Workout must have date attribute YYYY-MM-DD
        if (w.date) {
          AppState.workoutsCache.set(w.date, w);
        }
      });
    }
  } catch (err) {
    console.warn(`Could not load workouts for ${year}-${month}:`, err.message);
  }

  // Calculate calendar grid days
  // JS getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
  // We want Mon = 0 ... Sun = 6
  const firstDayOfMonth = new Date(year, month - 1, 1);
  let startingDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startingDayOfWeek === -1) startingDayOfWeek = 6; // Sunday is 6th offset from Monday

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

  // Today's date components for matching
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  const totalCells = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7;

  for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
    const cellEl = document.createElement('div');
    cellEl.className = 'calendar-day-cell';

    let cellDateString = '';
    let dayNum = 0;
    let isCurrentMonth = false;

    if (cellIndex < startingDayOfWeek) {
      // Days from previous month
      dayNum = daysInPrevMonth - (startingDayOfWeek - cellIndex - 1);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      cellDateString = formatDateISO(prevYear, prevMonth, dayNum);
      cellEl.classList.add('other-month');
    } else if (cellIndex >= startingDayOfWeek + daysInMonth) {
      // Days from next month
      dayNum = cellIndex - (startingDayOfWeek + daysInMonth) + 1;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      cellDateString = formatDateISO(nextYear, nextMonth, dayNum);
      cellEl.classList.add('other-month');
    } else {
      // Days in current month
      dayNum = cellIndex - startingDayOfWeek + 1;
      cellDateString = formatDateISO(year, month, dayNum);
      isCurrentMonth = true;

      // Check if Today
      if (year === todayYear && month === todayMonth && dayNum === todayDay) {
        cellEl.classList.add('today');
      }
    }

    cellEl.dataset.date = cellDateString;

    // Header inside cell: Day number + quick add icon
    const cellHeader = document.createElement('div');
    cellHeader.className = 'cell-header';

    const daySpan = document.createElement('span');
    daySpan.className = 'day-number';
    daySpan.textContent = dayNum;
    cellHeader.appendChild(daySpan);

    if (isCurrentMonth) {
      const addIcon = document.createElement('i');
      addIcon.className = 'fa-solid fa-plus cell-add-icon';
      addIcon.title = `Log workout for ${formatDateForDisplay(cellDateString)}`;
      cellHeader.appendChild(addIcon);
    }
    cellEl.appendChild(cellHeader);

    // Workout summary badge if exists
    const workout = AppState.workoutsCache.get(cellDateString);
    if (workout) {
      const targetMuscle = workout.target_muscles || workout.target_muscle || 'Workout';
      const color = MUSCLE_COLORS[targetMuscle] || '#00d4ff';

      // Left border accent
      cellEl.style.borderLeft = `4px solid ${color}`;

      const workoutContent = document.createElement('div');
      workoutContent.className = 'cell-workout-content';

      // Badge class name sanitize
      const badgeClassModifier = targetMuscle.replace(/\+/g, '-').replace(/\s+/g, '-');
      const badge = document.createElement('span');
      badge.className = `muscle-badge badge-${badgeClassModifier}`;
      badge.textContent = targetMuscle;
      workoutContent.appendChild(badge);

      // Meta: Exercise count or note
      const exerciseCount = workout.exercises ? workout.exercises.length : (workout.exercise_count || 0);
      if (targetMuscle !== 'Rest Day' && exerciseCount > 0) {
        const meta = document.createElement('div');
        meta.className = 'cell-meta';
        meta.innerHTML = `
          <span class="cell-exercise-count">
            <i class="fa-solid fa-layer-group"></i> ${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}
          </span>
        `;
        workoutContent.appendChild(meta);
      }

      cellEl.appendChild(workoutContent);
    }

    // Cell click handler
    cellEl.addEventListener('click', () => {
      if (window.WorkoutModal && typeof window.WorkoutModal.openWorkoutModal === 'function') {
        window.WorkoutModal.openWorkoutModal(cellDateString);
      }
    });

    gridContainer.appendChild(cellEl);
  }
}

/**
 * Populate global exercise suggestions datalist
 */
async function loadExerciseSuggestions() {
  try {
    const datalist = document.getElementById('exercise-suggestions-list');
    if (!datalist) return;

    const suggestions = await API.getExerciseSuggestions();
    if (Array.isArray(suggestions)) {
      datalist.innerHTML = suggestions
        .map(name => `<option value="${name}">`)
        .join('');
    }
  } catch (err) {
    console.warn('Could not load exercise suggestions datalist:', err.message);
  }
}

/**
 * App Initializer
 */
function initApp() {
  // Navigation buttons
  const prevBtn = document.getElementById('prev-month-btn');
  const nextBtn = document.getElementById('next-month-btn');
  const todayBtn = document.getElementById('today-btn');

  if (prevBtn) prevBtn.addEventListener('click', () => navigateMonth(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateMonth(1));
  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      const now = new Date();
      AppState.currentYear = now.getFullYear();
      AppState.currentMonth = now.getMonth() + 1;
      renderCalendar(AppState.currentYear, AppState.currentMonth);
    });
  }

  setupTabs();
  renderCalendar(AppState.currentYear, AppState.currentMonth);
  updateStreak();
  loadExerciseSuggestions();
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initApp);

// Export to window for modal and analytics integration
window.GymApp = {
  AppState,
  MUSCLE_COLORS,
  renderCalendar,
  updateStreak,
  showToast,
  formatDateForDisplay
};
