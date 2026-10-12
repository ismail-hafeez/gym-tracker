/**
 * Gym Tracker - API Client Module
 * Provides asynchronous methods to communicate with the Flask backend API.
 */

const API = (() => {
  // Base endpoint (relative to current origin)
  const BASE_URL = '/api';

  /**
   * Helper request function with robust error parsing
   */
  async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(url, config);

      // Handle 204 No Content
      if (response.status === 204) {
        return null;
      }

      // Parse JSON if possible
      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = text ? { message: text } : {};
      }

      if (!response.ok) {
        const errorMsg = data && (data.error || data.message) 
          ? (data.error || data.message) 
          : `HTTP error ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      console.error(`API Error on [${options.method || 'GET'} ${endpoint}]:`, err);
      throw err;
    }
  }

  return {
    /**
     * GET /api/workouts?month=YYYY-MM
     * Returns list of workouts in the specified month
     */
    async getWorkoutsByMonth(year, month) {
      const formattedMonth = String(month).padStart(2, '0');
      const queryParam = `${year}-${formattedMonth}`;
      return await request(`/workouts?month=${encodeURIComponent(queryParam)}`);
    },

    /**
     * GET /api/workouts/{date}
     * Returns workout details for a specific date (YYYY-MM-DD)
     */
    async getWorkout(date) {
      return await request(`/workouts/${encodeURIComponent(date)}`);
    },

    /**
     * POST /api/workouts
     * Creates a new workout session
     */
    async createWorkout(data) {
      return await request('/workouts', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    /**
     * PUT /api/workouts/{date}
     * Updates an existing workout session
     */
    async updateWorkout(date, data) {
      return await request(`/workouts/${encodeURIComponent(date)}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    /**
     * DELETE /api/workouts/{date}
     * Deletes a workout session
     */
    async deleteWorkout(date) {
      return await request(`/workouts/${encodeURIComponent(date)}`, {
        method: 'DELETE'
      });
    },

    /**
     * GET /api/exercises/suggestions
     * Returns autocomplete suggestions for exercises
     */
    async getExerciseSuggestions() {
      return await request('/exercises/suggestions');
    },

    /**
     * GET /api/analytics/weight
     * Returns body weight progression over time
     */
    async getWeightTrend() {
      return await request('/analytics/weight');
    },

    /**
     * GET /api/analytics/volume
     * Returns volume over time (weekly/monthly)
     */
    async getVolume() {
      return await request('/analytics/volume');
    },

    /**
     * GET /api/analytics/strength?exercise={name}
     * Returns strength progression for the specified exercise
     */
    async getStrength(exercise) {
      return await request(`/analytics/strength?exercise=${encodeURIComponent(exercise)}`);
    },

    /**
     * GET /api/analytics/frequency
     * Returns workout frequency by target muscle group
     */
    async getFrequency() {
      return await request('/analytics/frequency');
    },

    /**
     * GET /api/analytics/summary
     * Returns top-level metrics (total workouts, current streak, longest streak, week momentum)
     */
    async getSummary() {
      return await request('/analytics/summary');
    },

    /**
     * GET /api/analytics/records
     * Returns all-time personal records per exercise
     */
    async getRecords() {
      return await request('/analytics/records');
    },

    /**
     * GET /api/analytics/exercises
     * Returns list of unique exercise names that have logged sets
     */
    async getExerciseNames() {
      return await request('/analytics/exercises');
    }
  };
})();
