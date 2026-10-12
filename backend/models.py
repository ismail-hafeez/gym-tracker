import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple, Union

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gym_tracker.db")


class DBConnection(sqlite3.Connection):
    """Custom connection class that ensures clean transaction and connection closing."""
    def __enter__(self):
        super().__enter__()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            super().__exit__(exc_type, exc_val, exc_tb)
        finally:
            self.close()


def get_db() -> DBConnection:
    """
    Returns an SQLite database connection configured with Row factory,
    foreign key constraints enabled, and WAL journal mode.
    Can be used directly or as a context manager:
        with get_db() as conn:
            ...
    """
    conn = sqlite3.connect(DB_PATH, factory=DBConnection)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    """
    Initializes the SQLite database with WAL mode and required tables.
    """
    with get_db() as conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE NOT NULL,
                target_muscles TEXT NOT NULL,
                body_weight_kg REAL,
                notes TEXT
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exercises (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id INTEGER NOT NULL,
                exercise_name TEXT NOT NULL,
                "order" INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exercise_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exercise_id INTEGER NOT NULL,
                set_number INTEGER NOT NULL,
                weight_kg REAL NOT NULL,
                reps INTEGER NOT NULL,
                FOREIGN KEY (exercise_id) REFERENCES exercises (id) ON DELETE CASCADE
            );
        """)
        # Indexes for query performance
        conn.execute("CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_exercises_workout_id ON exercises(workout_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_exercise_sets_exercise_id ON exercise_sets(exercise_id);")


def create_workout(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Inserts a workout along with nested exercises and sets.
    Expected data structure:
    {
        "date": "YYYY-MM-DD",
        "target_muscles": "Back",
        "body_weight_kg": 75.5,  # optional
        "notes": "Felt strong",   # optional
        "exercises": [           # optional
            {
                "exercise_name": "Deadlift",
                "order": 0,
                "sets": [
                    {"set_number": 1, "weight_kg": 100.0, "reps": 5}
                ]
            }
        ]
    }
    """
    date = data.get("date")
    if not date:
        raise ValueError("Workout date is required.")

    target_muscles = data.get("target_muscles", "").strip()
    if not target_muscles:
        raise ValueError("Target muscles field is required.")

    body_weight_kg = data.get("body_weight_kg")
    notes = data.get("notes")
    exercises = data.get("exercises", [])

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO workouts (date, target_muscles, body_weight_kg, notes)
            VALUES (?, ?, ?, ?)
            """,
            (date, target_muscles, body_weight_kg, notes),
        )
        workout_id = cursor.lastrowid

        for idx, ex in enumerate(exercises):
            ex_name = ex.get("exercise_name", "").strip()
            if not ex_name:
                continue
            ex_order = ex.get("order", idx)
            cursor.execute(
                """
                INSERT INTO exercises (workout_id, exercise_name, "order")
                VALUES (?, ?, ?)
                """,
                (workout_id, ex_name, ex_order),
            )
            exercise_id = cursor.lastrowid

            for s_idx, s in enumerate(ex.get("sets", [])):
                set_num = s.get("set_number", s_idx + 1)
                weight_kg = float(s.get("weight_kg", 0.0))
                reps = int(s.get("reps", 0))
                cursor.execute(
                    """
                    INSERT INTO exercise_sets (exercise_id, set_number, weight_kg, reps)
                    VALUES (?, ?, ?, ?)
                    """,
                    (exercise_id, set_num, weight_kg, reps),
                )

    return get_workout_by_date(date)


def get_workout_by_date(date: str) -> Optional[Dict[str, Any]]:
    """
    Returns full workout with nested exercises and sets, or None if not found.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM workouts WHERE date = ?", (date,))
        workout_row = cursor.fetchone()
        if not workout_row:
            return None

        workout = {
            "id": workout_row["id"],
            "date": workout_row["date"],
            "target_muscles": workout_row["target_muscles"],
            "body_weight_kg": workout_row["body_weight_kg"],
            "notes": workout_row["notes"],
            "exercises": [],
        }

        cursor.execute(
            """
            SELECT * FROM exercises
            WHERE workout_id = ?
            ORDER BY "order" ASC, id ASC
            """,
            (workout["id"],),
        )
        exercise_rows = cursor.fetchall()

        for ex_row in exercise_rows:
            exercise_data = {
                "id": ex_row["id"],
                "exercise_name": ex_row["exercise_name"],
                "order": ex_row["order"],
                "sets": [],
            }

            cursor.execute(
                """
                SELECT * FROM exercise_sets
                WHERE exercise_id = ?
                ORDER BY set_number ASC, id ASC
                """,
                (ex_row["id"],),
            )
            set_rows = cursor.fetchall()
            for s_row in set_rows:
                exercise_data["sets"].append({
                    "id": s_row["id"],
                    "set_number": s_row["set_number"],
                    "weight_kg": s_row["weight_kg"],
                    "reps": s_row["reps"],
                })

            workout["exercises"].append(exercise_data)

        return workout


