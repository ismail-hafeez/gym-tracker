/**
 * Gym Tracker - Workout Modal Management
 * Handles opening/closing the session logger modal, dynamic exercise & set rows,
 * form data serialization, validation, and CRUD operations.
 */

const WorkoutModal = (() => {
  let activeDateString = null;
  let isEditingExisting = false;

  // Cache DOM Elements
  const modalOverlay = document.getElementById('workout-modal');
  const modalDateTitle = document.getElementById('modal-date-title');
  const modalTargetMuscles = document.getElementById('modal-target-muscles');
  const modalBodyWeight = document.getElementById('modal-body-weight');
  const bodyWeightGroup = document.getElementById('body-weight-group');
  const exercisesWrapper = document.getElementById('exercises-section-wrapper');
  const exercisesContainer = document.getElementById('exercises-container');
  const restDayNotice = document.getElementById('rest-day-notice');
  const modalNotes = document.getElementById('modal-notes');
  const btnCloseModal = document.getElementById('modal-close-btn');
  const btnCancelWorkout = document.getElementById('btn-cancel-workout');
  const btnSaveWorkout = document.getElementById('btn-save-workout');
  const btnDeleteWorkout = document.getElementById('btn-delete-workout');
  const btnAddExercise = document.getElementById('btn-add-exercise');

  /**
   * Helper to format human friendly date heading
   */
  function formatHumanDate(dateString) {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Toggle visibility of exercises & weight fields when 'Rest Day' is selected
   */
  function handleMuscleGroupChange() {
    const selected = modalTargetMuscles.value;
    const isRest = selected === 'Rest Day';

    if (isRest) {
      exercisesWrapper.classList.add('hidden');
      bodyWeightGroup.classList.add('hidden');
      restDayNotice.classList.remove('hidden');
    } else {
      exercisesWrapper.classList.remove('hidden');
      bodyWeightGroup.classList.remove('hidden');
      restDayNotice.classList.add('hidden');
    }
  }

  /**
   * Add a set row to an exercise block
   */
  function addSetRow(exerciseBlock, setData = null) {
    const tbody = exerciseBlock.querySelector('.set-table-body');
    if (!tbody) return;

    const rowCount = tbody.children.length;
    const setNumber = setData && setData.set_number ? setData.set_number : rowCount + 1;
    const weightVal = setData && setData.weight_kg !== undefined ? setData.weight_kg : '';
    const repsVal = setData && setData.reps !== undefined ? setData.reps : '';

    const tr = document.createElement('tr');
    tr.className = 'set-row';
    tr.innerHTML = `
      <td><span class="set-num-badge">${setNumber}</span></td>
      <td>
        <input type="number" step="0.5" min="0" max="1000" class="glass-input set-input input-weight" placeholder="kg" value="${weightVal}">
      </td>
      <td>
        <input type="number" step="1" min="0" max="500" class="glass-input set-input input-reps" placeholder="reps" value="${repsVal}">
      </td>
      <td>
        <button type="button" class="btn-remove-set" title="Remove set">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </td>
    `;

    // Remove row event listener
    const removeBtn = tr.querySelector('.btn-remove-set');
    removeBtn.addEventListener('click', () => {
      removeSetRow(tr);
    });

    tbody.appendChild(tr);
  }

  /**
   * Remove a set row and re-index set numbers
   */
  function removeSetRow(row) {
    const tbody = row.parentElement;
    row.remove();
    if (tbody) {
      const rows = tbody.querySelectorAll('.set-row');
      rows.forEach((r, idx) => {
        const badge = r.querySelector('.set-num-badge');
        if (badge) badge.textContent = idx + 1;
      });
    }
  }

  /**
   * Remove an entire exercise block
   */
  function removeExercise(block) {
    block.remove();
  }

  /**
   * Appends a new exercise block to exercisesContainer
   */
  function addExercise(exerciseData = null) {
    const block = document.createElement('div');
    block.className = 'exercise-block';

    const exerciseName = exerciseData && exerciseData.exercise_name ? exerciseData.exercise_name : '';

    block.innerHTML = `
      <div class="exercise-block-header">
        <input type="text" class="glass-input exercise-name-input" list="exercise-suggestions-list" placeholder="Exercise name (e.g. Bench Press, Pull-ups)" value="${exerciseName}" required>
        <button type="button" class="btn-remove-exercise" title="Remove Exercise">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>

      <table class="set-table">
        <thead>
          <tr>
            <th>Set</th>
            <th>Weight (kg)</th>
            <th>Reps</th>
            <th></th>
          </tr>
        </thead>
        <tbody class="set-table-body">
        </tbody>
      </table>

      <div class="exercise-footer">
        <button type="button" class="btn-add-set">
          <i class="fa-solid fa-plus"></i> Add Set
        </button>
      </div>
    `;

    // Event: Remove entire exercise
    const removeExBtn = block.querySelector('.btn-remove-exercise');
    removeExBtn.addEventListener('click', () => {
      removeExercise(block);
    });

    // Event: Add set row
    const addSetBtn = block.querySelector('.btn-add-set');
    addSetBtn.addEventListener('click', () => {
      addSetRow(block);
    });

    // Populate sets
    if (exerciseData && Array.isArray(exerciseData.sets) && exerciseData.sets.length > 0) {
      exerciseData.sets.forEach(setData => addSetRow(block, setData));
    } else {
      // Default 3 set rows for new exercises
      addSetRow(block, { set_number: 1 });
      addSetRow(block, { set_number: 2 });
      addSetRow(block, { set_number: 3 });
    }

    exercisesContainer.appendChild(block);
  }

  /**
   * Clears all fields in the modal form
   */
  function clearModal() {
    activeDateString = null;
    isEditingExisting = false;
    modalTargetMuscles.value = '';
    modalBodyWeight.value = '';
    modalNotes.value = '';
    exercisesContainer.innerHTML = '';
    btnDeleteWorkout.style.display = 'none';

    // Reset visibility
    exercisesWrapper.classList.remove('hidden');
    bodyWeightGroup.classList.remove('hidden');
    restDayNotice.classList.add('hidden');
  }

  /**
   * Populates modal with workout session data
   */
  function populateModal(workout) {
    if (!workout) return;

    modalTargetMuscles.value = workout.target_muscles || workout.target_muscle || '';
    handleMuscleGroupChange();

    if (workout.body_weight_kg !== null && workout.body_weight_kg !== undefined) {
      modalBodyWeight.value = workout.body_weight_kg;
    } else {
      modalBodyWeight.value = '';
    }

    modalNotes.value = workout.notes || '';
    exercisesContainer.innerHTML = '';

    if (workout.target_muscles !== 'Rest Day' && Array.isArray(workout.exercises)) {
      workout.exercises.forEach(ex => {
        addExercise(ex);
      });
    }
  }

  /**
   * Opens the workout modal for a selected date
   */
  async function openWorkoutModal(dateString) {
    clearModal();
    activeDateString = dateString;

    modalDateTitle.textContent = `${formatHumanDate(dateString)} (${window.GymApp.formatDateForDisplay(dateString)})`;
    modalOverlay.classList.remove('hidden-modal');

    try {
      // Check if we have workout in cache or fetch from API
      let workout = null;
      if (window.GymApp && window.GymApp.AppState && window.GymApp.AppState.workoutsCache.has(dateString)) {
        workout = window.GymApp.AppState.workoutsCache.get(dateString);
      }

      // Fetch latest detailed workout from API
      try {
        const fullWorkout = await API.getWorkout(dateString);
        if (fullWorkout && (fullWorkout.target_muscles || fullWorkout.target_muscle)) {
          workout = fullWorkout;
        }
      } catch (e) {
        // Workout not found or 404 (new entry)
      }

      if (workout && (workout.target_muscles || workout.target_muscle)) {
        isEditingExisting = true;
        btnDeleteWorkout.style.display = 'inline-flex';
        populateModal(workout);
      } else {
        isEditingExisting = false;
        btnDeleteWorkout.style.display = 'none';
        // Add one empty exercise block by default
        addExercise();
      }
    } catch (err) {
      console.error('Error loading workout for modal:', err);
      window.GymApp.showToast('Could not load session details', 'error');
    }
  }

  /**
   * Closes the workout modal
   */
  function closeWorkoutModal() {
    modalOverlay.classList.add('hidden-modal');
    setTimeout(() => {
      clearModal();
    }, 250);
  }

  /**
   * Collects and validates form data matching API schema
   */
  function collectFormData() {
    const targetMuscles = modalTargetMuscles.value;
    if (!targetMuscles) {
      throw new Error('Please select a target muscle group.');
    }

    const isRest = targetMuscles === 'Rest Day';
    const bodyWeight = modalBodyWeight.value ? parseFloat(modalBodyWeight.value) : null;
    const notes = modalNotes.value.trim();

    const exercises = [];

    if (!isRest) {
      const exerciseBlocks = exercisesContainer.querySelectorAll('.exercise-block');
      if (exerciseBlocks.length === 0) {
        throw new Error('Please add at least one exercise or select "Rest Day".');
      }

      exerciseBlocks.forEach((block, exIdx) => {
        const nameInput = block.querySelector('.exercise-name-input');
        const exName = nameInput ? nameInput.value.trim() : '';

        if (!exName) {
          throw new Error(`Exercise #${exIdx + 1} requires a name.`);
        }

        const sets = [];
        const setRows = block.querySelectorAll('.set-row');
        setRows.forEach((row, setIdx) => {
          const weightInput = row.querySelector('.input-weight');
          const repsInput = row.querySelector('.input-reps');

          const weight = weightInput && weightInput.value !== '' ? parseFloat(weightInput.value) : 0;
          const reps = repsInput && repsInput.value !== '' ? parseInt(repsInput.value, 10) : 0;

          sets.push({
            set_number: setIdx + 1,
            weight_kg: weight,
            reps: reps
          });
        });

        exercises.push({
          exercise_name: exName,
          sets: sets
        });
      });
    }

    return {
      date: activeDateString,
      target_muscles: targetMuscles,
      body_weight_kg: bodyWeight,
      notes: notes,
      exercises: exercises
    };
  }

  /**
   * Saves workout via create or update API
   */
  async function saveWorkout() {
    try {
      const data = collectFormData();
      btnSaveWorkout.disabled = true;
      btnSaveWorkout.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

      if (isEditingExisting) {
        await API.updateWorkout(activeDateString, data);
        window.GymApp.showToast('Workout session updated!', 'success');
      } else {
        await API.createWorkout(data);
        window.GymApp.showToast('Workout session saved!', 'success');
      }

      closeWorkoutModal();

      // Refresh calendar, streak, and suggestions
      await window.GymApp.renderCalendar(window.GymApp.AppState.currentYear, window.GymApp.AppState.currentMonth);
      window.GymApp.updateStreak();
    } catch (err) {
      console.error('Error saving workout:', err);
      window.GymApp.showToast(err.message || 'Failed to save workout', 'error');
    } finally {
      btnSaveWorkout.disabled = false;
      btnSaveWorkout.innerHTML = '<i class="fa-solid fa-check"></i> Save Workout';
    }
  }

  /**
   * Deletes workout session
   */
  async function deleteWorkout() {
    if (!activeDateString) return;

    const confirmed = window.confirm(`Are you sure you want to delete the workout on ${window.GymApp.formatDateForDisplay(activeDateString)}?`);
    if (!confirmed) return;

    try {
      btnDeleteWorkout.disabled = true;
      btnDeleteWorkout.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

      await API.deleteWorkout(activeDateString);
      window.GymApp.showToast('Workout deleted successfully.', 'info');

      closeWorkoutModal();
      await window.GymApp.renderCalendar(window.GymApp.AppState.currentYear, window.GymApp.AppState.currentMonth);
      window.GymApp.updateStreak();
    } catch (err) {
      console.error('Error deleting workout:', err);
      window.GymApp.showToast(err.message || 'Failed to delete workout', 'error');
    } finally {
      btnDeleteWorkout.disabled = false;
      btnDeleteWorkout.innerHTML = '<i class="fa-regular fa-trash-can"></i> Delete';
    }
  }

  /**
   * Initialize modal events
   */
  function initModal() {
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeWorkoutModal);
    if (btnCancelWorkout) btnCancelWorkout.addEventListener('click', closeWorkoutModal);
    if (btnSaveWorkout) btnSaveWorkout.addEventListener('click', saveWorkout);
    if (btnDeleteWorkout) btnDeleteWorkout.addEventListener('click', deleteWorkout);
    if (btnAddExercise) btnAddExercise.addEventListener('click', () => addExercise());
    if (modalTargetMuscles) modalTargetMuscles.addEventListener('change', handleMuscleGroupChange);

    // Close when clicking modal backdrop
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          closeWorkoutModal();
        }
      });
    }

    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden-modal')) {
        closeWorkoutModal();
      }
    });
  }

  // Bind on load
  document.addEventListener('DOMContentLoaded', initModal);

  return {
    openWorkoutModal,
    closeWorkoutModal,
    populateModal,
    addExercise,
    addSetRow,
    removeSetRow,
    removeExercise,
    collectFormData,
    saveWorkout,
    deleteWorkout
  };
})();

window.WorkoutModal = WorkoutModal;
