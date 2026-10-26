/* ====================================================================
   AlphtechTuner - Audio DSP & Web Audio API Engine
   ==================================================================== */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let audioCtx = null;
let analyser = null;
let micStream = null;
let isListening = false;
let animationId = null;

let baseConcertA = 440.0;

// DOM Elements
const btnListen = document.getElementById("btn-listen");
const detectedNoteEl = document.getElementById("detected-note");
const detectedOctaveEl = document.getElementById("detected-octave");
const detectedFreqEl = document.getElementById("detected-freq");
const tuningBadgeEl = document.getElementById("tuning-badge");
const needleEl = document.getElementById("needle");
const centsValEl = document.getElementById("cents-value");

const sliderConcertPitch = document.getElementById("concert-pitch-slider");
const concertPitchValEl = document.getElementById("concert-pitch-val");

// Concert Pitch Slider Listener
sliderConcertPitch.addEventListener("input", (e) => {
    baseConcertA = parseFloat(e.target.value);
    concertPitchValEl.textContent = baseConcertA.toFixed(1);
});

// Toggle Microphone Listener
btnListen.addEventListener("click", async () => {
    if (!isListening) {
        await startListening();
    } else {
        stopListening();
    }
});

// Initialize Web Audio Context
function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    return audioCtx;
}

// Start Microphone Capture
async function startListening() {
    try {
        const ctx = getAudioContext();
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const source = ctx.createMediaStreamSource(micStream);

        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        isListening = true;
        btnListen.classList.add("active");
        btnListen.innerHTML = '<span class="icon">&#9632;</span> Stop Microphone';
        setTuningStatus("listening", "Listening...");

        detectPitchLoop();
    } catch (err) {
        console.error("Microphone access error:", err);
        alert("Unable to access microphone: " + err.message);
    }
}

// Stop Microphone Capture
function stopListening() {
    isListening = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    btnListen.classList.remove("active");
    btnListen.innerHTML = '<span class="icon">&#9654;</span> Start Microphone';
    setTuningStatus("idle", "Ready");
    resetDisplay();
}

// Real-time Pitch Detection Animation Frame
function detectPitchLoop() {
    if (!isListening || !analyser) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    const freq = autoCorrelate(buffer, audioCtx.sampleRate);

    if (freq > 0) {
        updateTunerUI(freq);
    }

    animationId = requestAnimationFrame(detectPitchLoop);
}

// Autocorrelation Pitch Detection Algorithm
function autoCorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;

    // 1. Calculate RMS energy for noise gating
    let sumSquares = 0;
    for (let i = 0; i < SIZE; i++) {
        sumSquares += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquares / SIZE);
    if (rms < 0.012) {
        // Noise floor threshold
        return -1;
    }

    // 2. Trim low correlation bounds (30 Hz to 4200 Hz)
    const minPeriod = Math.floor(sampleRate / 4200);
    const maxPeriod = Math.floor(sampleRate / 30);

    let maxCorrelation = 0;
    let bestPeriod = -1;

    for (let period = minPeriod; period <= maxPeriod; period++) {
        let correlation = 0;
        for (let i = 0; i < SIZE - period; i++) {
            correlation += buffer[i] * buffer[i + period];
        }

        if (correlation > maxCorrelation) {
            maxCorrelation = correlation;
            bestPeriod = period;
        }
    }

    if (bestPeriod === -1 || maxCorrelation / sumSquares < 0.5) {
        return -1;
    }

    // 3. Parabolic interpolation for sub-bin precision
    const x0 = bestPeriod > minPeriod ? bestPeriod - 1 : bestPeriod;
    const x2 = bestPeriod < maxPeriod ? bestPeriod + 1 : bestPeriod;

    let c0 = 0, c2 = 0;
    for (let i = 0; i < SIZE - x0; i++) c0 += buffer[i] * buffer[i + x0];
    for (let i = 0; i < SIZE - x2; i++) c2 += buffer[i] * buffer[i + x2];

    const delta = (c2 - c0) / (2 * (2 * maxCorrelation - c0 - c2));
    const refinedPeriod = bestPeriod + delta;

    return sampleRate / refinedPeriod;
}

// Convert Frequency to Musical Note & Cents
function updateTunerUI(freq) {
    const midiNum = 12.0 * Math.log2(freq / baseConcertA) + 69.0;
    const roundedMidi = Math.round(midiNum);
    const cents = (midiNum - roundedMidi) * 100.0;

    const noteIndex = ((roundedMidi % 12) + 12) % 12;
    const octave = Math.floor(roundedMidi / 12) - 1;

    detectedNoteEl.textContent = NOTE_NAMES[noteIndex];
    detectedOctaveEl.textContent = octave >= 0 ? octave : "";
    detectedFreqEl.textContent = freq.toFixed(1);
    centsValEl.textContent = (cents > 0 ? "+" : "") + cents.toFixed(1);

    // Map cents (-50 to +50) to percentage (0% to 100%)
    const clampedCents = Math.max(-50, Math.min(50, cents));
    const needlePercent = 50 + clampedCents;
    needleEl.style.left = `${needlePercent}%`;

    // Status styling
    if (Math.abs(cents) <= 3.0) {
        setTuningStatus("in-tune", "In Tune");
        needleEl.style.backgroundColor = "var(--accent-green)";
    } else if (cents < -3.0) {
        setTuningStatus("flat", "Flat (Low)");
        needleEl.style.backgroundColor = "var(--accent-amber)";
    } else {
        setTuningStatus("sharp", "Sharp (High)");
        needleEl.style.backgroundColor = "var(--accent-red)";
    }
}

function setTuningStatus(statusClass, text) {
    tuningBadgeEl.className = `tuning-badge status-${statusClass}`;
    tuningBadgeEl.textContent = text;
}

function resetDisplay() {
    detectedNoteEl.textContent = "--";
    detectedOctaveEl.textContent = "";
    detectedFreqEl.textContent = "0.0";
    centsValEl.textContent = "0";
    needleEl.style.left = "50%";
    needleEl.style.backgroundColor = "var(--text-primary)";
}
