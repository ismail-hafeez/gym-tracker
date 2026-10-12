/**
 * Gym Tracker - Analytics Dashboard Module
 * Visualizes metrics with Chart.js: weight trend, strength progression,
 * volume over time, muscle split, and personal records table.
 */

const AnalyticsModule = (() => {
  // Chart instances
  let weightChartInstance = null;
  let strengthChartInstance = null;
  let volumeChartInstance = null;
  let frequencyChartInstance = null;

  // Chart.js dark theme defaults
  function setupChartDefaults() {
    if (typeof Chart === 'undefined') return;

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 20, 48, 0.95)';
    Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
    Chart.defaults.plugins.tooltip.bodyColor = '#94a3b8';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.15)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
  }

  /**
   * Toggle visibility of empty state banner on chart cards
   */
  function toggleEmptyState(elementId, hasData) {
    const emptyEl = document.getElementById(elementId);
    if (!emptyEl) return;
    if (hasData) {
      emptyEl.classList.remove('visible');
    } else {
      emptyEl.classList.add('visible');
    }
  }

  /**
   * 1. Render Summary Cards
   */
  async function loadSummaryCards() {
    try {
      const summary = await API.getSummary();
      renderSummaryCards(summary || {});
    } catch (err) {
      console.warn('Could not fetch analytics summary:', err.message);
      renderSummaryCards({});
    }
  }

  async function renderSummaryCards(data) {
    const totalEl = document.getElementById('stat-total-workouts');
    const currentStreakEl = document.getElementById('stat-current-streak');
    const longestStreakEl = document.getElementById('stat-longest-streak');
    const momentumEl = document.getElementById('stat-week-momentum');
    const latestWeightEl = document.getElementById('stat-latest-weight');

    if (totalEl) totalEl.textContent = data.total_workouts || 0;
    if (currentStreakEl) currentStreakEl.textContent = `${data.current_streak || 0} days`;
    if (longestStreakEl) longestStreakEl.textContent = `Longest: ${data.longest_streak || 0} days`;

    const thisWeek = data.workouts_this_week !== undefined ? data.workouts_this_week : 0;
    const lastWeek = data.workouts_last_week !== undefined ? data.workouts_last_week : 0;
    if (momentumEl) momentumEl.textContent = `${thisWeek} vs ${lastWeek}`;

    // Fetch latest weight from weight trend endpoint
    try {
      const weightData = await API.getWeightTrend();
      if (latestWeightEl && Array.isArray(weightData) && weightData.length > 0) {
        const latest = weightData[weightData.length - 1];
        latestWeightEl.textContent = `${latest.body_weight_kg} kg`;
      } else if (latestWeightEl) {
        latestWeightEl.textContent = '-- kg';
      }
    } catch (e) {
      if (latestWeightEl) latestWeightEl.textContent = '-- kg';
    }
  }

  /**
   * 2. Body Weight Trend (Line Chart)
   */
  async function loadWeightChart() {
    try {
      const data = await API.getWeightTrend();
      renderWeightChart(data || []);
    } catch (err) {
      console.warn('Could not load weight trend:', err.message);
      renderWeightChart([]);
    }
  }

  function renderWeightChart(data) {
    const canvas = document.getElementById('chart-weight');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const hasData = Array.isArray(data) && data.length > 0;
    toggleEmptyState('empty-weight', hasData);

    if (weightChartInstance) {
      weightChartInstance.destroy();
    }

    if (!hasData) return;

    // Sort by date ascending
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = sorted.map(d => window.GymApp.formatDateForDisplay(d.date));
    const weights = sorted.map(d => d.body_weight_kg !== undefined ? d.body_weight_kg : d.weight_kg);

    // Gradient fill: cyan to transparent
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(0, 212, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 212, 255, 0.0)');

    weightChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Weight (kg)',
          data: weights,
          borderColor: '#00d4ff',
          backgroundColor: gradient,
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#00d4ff',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { color: '#64748b', maxRotation: 45 }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
            ticks: { color: '#64748b' }
          }
        }
      }
    });
  }

  /**
   * 3. Strength Progression Chart (Line Chart with Exercise Select)
   */
  async function loadStrengthExercises() {
    const select = document.getElementById('exercise-select-strength');
    if (!select) return;

    try {
      const exercises = await API.getExerciseNames();
      select.innerHTML = '<option value="">Select Exercise...</option>';

      if (Array.isArray(exercises) && exercises.length > 0) {
        exercises.forEach(name => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        });

        // Default to first exercise
        select.value = exercises[0];
        loadStrengthChart(exercises[0]);
      } else {
        toggleEmptyState('empty-strength', false);
      }
    } catch (err) {
      console.warn('Could not load exercise names for strength chart:', err.message);
      toggleEmptyState('empty-strength', false);
    }

    select.onchange = (e) => {
      const selectedEx = e.target.value;
      if (selectedEx) {
        loadStrengthChart(selectedEx);
      } else {
        renderStrengthChart([], '');
      }
    };
  }

  async function loadStrengthChart(exerciseName) {
    if (!exerciseName) {
      renderStrengthChart([], '');
      return;
    }
    try {
      const data = await API.getStrength(exerciseName);
      renderStrengthChart(data || [], exerciseName);
    } catch (err) {
      console.warn(`Could not load strength progression for ${exerciseName}:`, err.message);
      renderStrengthChart([], exerciseName);
    }
  }

  function renderStrengthChart(data, exerciseName) {
    const canvas = document.getElementById('chart-strength');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const hasData = Array.isArray(data) && data.length > 0;
    toggleEmptyState('empty-strength', hasData);

    if (strengthChartInstance) {
      strengthChartInstance.destroy();
    }

    if (!hasData) return;

    // Sort by date ascending
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = sorted.map(d => window.GymApp.formatDateForDisplay(d.date));
    const maxWeights = sorted.map(d => d.max_weight !== undefined ? d.max_weight : d.max_weight_kg);

    // Gradient fill: purple to transparent
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(123, 47, 247, 0.45)');
    gradient.addColorStop(1, 'rgba(123, 47, 247, 0.0)');

    strengthChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `${exerciseName || 'Exercise'} Max (kg)`,
          data: maxWeights,
          borderColor: '#a855f7',
          backgroundColor: gradient,
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#a855f7',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { color: '#64748b', maxRotation: 45 }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
            ticks: { color: '#64748b' }
          }
        }
      }
    });
  }

  /**
   * 4. Volume Over Time (Bar Chart)
   */
  async function loadVolumeChart() {
    try {
      const data = await API.getVolume();
      renderVolumeChart(data || []);
    } catch (err) {
      console.warn('Could not load volume chart:', err.message);
      renderVolumeChart([]);
    }
  }

  function renderVolumeChart(data) {
    const canvas = document.getElementById('chart-volume');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const hasData = Array.isArray(data) && data.length > 0;
    toggleEmptyState('empty-volume', hasData);

    if (volumeChartInstance) {
      volumeChartInstance.destroy();
    }

    if (!hasData) return;

    const labels = data.map(d => d.week_start ? window.GymApp.formatDateForDisplay(d.week_start) : (d.period || d.week || 'Week'));
    const volumes = data.map(d => d.total_volume || d.volume || 0);

    // Gradient bar fill: orange to pink
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, '#ff6b35');
    gradient.addColorStop(1, '#ff2d7b');

    volumeChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Total Volume (kg × reps)',
          data: volumes,
          backgroundColor: gradient,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { color: '#64748b', maxRotation: 45 }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
            ticks: { color: '#64748b' }
          }
        }
      }
    });
  }

  /**
   * 5. Muscle Distribution (Doughnut Chart)
   */
  async function loadFrequencyChart() {
    try {
      const data = await API.getFrequency();
      renderFrequencyChart(data || {});
    } catch (err) {
      console.warn('Could not load muscle frequency:', err.message);
      renderFrequencyChart({});
    }
  }

  function renderFrequencyChart(data) {
    const canvas = document.getElementById('chart-frequency');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let labels = [];
    let counts = [];

    if (Array.isArray(data)) {
      labels = data.map(d => d.muscle_group || d.target_muscles || d.name);
      counts = data.map(d => d.count || d.sessions || 0);
    } else if (typeof data === 'object' && data !== null) {
      labels = Object.keys(data);
      counts = Object.values(data);
    }

    const hasData = labels.length > 0 && counts.some(c => c > 0);
    toggleEmptyState('empty-frequency', hasData);

    if (frequencyChartInstance) {
      frequencyChartInstance.destroy();
    }

    if (!hasData) return;

    // Match slice colors with design system
    const backgroundColors = labels.map(label => {
      return (window.GymApp && window.GymApp.MUSCLE_COLORS[label]) || '#7b2ff7';
    });

    frequencyChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: counts,
          backgroundColor: backgroundColors,
          borderWidth: 2,
          borderColor: '#0f1430',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 14,
              color: '#94a3b8'
            }
          }
        },
        cutout: '68%'
      }
    });
  }

  /**
   * 6. Personal Records Table
   */
  async function loadRecordsTable() {
    const tableBody = document.getElementById('records-table-body');
    if (!tableBody) return;

    try {
      const records = await API.getRecords();
      renderRecordsTable(records || []);
    } catch (err) {
      console.warn('Could not load personal records:', err.message);
      renderRecordsTable([]);
    }
  }

  function renderRecordsTable(records) {
    const tableBody = document.getElementById('records-table-body');
    if (!tableBody) return;

    if (!Array.isArray(records) || records.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty">No personal records logged yet. Log your sessions to unlock achievements!</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = records.map(rec => {
      const exercise = rec.exercise_name || rec.exercise || 'Exercise';
      const bestWeight = rec.max_weight !== undefined ? `${rec.max_weight} kg` : '--';
      const repsAtBest = rec.reps_at_max_weight !== undefined ? `${rec.reps_at_max_weight} reps` : '--';
      const bestVolume = rec.highest_volume !== undefined ? `${rec.highest_volume} kg` : '--';
      const dateStr = rec.date ? window.GymApp.formatDateForDisplay(rec.date) : '';

      return `
        <tr>
          <td><strong>${exercise}</strong></td>
          <td><span class="pr-badge"><i class="fa-solid fa-trophy"></i> ${bestWeight}</span></td>
          <td>${repsAtBest}</td>
          <td>${bestVolume}</td>
          <td><span class="text-dim">${dateStr}</span></td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Initializes Analytics tab data
   */
  async function initAnalytics() {
    setupChartDefaults();
    await Promise.allSettled([
      loadSummaryCards(),
      loadWeightChart(),
      loadStrengthExercises(),
      loadVolumeChart(),
      loadFrequencyChart(),
      loadRecordsTable()
    ]);
  }

  return {
    initAnalytics,
    renderSummaryCards,
    renderWeightChart,
    renderStrengthChart,
    renderVolumeChart,
    renderFrequencyChart,
    renderRecordsTable
  };
})();

window.AnalyticsModule = AnalyticsModule;
