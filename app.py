"""
AlphtechTuner - Audio Chromatic Tuner & Pitch Analysis Platform
SWE40006 Software Deployment and Evolution - Task 4.3 (Distinction Tier)
Student: Dang Duc Minh (105559691)
"""

import math
import os
import socket
import sys
import time
from datetime import datetime
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
START_TIME = time.time()

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def freq_to_note(freq, base_a=440.0):
    """Convert a frequency in Hz to musical note information and cents deviation."""
    if freq <= 0:
        return None
    # MIDI note number calculation: A4 is MIDI 69
    midi_num = 12.0 * math.log2(freq / base_a) + 69.0
    rounded_midi = round(midi_num)
    cents_diff = (midi_num - rounded_midi) * 100.0

    note_index = rounded_midi % 12
    octave = (rounded_midi // 12) - 1
    target_freq = base_a * (2.0 ** ((rounded_midi - 69.0) / 12.0))

    if abs(cents_diff) <= 3.0:
        tuning_status = "in_tune"
    elif cents_diff < -3.0:
        tuning_status = "flat"
    else:
        tuning_status = "sharp"

    return {
        "note": NOTE_NAMES[note_index],
        "octave": int(octave),
        "target_frequency": round(target_freq, 2),
        "cents_deviation": round(cents_diff, 1),
        "tuning_status": tuning_status
    }


def generate_note_table(base_a=440.0):
    """Generate frequency lookup table for standard octaves (0 through 8)."""
    table = []
    for midi in range(12, 108):  # C0 to B7
        note_name = NOTE_NAMES[midi % 12]
        octave = (midi // 12) - 1
        freq = base_a * (2.0 ** ((midi - 69.0) / 12.0))
        table.append({
            "midi": midi,
            "note": f"{note_name}{octave}",
            "frequency": round(freq, 2)
        })
    return table


@app.route("/")
def index():
    return render_template(
        "index.html",
        hostname=socket.gethostname(),
        python_version=sys.version.split()[0]
    )


@app.route("/api/status")
def api_status():
    uptime_seconds = int(time.time() - START_TIME)
    return jsonify({
        "status": "healthy",
        "app": "AlphtechTuner",
        "unit": "SWE40006 Software Deployment and Evolution",
        "student": {
            "name": "Dang Duc Minh",
            "id": "105559691"
        },
        "container": {
            "hostname": socket.gethostname(),
            "python_version": sys.version,
            "uptime_seconds": uptime_seconds
        },
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })


@app.route("/api/calculate")
def api_calculate():
    try:
        freq = float(request.args.get("freq", 440.0))
        base_a = float(request.args.get("base_a", 440.0))
        result = freq_to_note(freq, base_a)
        if result is None:
            return jsonify({"error": "Invalid frequency value"}), 400
        result["input_frequency"] = freq
        result["base_a"] = base_a
        return jsonify(result)
    except (ValueError, TypeError) as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/notes")
def api_notes():
    try:
        base_a = float(request.args.get("base_a", 440.0))
    except (ValueError, TypeError):
        base_a = 440.0
    return jsonify({
        "base_a": base_a,
        "notes": generate_note_table(base_a)
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
