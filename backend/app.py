import os
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from models import (
    init_db,
    create_workout,
    get_workout_by_date,
    get_workouts_by_month,
    update_workout,
    delete_workout,
    get_exercise_suggestions,
)
from analytics import (
    get_weight_trend,
    get_strength_progression,
    get_volume_over_time,
    get_muscle_frequency,
    get_summary_stats,
    get_personal_records,
    get_all_exercise_names,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

app = Flask(__name__)
CORS(app)

# Initialize database schema on startup
init_db()


# ==========================================
# Frontend Serving Routes
# ==========================================

@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/css/<path:filename>")
def serve_css(filename):
    css_dir = os.path.join(FRONTEND_DIR, "css")
    return send_from_directory(css_dir, filename)


@app.route("/js/<path:filename>")
def serve_js(filename):
    js_dir = os.path.join(FRONTEND_DIR, "js")
    return send_from_directory(js_dir, filename)


# ==========================================
# Workouts API Routes
# ==========================================

@app.route("/api/workouts", methods=["GET"])
def list_workouts():
    try:
        month = request.args.get("month")
        if not month:
            # Default to current month YYYY-MM if not specified
            month = datetime.now().strftime("%Y-%m")
        workouts = get_workouts_by_month(month)
        return jsonify(workouts), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/workouts/<date>", methods=["GET"])
def get_workout(date):
    try:
        workout = get_workout_by_date(date)
        if not workout:
            return jsonify({"error": f"Workout for date {date} not found"}), 404
        return jsonify(workout), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/workouts", methods=["POST"])
def add_workout():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid or missing JSON payload"}), 400

    if not data.get("date"):
        return jsonify({"error": "Workout date is required"}), 400
    if not data.get("target_muscles"):
        return jsonify({"error": "target_muscles is required"}), 400

    try:
        created = create_workout(data)
        return jsonify(created), 201
    except Exception as e:
        err_msg = str(e)
        if "UNIQUE constraint failed" in err_msg:
            return jsonify({"error": f"Workout for date {data.get('date')} already exists"}), 409
        return jsonify({"error": err_msg}), 400


@app.route("/api/workouts/<date>", methods=["PUT"])
def edit_workout(date):
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid or missing JSON payload"}), 400

    try:
        updated = update_workout(date, data)
        if not updated:
            return jsonify({"error": f"Workout for date {date} not found"}), 404
        return jsonify(updated), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/workouts/<date>", methods=["DELETE"])
def remove_workout(date):
    try:
        success = delete_workout(date)
        if not success:
            return jsonify({"error": f"Workout for date {date} not found"}), 404
        return "", 204
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/exercises/suggestions", methods=["GET"])
def exercise_suggestions():
    try:
        suggestions = get_exercise_suggestions()
        return jsonify(suggestions), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================
# Analytics API Routes
# ==========================================

@app.route("/api/analytics/weight", methods=["GET"])
def analytics_weight():
    try:
        data = get_weight_trend()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/analytics/volume", methods=["GET"])
def analytics_volume():
    try:
        data = get_volume_over_time()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/analytics/strength", methods=["GET"])
def analytics_strength():
    try:
        exercise_name = request.args.get("exercise", "").strip()
        if not exercise_name:
            return jsonify({"error": "Query parameter 'exercise' is required"}), 400
        data = get_strength_progression(exercise_name)
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/analytics/frequency", methods=["GET"])
def analytics_frequency():
    try:
        data = get_muscle_frequency()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/analytics/summary", methods=["GET"])
def analytics_summary():
    try:
        data = get_summary_stats()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/analytics/records", methods=["GET"])
def analytics_records():
    try:
        data = get_personal_records()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/analytics/exercises", methods=["GET"])
def analytics_exercises():
    try:
        data = get_all_exercise_names()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
