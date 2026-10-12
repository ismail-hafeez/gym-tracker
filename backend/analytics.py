from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from models import get_db


def get_weight_trend() -> List[Dict[str, Any]]:
    """
    Returns list of {date, body_weight_kg} for all workouts where
    body_weight_kg is not null, ordered chronologically by date.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT date, body_weight_kg
            FROM workouts
            WHERE body_weight_kg IS NOT NULL
            ORDER BY date ASC
            """
        )
        rows = cursor.fetchall()
        return [
            {"date": row["date"], "body_weight_kg": round(float(row["body_weight_kg"]), 2)}
            for row in rows
        ]


def get_strength_progression(exercise_name: str) -> List[Dict[str, Any]]:
    """
    For a given exercise, returns list of:
    {date, max_weight, max_reps_at_max_weight, total_volume}
    per workout session, ordered by date.
    total_volume = sum(weight * reps) across all sets in that session.
    """
    if not exercise_name:
        return []

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                w.date,
                es.weight_kg,
                es.reps
            FROM workouts w
            JOIN exercises e ON e.workout_id = w.id
            JOIN exercise_sets es ON es.exercise_id = e.id
            WHERE LOWER(TRIM(e.exercise_name)) = LOWER(TRIM(?))
            ORDER BY w.date ASC, es.id ASC
            """,
            (exercise_name,),
        )
        rows = cursor.fetchall()

    if not rows:
        return []

    sessions: Dict[str, List[Dict[str, float]]] = defaultdict(list)
    for row in rows:
        sessions[row["date"]].append({
            "weight": float(row["weight_kg"]),
            "reps": int(row["reps"]),
        })

    progression: List[Dict[str, Any]] = []
    for workout_date in sorted(sessions.keys()):
        sets = sessions[workout_date]
        if not sets:
            continue

        max_weight = max(s["weight"] for s in sets)
        max_reps_at_max = max(s["reps"] for s in sets if s["weight"] == max_weight)
        total_volume = sum(s["weight"] * s["reps"] for s in sets)

        progression.append({
            "date": workout_date,
            "max_weight": round(max_weight, 2),
            "max_reps_at_max_weight": max_reps_at_max,
            "total_volume": round(total_volume, 2),
        })

    return progression


def get_volume_over_time() -> List[Dict[str, Any]]:
    """
    Weekly total volume (sum of weight * reps for all exercises).
    Returns list of {week_start, total_volume} ordered chronologically.
    week_start is the Monday of each calendar week (YYYY-MM-DD).
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                w.date,
                es.weight_kg,
                es.reps
            FROM workouts w
            JOIN exercises e ON e.workout_id = w.id
            JOIN exercise_sets es ON es.exercise_id = e.id
            ORDER BY w.date ASC
            """
        )
        rows = cursor.fetchall()

    if not rows:
        return []

    weekly_volume: Dict[str, float] = defaultdict(float)

    for row in rows:
        try:
            d = datetime.strptime(row["date"], "%Y-%m-%d").date()
        except ValueError:
            continue
        # Monday of current week
        monday = d - timedelta(days=d.weekday())
        week_key = monday.strftime("%Y-%m-%d")
        weekly_volume[week_key] += float(row["weight_kg"]) * int(row["reps"])

    return [
        {"week_start": week_start, "total_volume": round(vol, 2)}
        for week_start, vol in sorted(weekly_volume.items())
    ]


def get_muscle_frequency() -> List[Dict[str, Any]]:
    """
    Count of workouts per target_muscles group (excluding rest days).
    Returns list of {target_muscles, count} sorted descending by count.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT target_muscles, COUNT(*) as count
            FROM workouts
            WHERE LOWER(TRIM(target_muscles)) != 'rest day'
            GROUP BY target_muscles
            ORDER BY count DESC, target_muscles ASC
            """
        )
        rows = cursor.fetchall()
        return [
            {"target_muscles": row["target_muscles"], "count": int(row["count"])}
            for row in rows
        ]


def get_summary_stats() -> Dict[str, Any]:
    """
    Returns summary statistics:
    - total_workouts (excluding rest days)
    - current_streak (consecutive days with workouts)
    - longest_streak (longest consecutive days with workouts)
    - workouts_this_week (Monday-Sunday, excluding rest days)
    - workouts_last_week (Monday-Sunday, excluding rest days)
    - total_rest_days
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT date, target_muscles
            FROM workouts
            ORDER BY date ASC
            """
        )
        rows = cursor.fetchall()

    total_rest_days = 0
    workout_dates = set()

    for row in rows:
        target = (row["target_muscles"] or "").strip().lower()
        if target == "rest day":
            total_rest_days += 1
        else:
            try:
                d = datetime.strptime(row["date"], "%Y-%m-%d").date()
                workout_dates.add(d)
            except ValueError:
                continue

    total_workouts = len(workout_dates)

    # Streak calculations
    sorted_dates = sorted(workout_dates)
    longest_streak = 0
    if sorted_dates:
        curr_streak_run = 1
        longest_streak = 1
        for i in range(1, len(sorted_dates)):
            if sorted_dates[i] == sorted_dates[i - 1] + timedelta(days=1):
                curr_streak_run += 1
            else:
                curr_streak_run = 1
            if curr_streak_run > longest_streak:
                longest_streak = curr_streak_run

    # Current streak calculation
    today = date.today()
    current_streak = 0
    if today in workout_dates:
        check_date = today
        while check_date in workout_dates:
            current_streak += 1
            check_date -= timedelta(days=1)
    elif (today - timedelta(days=1)) in workout_dates:
        check_date = today - timedelta(days=1)
        while check_date in workout_dates:
            current_streak += 1
            check_date -= timedelta(days=1)
    else:
        current_streak = 0

    # Workouts this week & last week (Monday-Sunday)
    monday_this_week = today - timedelta(days=today.weekday())
    sunday_this_week = monday_this_week + timedelta(days=6)
    monday_last_week = monday_this_week - timedelta(days=7)
    sunday_last_week = monday_last_week + timedelta(days=6)

    workouts_this_week = sum(
        1 for d in workout_dates if monday_this_week <= d <= sunday_this_week
    )
    workouts_last_week = sum(
        1 for d in workout_dates if monday_last_week <= d <= sunday_last_week
    )

    return {
        "total_workouts": total_workouts,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "workouts_this_week": workouts_this_week,
        "workouts_last_week": workouts_last_week,
        "total_rest_days": total_rest_days,
    }


def get_personal_records() -> List[Dict[str, Any]]:
    """
    For each exercise ever logged, returns:
    - exercise_name
    - max_weight: heaviest single set weight (kg)
    - reps_at_max_weight: reps on the heaviest single set
    - max_volume_set: highest volume single set {weight_kg, reps, volume}
    - highest_volume: max volume achieved across single sets
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                e.exercise_name,
                es.weight_kg,
                es.reps
            FROM exercises e
            JOIN exercise_sets es ON es.exercise_id = e.id
            ORDER BY e.exercise_name COLLATE NOCASE ASC, es.weight_kg DESC, es.reps DESC
            """
        )
        rows = cursor.fetchall()

    if not rows:
        return []

    records_by_exercise: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        raw_name = (row["exercise_name"] or "").strip()
        if not raw_name:
            continue
        key = raw_name.lower()

        weight = float(row["weight_kg"])
        reps = int(row["reps"])
        vol = weight * reps

        if key not in records_by_exercise:
            records_by_exercise[key] = {
                "exercise_name": raw_name,
                "max_weight": weight,
                "reps_at_max_weight": reps,
                "highest_volume": vol,
                "max_volume_set": {
                    "weight_kg": weight,
                    "reps": reps,
                    "volume": round(vol, 2),
                },
            }
        else:
            rec = records_by_exercise[key]
            # Check heaviest single set
            if weight > rec["max_weight"] or (weight == rec["max_weight"] and reps > rec["reps_at_max_weight"]):
                rec["max_weight"] = weight
                rec["reps_at_max_weight"] = reps

            # Check highest volume single set
            if vol > rec["highest_volume"]:
                rec["highest_volume"] = round(vol, 2)
                rec["max_volume_set"] = {
                    "weight_kg": weight,
                    "reps": reps,
                    "volume": round(vol, 2),
                }

    return sorted(records_by_exercise.values(), key=lambda r: r["exercise_name"].lower())


def get_all_exercise_names() -> List[str]:
    """
    Returns distinct exercise names for the strength progression dropdown.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT DISTINCT exercise_name
            FROM exercises
            WHERE exercise_name IS NOT NULL AND TRIM(exercise_name) != ''
            ORDER BY exercise_name COLLATE NOCASE ASC
            """
        )
        rows = cursor.fetchall()
        return [row["exercise_name"] for row in rows]