def get_workouts_by_month(year: Union[int, str], month: Optional[Union[int, str]] = None) -> List[Dict[str, Any]]:
    """
    Returns list of workout summaries for a given month.
    Accepts either (year, month) or a single string formatted as 'YYYY-MM'.
    Returns list of {id, date, target_muscles, body_weight_kg, notes}.
    """
    if month is None and isinstance(year, str) and "-" in year:
        prefix = year.strip()
    else:
        prefix = f"{int(year):04d}-{int(month):02d}"

    pattern = f"{prefix}-%"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, date, target_muscles, body_weight_kg, notes
            FROM workouts
            WHERE date LIKE ?
            ORDER BY date ASC
            """,
            (pattern,),
        )
        rows = cursor.fetchall()
        return [
            {
                "id": row["id"],
                "date": row["date"],
                "target_muscles": row["target_muscles"],
                "body_weight_kg": row["body_weight_kg"],
                "notes": row["notes"],
            }
            for row in rows
        ]


def update_workout(date: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Updates an existing workout:
    - Updates workout metadata
    - Deletes old exercises (cascades to sets)
    - Re-inserts exercises and sets from data
    Returns the updated workout dict, or None if workout does not exist.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM workouts WHERE date = ?", (date,))
        row = cursor.fetchone()
        if not row:
            return None
        workout_id = row["id"]

        new_date = data.get("date", date)
        target_muscles = data.get("target_muscles", "").strip()
        if not target_muscles:
            raise ValueError("Target muscles field is required.")
        body_weight_kg = data.get("body_weight_kg")
        notes = data.get("notes")
        exercises = data.get("exercises", [])

        # Update workout info
        cursor.execute(
            """
            UPDATE workouts
            SET date = ?, target_muscles = ?, body_weight_kg = ?, notes = ?
            WHERE id = ?
            """,
            (new_date, target_muscles, body_weight_kg, notes, workout_id),
        )

        # Delete existing exercises (cascades to exercise_sets)
        cursor.execute("DELETE FROM exercises WHERE workout_id = ?", (workout_id,))

        # Re-insert exercises and sets
        for idx, ex in enumerate(exercises):
            ex_name = ex.get("exercise_name", "").strip()
            if not ex_name:
                continue
            ex_order = ex.get("order", idx)
            cursor.execute(
                """
                INSERT INTO exercises (workout_id, exercise_name, "order")
                VALUES (?, ?, ?)
                """,
                (workout_id, ex_name, ex_order),
            )
            exercise_id = cursor.lastrowid

            for s_idx, s in enumerate(ex.get("sets", [])):
                set_num = s.get("set_number", s_idx + 1)
                weight_kg = float(s.get("weight_kg", 0.0))
                reps = int(s.get("reps", 0))
                cursor.execute(
                    """
                    INSERT INTO exercise_sets (exercise_id, set_number, weight_kg, reps)
                    VALUES (?, ?, ?, ?)
                    """,
                    (exercise_id, set_num, weight_kg, reps),
                )

    return get_workout_by_date(new_date)


def delete_workout(date: str) -> bool:
    """
    Deletes workout and cascading exercises/sets by date.
    Returns True if a workout was deleted, False otherwise.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM workouts WHERE date = ?", (date,))
        return cursor.rowcount > 0


def get_exercise_suggestions() -> List[str]:
    """
    Returns distinct exercise names sorted alphabetically.
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
