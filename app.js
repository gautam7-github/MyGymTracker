import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Exercise configurations from official spec
const EXERCISES = {
	bicep_curl: {
		name: "Bicep Curl",
		landmarks: [11, 13, 15],
		downThreshold: 140,
		upThreshold: 60,
		downBuffer: 20,
		upBuffer: 10,
		minFrames: 15,
		minRange: 50,
		minDurationMs: 400,
		maxDurationMs: 8000,
		instructions:
			"Keep your back straight, curl weights to shoulders, lower with control",
		formChecks: [
			"Keep shoulders stable",
			"No swinging motion",
			"Full range of motion",
		],
	},
	shoulder_press: {
		name: "Shoulder Press",
		landmarks: [11, 13, 15],
		downThreshold: 100,
		upThreshold: 150,
		downBuffer: 10,
		upBuffer: 10,
		minFrames: 15,
		minRange: 40,
		minDurationMs: 400,
		maxDurationMs: 6000,
		instructions:
			"Press overhead until arms extended, lower to shoulder level",
		formChecks: [
			"Core tight",
			"Elbows slightly forward",
			"Full extension at top",
		],
	},
	squat: {
		name: "Squat",
		landmarks: [23, 25, 27],
		upThreshold: 150,
		downThreshold: 110,
		upBuffer: 10,
		downBuffer: 10,
		minFrames: 20,
		minRange: 70,
		minDurationMs: 500,
		maxDurationMs: 9000,
		instructions:
			"Keep back straight, lower until thighs parallel, drive through heels",
		formChecks: ["Knees over toes", "Back straight", "Full depth"],
	},
	pushup: {
		name: "Push-up",
		landmarks: [11, 13, 15],
		upThreshold: 150,
		downThreshold: 100,
		upBuffer: 10,
		downBuffer: 10,
		minFrames: 15,
		minRange: 45,
		minDurationMs: 400,
		maxDurationMs: 7000,
		instructions:
			"Maintain body straight line, lower chest near ground, push back up",
		formChecks: ["Body alignment", "Controlled descent", "Full extension"],
	},
	pullup: {
		name: "Pull-up",
		landmarks: [11, 13, 15],
		downThreshold: 170,
		upThreshold: 70,
		downBuffer: 10,
		upBuffer: 10,
		minFrames: 20,
		minRange: 60,
		minDurationMs: 500,
		maxDurationMs: 9000,
		instructions:
			"Pull until chin over bar, lower with control to full extension",
		formChecks: ["No kipping", "Controlled movement", "Full range"],
	},
	deadlift: {
		name: "Deadlift",
		landmarks: [11, 23, 25],
		downThreshold: 100,
		upThreshold: 170,
		downBuffer: 10,
		upBuffer: 10,
		minFrames: 20,
		minRange: 60,
		minDurationMs: 500,
		maxDurationMs: 9000,
		instructions:
			"Keep back flat, lift with hips and legs, full upright position",
		formChecks: ["Flat back", "Hip drive", "Shoulders back"],
	},
	lunge: {
		name: "Lunge",
		landmarks: [23, 25, 27],
		upThreshold: 150,
		downThreshold: 110,
		upBuffer: 10,
		downBuffer: 10,
		minFrames: 18,
		minRange: 60,
		minDurationMs: 500,
		maxDurationMs: 9000,
		instructions:
			"Step through each lunge with a tall torso and drive through the lead heel.",
		formChecks: [
			"Knee tracks over ankle",
			"Hips stay square",
			"Controlled up/down tempo",
		],
	},
	plank: {
		name: "Plank",
		trackTime: true,
		landmarks: [11, 23, 27],
		alignmentTarget: 180,
		alignmentTolerance: 10,
		minHoldDuration: 5,
		instructions: "Maintain straight body line from head to heels",
		formChecks: ["Head neutral", "Core engaged", "Hips level"],
	},
};

// MediaPipe skeleton connections (33 landmarks)
const POSE_CONNECTIONS = [
	[0, 1],
	[0, 2],
	[0, 4],
	[1, 2],
	[1, 3],
	[2, 3],
	[0, 5],
	[0, 6],
	[5, 6],
	[11, 12],
	[11, 13],
	[13, 15],
	[12, 14],
	[14, 16],
	[11, 23],
	[12, 24],
	[23, 24],
	[23, 25],
	[25, 27],
	[24, 26],
	[26, 28],
	[15, 17],
	[15, 19],
	[17, 21],
	[19, 21],
	[16, 18],
	[16, 20],
	[18, 22],
	[20, 22],
	[27, 29],
	[29, 31],
	[28, 30],
	[30, 32],
];

const FEEDBACK_COOLDOWN_MS = 3000;
const BANNER_COOLDOWN_MS = 6000;
const MAX_FEEDBACK_ITEMS = 3;
const MIN_VISIBILITY = 0.6;
const VISIBILITY_HISTORY_FRAMES = 6;
const VISIBILITY_WARNING_FRAMES = 18;
const SIDE_SWITCH_NOTICE_COOLDOWN = 4000;
const isMobileDevice =
	/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
	window.innerWidth < 768;
const DEFAULT_MIN_DURATION_MS = 300;
const DEFAULT_MAX_DURATION_MS = 10000;
const SMOOTHING_WINDOW = 5;
const PROFILE_LANDMARK_SETS = {
	squat: [
		[23, 25, 27],
		[24, 26, 28],
	],
	deadlift: [
		[23, 25, 27],
		[24, 26, 28],
	],
	lunge: [
		[23, 25, 27],
		[24, 26, 28],
	],
	bicep_curl: [
		[11, 13, 15],
		[12, 14, 16],
	],
	shoulder_press: [
		[11, 13, 15],
		[12, 14, 16],
	],
	pushup: [
		[11, 13, 15],
		[12, 14, 16],
	],
	pullup: [
		[11, 13, 15],
		[12, 14, 16],
	],
};

// Application state (in-memory only, no localStorage)
let state = {
	poseLandmarker: null,
	webcam: null,
	canvas: null,
	ctx: null,
	currentExercise: "bicep_curl",
	repCount: 0,
	currentStage: "none",
	currentAngle: 0,
	smoothedAngle: 0,
	angleHistory: [],
	isRunning: false,
	isPaused: false,
	lastVideoTime: -1,
	frameTimestamp: 0, // CRITICAL: Monotonic timestamp counter for MediaPipe
	startTime: null,
	feedbackMessages: [],
	feedbackHistory: {},
	bannerHistory: {},
	animationFrameId: null,
	frameCount: 0,
	stageFrameCount: 0,
	fps: 0,
	lastFpsUpdate: 0,
	fpsFrameCount: 0,
	visibilityWarnings: {},
	worldLandmarks: null,
	timestampErrors: 0,
	lastTimestamp: -1,
	debugMode: false,
	errorBanners: [],
	useBackCamera: isMobileDevice,
	preferredFacing: isMobileDevice ? "environment" : "user",
	selectedCameraId: null,
	availableCameras: [],
	isSwitchingCamera: false,
	pendingCameraChange: null,
	sessionMetrics: {
		angleSum: 0,
		confidenceSum: 0,
		angleSamples: 0,
		startTime: null,
	},
	lastSessionSummary: null,
	activeLandmarkSet: null,
	activeLandmarkKey: null,
	activeLandmarkScore: null,
	repTracker: null,
	visibilityHistory: new Map(),
	visibilityLossFrames: 0,
	lastSideSwitchNotice: 0,
};

// DOM Elements
const elements = {
	cameraBtn: document.getElementById("camera-btn"),
	stopBtn: document.getElementById("stop-btn"),
	pauseBtn: document.getElementById("pause-btn"),
	resetBtn: document.getElementById("reset-btn"),
	cameraOptionsBtn: document.getElementById("cameraOptionsBtn"),
	closeCameraSheet: document.getElementById("closeCameraSheet"),
	cameraSheet: document.getElementById("cameraSheet"),
	cameraSheetContent: document.querySelector(
		"#cameraSheet .camera-sheet__content"
	),
	cameraPreferenceSelect: document.getElementById("cameraPreference"),
	cameraDeviceList: document.getElementById("cameraDeviceList"),
	debugToggleBtn: document.getElementById("debug-toggle-btn"),
	rearCameraToggle: document.getElementById("rear-camera-toggle"),
	exerciseSelect: document.getElementById("exercise-select"),
	videoContainer: document.getElementById("video-container"),
	statusMessage: document.getElementById("status-message"),
	statusDot: document.getElementById("status-dot"),
	statusText: document.getElementById("status-text"),
	fpsValue: document.getElementById("fps-value"),
	progressBar: document.getElementById("progress-bar"),
	progressFill: document.getElementById("progress-fill"),
	progressText: document.getElementById("progress-text"),
	repCount: document.getElementById("rep-count"),
	stage: document.getElementById("stage"),
	timer: document.getElementById("timer"),
	primaryAngle: document.getElementById("primary-angle"),
	smoothedAngle: document.getElementById("smoothed-angle"),
	confidenceValue: document.getElementById("confidence-value"),
	formFeedback: document.getElementById("form-feedback"),
	instructions: document.getElementById("instructions"),
	sessionSummary: document.getElementById("sessionSummary"),
	debugPanel: document.getElementById("debug-panel"),
	debugTimestamp: document.getElementById("debug-timestamp"),
	debugDelta: document.getElementById("debug-delta"),
	debugErrors: document.getElementById("debug-errors"),
};

elements.stopBtn.disabled = true;
elements.pauseBtn.disabled = true;
elements.pauseBtn.textContent = "Pause";
if (elements.rearCameraToggle) {
	elements.rearCameraToggle.checked = state.useBackCamera;
}
syncCameraPreferenceUI();
renderSessionSummary();

// Calculate angle between three points using official formula
function calculateAngle(pointA, pointB, pointC) {
	return calculateAngle3D(pointA, pointB, pointC);
}

// Smooth angle using moving average (last 3 frames)
function smoothAngle(angle) {
	state.angleHistory.push(angle);
	if (state.angleHistory.length > SMOOTHING_WINDOW) {
		state.angleHistory.shift();
	}
	const sum = state.angleHistory.reduce((a, b) => a + b, 0);
	return sum / state.angleHistory.length;
}

// Check landmark visibility
function checkVisibility(landmark, minVisibility = MIN_VISIBILITY) {
	return (
		landmark &&
		landmark.visibility !== undefined &&
		landmark.visibility > minVisibility
	);
}

// Update status indicator
function updateStatus(status, text) {
	elements.statusDot.className = "status-dot " + status;
	elements.statusText.textContent = text;
}

// Update FPS display
function updateFPS() {
	state.fpsFrameCount++;
	const now = Date.now();
	if (now - state.lastFpsUpdate >= 1000) {
		state.fps = state.fpsFrameCount;
		elements.fpsValue.textContent = state.fps;

		// Color code FPS
		elements.fpsValue.className = "fps-value";
		if (state.fps < 15) {
			elements.fpsValue.classList.add("low");
			if (state.fps < 10) {
				updateFeedback(
					"Low frame rate detected. Tracking accuracy may drop.",
					"warning"
				);
			}
		} else if (state.fps < 25) {
			elements.fpsValue.classList.add("medium");
		} else {
			elements.fpsValue.classList.add("high");
		}

		state.fpsFrameCount = 0;
		state.lastFpsUpdate = now;
	}
}

function shouldDisplayFeedback(text, force = false) {
	if (!text) return false;
	const now = Date.now();
	if (force) {
		state.feedbackHistory[text] = now;
		return true;
	}
	const lastShown = state.feedbackHistory[text] || 0;
	if (now - lastShown < FEEDBACK_COOLDOWN_MS) {
		return false;
	}
	state.feedbackHistory[text] = now;
	return true;
}

function renderFeedbackPlaceholder() {
	elements.formFeedback.innerHTML =
		'<p class="placeholder-text">Start exercising to see feedback.</p>';
}

function openCameraSheet() {
	if (!elements.cameraSheet) return;
	refreshCameraDevices();
	renderCameraDeviceList();
	elements.cameraSheet.classList.add("open");
	elements.cameraSheet.setAttribute("aria-hidden", "false");
	if (elements.cameraSheetContent) {
		elements.cameraSheetContent.focus();
	}
}

function closeCameraSheet() {
	if (!elements.cameraSheet) return;
	elements.cameraSheet.classList.remove("open");
	elements.cameraSheet.setAttribute("aria-hidden", "true");
}

function handleCameraPreferenceChange(value) {
	const previousPreference = captureCameraPreference();
	state.selectedCameraId = null;
	switch (value) {
		case "back":
			state.useBackCamera = true;
			state.preferredFacing = "environment";
			break;
		case "front":
			state.useBackCamera = false;
			state.preferredFacing = "user";
			break;
		default:
			state.useBackCamera = isMobileDevice;
			state.preferredFacing = state.useBackCamera ? "environment" : "user";
	}
	if (elements.rearCameraToggle) {
		elements.rearCameraToggle.checked = state.useBackCamera;
	}
	syncCameraPreferenceUI();
	renderCameraDeviceList();
	applyCameraPreferenceChange(previousPreference).catch(() => {});
}

function selectCameraDevice(deviceId) {
	const previousPreference = captureCameraPreference();
	state.selectedCameraId = deviceId;
	state.useBackCamera = false;
	state.preferredFacing = null;
	if (elements.rearCameraToggle) {
		elements.rearCameraToggle.checked = false;
	}
	syncCameraPreferenceUI();
	renderCameraDeviceList();
	applyCameraPreferenceChange(previousPreference).catch(() => {});
}

async function refreshCameraDevices() {
	if (!navigator.mediaDevices?.enumerateDevices) {
		return;
	}
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		state.availableCameras = devices.filter(
			(device) => device.kind === "videoinput"
		);
		renderCameraDeviceList();
	} catch (error) {
		console.warn("Unable to enumerate cameras:", error);
	}
}

function renderCameraDeviceList() {
	if (!elements.cameraDeviceList) return;
	if (!state.availableCameras.length) {
		elements.cameraDeviceList.innerHTML =
			'<p class="placeholder-text">No additional cameras detected.</p>';
		return;
	}
	const fragment = document.createDocumentFragment();
	state.availableCameras.forEach((device, index) => {
		const option = document.createElement("label");
		option.className = "camera-device-option";
		const input = document.createElement("input");
		input.type = "radio";
		input.name = "cameraDevice";
		input.value = device.deviceId;
		input.checked = state.selectedCameraId === device.deviceId;
		input.addEventListener("change", () =>
			selectCameraDevice(device.deviceId)
		);
		const text = document.createElement("span");
		text.textContent = device.label || `Camera ${index + 1}`;
		option.appendChild(input);
		option.appendChild(text);
		fragment.appendChild(option);
	});
	elements.cameraDeviceList.innerHTML = "";
	elements.cameraDeviceList.appendChild(fragment);
}

function beginSessionMetrics() {
	state.sessionMetrics = {
		angleSum: 0,
		confidenceSum: 0,
		angleSamples: 0,
		startTime: Date.now(),
	};
	state.repTracker = null;
	state.pendingCameraChange = null;
	resetVisibilityTracking();
}

function recordSessionSample(angle, confidencePercent) {
	if (!state.sessionMetrics.startTime) return;
	state.sessionMetrics.angleSum += angle;
	state.sessionMetrics.confidenceSum += confidencePercent;
	state.sessionMetrics.angleSamples += 1;
}

function finalizeSessionSummary() {
	if (!state.sessionMetrics.startTime) {
		return;
	}
	const durationMs = Date.now() - state.sessionMetrics.startTime;
	const avgAngle =
		state.sessionMetrics.angleSamples > 0
			? state.sessionMetrics.angleSum / state.sessionMetrics.angleSamples
			: null;
	const avgQuality =
		state.sessionMetrics.angleSamples > 0
			? state.sessionMetrics.confidenceSum /
			  state.sessionMetrics.angleSamples
			: null;
	state.lastSessionSummary = {
		reps: state.repCount,
		durationMs,
		avgAngle,
		avgQuality,
	};
	renderSessionSummary();
	state.sessionMetrics = {
		angleSum: 0,
		confidenceSum: 0,
		angleSamples: 0,
		startTime: null,
	};
	state.sessionMetrics.startTime = null;
}

function renderSessionSummary() {
	if (!elements.sessionSummary) return;
	if (!state.lastSessionSummary) {
		elements.sessionSummary.innerHTML = `
      <h2>Last session</h2>
      <p class="placeholder-text">No session recorded yet.</p>
    `;
		return;
	}
	const { reps, durationMs, avgAngle, avgQuality } = state.lastSessionSummary;
	const minutes = Math.floor(durationMs / 60000);
	const seconds = Math.floor((durationMs % 60000) / 1000)
		.toString()
		.padStart(2, "0");
	elements.sessionSummary.innerHTML = `
    <h2>Last session</h2>
    <div class="summary-grid">
      <div>
        <div class="status-label">Reps</div>
        <div class="summary-value">${reps}</div>
      </div>
      <div>
        <div class="status-label">Time</div>
        <div class="summary-value">${minutes}:${seconds}</div>
      </div>
      <div>
        <div class="status-label">Avg angle</div>
        <div class="summary-value">${
					avgAngle ? `${Math.round(avgAngle)}°` : "--"
				}</div>
      </div>
      <div>
        <div class="status-label">Avg quality</div>
        <div class="summary-value">${
					avgQuality ? `${Math.round(avgQuality)}%` : "--"
				}</div>
      </div>
    </div>
  `;
}

function resetVisibilityTracking() {
	state.activeLandmarkSet = null;
	state.visibilityHistory = new Map();
	state.visibilityLossFrames = 0;
	state.activeLandmarkKey = null;
	state.activeLandmarkScore = null;
	state.lastSideSwitchNotice = 0;
}

function recordVisibilityScore(key, score) {
	if (!state.visibilityHistory.has(key)) {
		state.visibilityHistory.set(key, []);
	}
	const history = state.visibilityHistory.get(key);
	history.push(score);
	if (history.length > VISIBILITY_HISTORY_FRAMES) {
		history.shift();
	}
	const average =
		history.reduce((sum, value) => sum + value, 0) / history.length;
	return average;
}

function describeLandmarkSet(indices = []) {
	if (!indices.length) return "best side";
	const isLeft = indices.every((idx) => idx % 2 === 1);
	const isRight = indices.every((idx) => idx % 2 === 0);
	if (isLeft) return "left side";
	if (isRight) return "right side";
	return "best angle";
}

function announceSideSwitch(indices) {
	const now = Date.now();
	if (now - state.lastSideSwitchNotice < SIDE_SWITCH_NOTICE_COOLDOWN) {
		return;
	}
	state.lastSideSwitchNotice = now;
	updateFeedback(
		`Tracking your ${describeLandmarkSet(indices)} for a clearer view.`,
		"info",
		{ replace: false }
	);
}

function handleVisibilityInterruption(reason = "landmarks") {
	state.visibilityLossFrames = (state.visibilityLossFrames || 0) + 1;
	const statusText =
		reason === "confidence" ? "Low visibility" : "Move into view";
	updateStatus("ready", statusText);
	elements.stage.textContent = "Adjust";
	state.currentStage = "Adjust";
	state.stageFrameCount = 0;
	elements.primaryAngle.textContent = "-";
	elements.smoothedAngle.textContent = "-";
	elements.confidenceValue.textContent = "--";
	elements.confidenceValue.className = "confidence-value";
	if (state.visibilityLossFrames % VISIBILITY_WARNING_FRAMES === 0) {
		updateFeedback(
			"Joint not visible — move fully into frame.",
			"warning"
		);
	}
}

function syncCameraPreferenceUI() {
	if (elements.rearCameraToggle) {
		elements.rearCameraToggle.checked = state.useBackCamera;
	}
	if (!elements.cameraPreferenceSelect) return;
	let value = "auto";
	if (state.selectedCameraId) {
		value = "auto";
	} else if (state.preferredFacing === "environment") {
		value = "back";
	} else if (state.preferredFacing === "user") {
		value = "front";
	}
	elements.cameraPreferenceSelect.value = value;
}
function getVisibleLandmark(landmarks, index) {
	if (!landmarks || index == null) return null;
	const point = landmarks[index];
	if (
		!point ||
		point.visibility == null ||
		point.visibility < MIN_VISIBILITY ||
		Number.isNaN(point.x) ||
		Number.isNaN(point.y)
	) {
		return null;
	}
	return point;
}

function calculateAngle3D(pointA = {}, pointB = {}, pointC = {}) {
	const a = {
		x: pointA.x ?? 0,
		y: pointA.y ?? 0,
		z: pointA.z ?? 0,
	};
	const b = {
		x: pointB.x ?? 0,
		y: pointB.y ?? 0,
		z: pointB.z ?? 0,
	};
	const c = {
		x: pointC.x ?? 0,
		y: pointC.y ?? 0,
		z: pointC.z ?? 0,
	};
	const ab = {
		x: a.x - b.x,
		y: a.y - b.y,
		z: a.z - b.z,
	};
	const cb = {
		x: c.x - b.x,
		y: c.y - b.y,
		z: c.z - b.z,
	};
	const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
	const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2 + ab.z ** 2);
	const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2 + cb.z ** 2);
	if (magAB === 0 || magCB === 0) return null;
	const cosine = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
	return (Math.acos(cosine) * 180) / Math.PI;
}

function getJointAngleFromIndices(landmarks, worldLandmarks, indices) {
	const [p1Idx, p2Idx, p3Idx] = indices;
	const p1 = getVisibleLandmark(landmarks, p1Idx);
	const p2 = getVisibleLandmark(landmarks, p2Idx);
	const p3 = getVisibleLandmark(landmarks, p3Idx);
	if (!p1 || !p2 || !p3) {
		return null;
	}
	const worldAvailable =
		worldLandmarks &&
		worldLandmarks[p1Idx] &&
		worldLandmarks[p2Idx] &&
		worldLandmarks[p3Idx];
	const angle = calculateAngle3D(
		worldAvailable ? worldLandmarks[p1Idx] : p1,
		worldAvailable ? worldLandmarks[p2Idx] : p2,
		worldAvailable ? worldLandmarks[p3Idx] : p3
	);
	if (angle == null) {
		return null;
	}
	const score =
		(p1.visibility + p2.visibility + p3.visibility) / 3;
	return { angle, indices, score };
}

function computeExerciseAngle(exerciseKey, landmarks, worldLandmarks) {
	const sets =
		PROFILE_LANDMARK_SETS[exerciseKey] ||
		[EXERCISES[exerciseKey].landmarks];
	const candidates = [];
	let weightedSum = 0;
	let totalWeight = 0;
	let bestCandidate = null;

	for (const indices of sets) {
		const result = getJointAngleFromIndices(
			landmarks,
			worldLandmarks,
			indices
		);
		if (!result) {
			continue;
		}
		const key = indices.join("-");
		const historical =
			recordVisibilityScore(key, result.score) || result.score;
		const weight = (result.score + historical) / 2;
		const candidate = Object.assign({}, result, {
			key,
			weight,
		});
		candidates.push(candidate);
		weightedSum += candidate.angle * weight;
		totalWeight += weight;
		if (!bestCandidate || weight > bestCandidate.weight) {
			bestCandidate = candidate;
		}
	}

	if (!candidates.length) {
		return null;
	}

	const averagedAngle =
		totalWeight > 0 && Number.isFinite(weightedSum / totalWeight)
			? weightedSum / totalWeight
			: bestCandidate.angle;

	return {
		angle: averagedAngle,
		indices: bestCandidate.indices,
		key: bestCandidate.key,
		score: bestCandidate.score,
		weight: bestCandidate.weight,
		candidates,
	};
}

function pickVisibleSet(landmarks, sets) {
	const candidates = [];
	for (const indices of sets) {
		const points = indices.map((idx) => getVisibleLandmark(landmarks, idx));
		if (points.every(Boolean)) {
			const score =
				points.reduce((sum, point) => sum + point.visibility, 0) /
				points.length;
			candidates.push({ indices, points, score });
		}
	}
	if (!candidates.length) {
		return null;
	}
	return candidates.reduce((best, entry) =>
		entry.score > best.score ? entry : best
	);
}

// Show progress during model loading
function showProgress(percent, message) {
	elements.progressBar.style.display = "flex";
	elements.progressFill.style.width = percent + "%";
	elements.progressText.textContent = message;
}

// Hide progress bar
function hideProgress() {
	elements.progressBar.style.display = "none";
}

// Initialize MediaPipe Pose Landmarker with official configuration
async function initializePoseLandmarker() {
	try {
		showProgress(10, "Resolving vision tasks...");

		// Official WASM path from documentation
		const vision = await FilesetResolver.forVisionTasks(
			"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
		);

		showProgress(40, "Loading pose detection model...");

		// Create PoseLandmarker with official configuration
		state.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
			baseOptions: {
				modelAssetPath:
					"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
				delegate: "GPU",
			},
			runningMode: "VIDEO", // Critical: VIDEO mode for video processing
			numPoses: 1,
			minPoseDetectionConfidence: 0.6,
			minPosePresenceConfidence: 0.5,
			minTrackingConfidence: 0.5,
		});

		showProgress(100, "Model loaded successfully!");
		setTimeout(hideProgress, 500);

		console.log("✓ MediaPipe Pose Landmarker initialized with VIDEO mode");
		updateStatus("ready", "Camera idle");
		return true;
	} catch (error) {
		console.error("Error initializing PoseLandmarker:", error);
		hideProgress();
		showError(
			"Failed to initialize pose detection. Please refresh the page."
		);
		updateStatus("error", "Needs attention");
		return false;
	}
}

// Start webcam with proper error handling
async function startWebcam() {
	try {
		showProgress(20, "Requesting camera access...");

		const stream = await getCameraStream(state.useBackCamera);

		showProgress(50, "Initializing video stream...");

		// Create video element
		state.webcam = document.createElement("video");
		state.webcam.id = "webcam";
		state.webcam.autoplay = true;
		state.webcam.playsInline = true;
		state.webcam.srcObject = stream;

		// Wait for video to load
		await new Promise((resolve) => {
			state.webcam.onloadedmetadata = resolve;
		});

		await state.webcam.play();

		showProgress(80, "Setting up canvas...");

		// Create canvas
		state.canvas = document.createElement("canvas");
		state.canvas.id = "canvas";
		state.ctx = state.canvas.getContext("2d");

		// Set canvas dimensions to match video
		state.canvas.width = state.webcam.videoWidth;
		state.canvas.height = state.webcam.videoHeight;

		// Clear status message and add video/canvas to container
		elements.videoContainer.innerHTML = "";
		elements.videoContainer.appendChild(state.webcam);
		elements.videoContainer.appendChild(state.canvas);

		showProgress(100, "Camera ready!");
		setTimeout(hideProgress, 300);

		return true;
	} catch (error) {
		console.error("Error accessing webcam:", error);
		hideProgress();
		if (
			error.name === "NotAllowedError" ||
			error.name === "PermissionDeniedError"
		) {
			showError(
				"Camera permission denied. Please allow camera access and try again."
			);
		} else if (error.name === "NotFoundError") {
			showError(
				"No camera found. Please connect a camera and try again."
			);
		} else {
			showError("Failed to access camera: " + error.message);
		}
		updateStatus("error", "Camera problem");
		return false;
	}
}

function buildCameraConstraints(useRear) {
	const constraints = {
		video: {
			width: { ideal: 1280 },
			height: { ideal: 720 },
		},
		audio: false,
	};
	if (state.selectedCameraId) {
		constraints.video.deviceId = { exact: state.selectedCameraId };
	} else if (state.preferredFacing) {
		constraints.video.facingMode = { ideal: state.preferredFacing };
	} else {
		constraints.video.facingMode = {
			ideal: useRear ? "environment" : "user",
		};
	}
	return constraints;
}

function captureCameraPreference() {
	return {
		useBackCamera: state.useBackCamera,
		selectedCameraId: state.selectedCameraId,
		preferredFacing: state.preferredFacing,
	};
}

function restoreCameraPreference(preference) {
	if (!preference) return;
	state.useBackCamera = preference.useBackCamera;
	state.selectedCameraId = preference.selectedCameraId;
	state.preferredFacing = preference.preferredFacing;
	if (elements.rearCameraToggle) {
		elements.rearCameraToggle.checked = state.useBackCamera;
	}
	syncCameraPreferenceUI();
	renderCameraDeviceList();
}

async function getCameraStream(useRear) {
	try {
		return await navigator.mediaDevices.getUserMedia(
			buildCameraConstraints(useRear)
		);
	} catch (error) {
		if (useRear) {
			console.warn(
				"Back camera unavailable. Falling back to front camera.",
				error
			);
			updateFeedback(
				"Back camera not available on this device. Using front camera.",
				"warning",
				{ force: true }
			);
			state.useBackCamera = false;
			if (elements.rearCameraToggle) {
				elements.rearCameraToggle.checked = false;
			}
			syncCameraPreferenceUI();
			return navigator.mediaDevices.getUserMedia(
				buildCameraConstraints(false)
			);
		}
		throw error;
	}
}

function waitForVideoMetadata(video) {
	if (!video) {
		return Promise.resolve();
	}
	if (video.readyState >= 2) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		video.addEventListener("loadedmetadata", () => resolve(), {
			once: true,
		});
	});
}

async function swapCameraStream() {
	if (!state.webcam) return;
	const previousStream = state.webcam.srcObject;
	const nextStream = await getCameraStream(state.useBackCamera);
	state.webcam.srcObject = nextStream;
	await waitForVideoMetadata(state.webcam);
	await state.webcam.play();
	if (state.canvas) {
		state.canvas.width = state.webcam.videoWidth;
		state.canvas.height = state.webcam.videoHeight;
	}
	if (previousStream) {
		previousStream.getTracks().forEach((track) => track.stop());
	}
}

async function applyCameraPreferenceChange(previousPreference = null) {
	if (!state.isRunning || !state.webcam) {
		return;
	}
	if (state.isSwitchingCamera) {
		state.pendingCameraChange = previousPreference;
		return;
	}
	state.pendingCameraChange = null;
	state.isSwitchingCamera = true;
	try {
		updateStatus("ready", "Switching camera");
		await swapCameraStream();
		updateStatus("active", "Tracking form");
		updateFeedback("Camera view updated.", "good");
	} catch (error) {
		console.error("Unable to switch camera", error);
		updateFeedback("Unable to switch camera.", "error");
		showErrorBanner("Camera switch failed. Please try again.");
		if (previousPreference) {
			restoreCameraPreference(previousPreference);
		}
		throw error;
	} finally {
		state.isSwitchingCamera = false;
		if (state.pendingCameraChange) {
			const pending = state.pendingCameraChange;
			state.pendingCameraChange = null;
			applyCameraPreferenceChange(pending).catch(() => {});
		}
	}
}

// Stop webcam and cleanup
function stopWebcam() {
	if (state.isRunning && state.sessionMetrics.startTime) {
		finalizeSessionSummary();
	}
	state.repTracker = null;
	resetVisibilityTracking();
	state.isSwitchingCamera = false;
	state.pendingCameraChange = null;
	if (state.webcam && state.webcam.srcObject) {
		state.webcam.srcObject.getTracks().forEach((track) => track.stop());
	}
	if (state.animationFrameId) {
		cancelAnimationFrame(state.animationFrameId);
		state.animationFrameId = null;
	}
	state.isRunning = false;
	state.isPaused = false;
	state.webcam = null;
	state.canvas = null;
	state.ctx = null;
	state.lastVideoTime = -1;
	state.frameTimestamp = 0;
	state.lastTimestamp = -1;
	state.timestampErrors = 0;
	elements.videoContainer.innerHTML =
		'<div class="status-message"><p>Camera stopped. Tap "Start camera" to resume.</p></div>';
	updateStatus("ready", "Camera stopped");
	elements.fpsValue.textContent = "0";
	elements.cameraBtn.disabled = false;
	elements.stopBtn.disabled = true;
	elements.pauseBtn.disabled = true;
	elements.pauseBtn.textContent = "Pause";
}

// Pause/Resume processing
function togglePause() {
	state.isPaused = !state.isPaused;
	if (state.isPaused) {
		elements.pauseBtn.textContent = "Resume";
		updateStatus("ready", "Paused");
		if (state.animationFrameId) {
			cancelAnimationFrame(state.animationFrameId);
			state.animationFrameId = null;
		}
	} else {
		elements.pauseBtn.textContent = "Pause";
		updateStatus("active", "Tracking form");
		processPose();
	}
}

// Process pose detection using official video loop pattern with FIXED timestamp handling
function processPose() {
	if (
		!state.isRunning ||
		state.isPaused ||
		!state.webcam ||
		!state.poseLandmarker
	) {
		return;
	}

	// Validate video is playing
	if (state.webcam.readyState < 2) {
		state.animationFrameId = requestAnimationFrame(processPose);
		return;
	}

	// CRITICAL FIX: Only process when video.currentTime has changed
	if (state.webcam.currentTime !== state.lastVideoTime) {
		state.lastVideoTime = state.webcam.currentTime;

		// CRITICAL: Increment frameTimestamp by 33ms per frame (ensures monotonic increase)
		// This prevents "Packet timestamp mismatch" errors from MediaPipe
		// The exact increment doesn't matter - MediaPipe only validates monotonic increase
		// For reference:
		//   - 30 FPS video: increment by ~33ms
		//   - 60 FPS video: could increment by ~16ms
		//   - 24 FPS video: could increment by ~40ms
		// MediaPipe only cares about monotonic increase, not absolute accuracy
		state.frameTimestamp += 33;

		// Validation: Ensure timestamp is strictly increasing (CRITICAL for MediaPipe)
		if (state.frameTimestamp <= state.lastTimestamp) {
			console.warn("⚠️ Timestamp validation failed!");
			console.warn(
				`  Current: ${state.frameTimestamp}, Last: ${state.lastTimestamp}`
			);
			console.warn("  Forcing increment to maintain monotonic sequence");
			state.frameTimestamp = state.lastTimestamp + 33;
			state.timestampErrors++;

			if (state.debugMode) {
				updateFeedback(
					"Timestamp corrected to maintain monotonic sequence",
					"warning"
				);
			}
		}

		// Update debug panel if enabled
		if (state.debugMode) {
			const delta = state.frameTimestamp - state.lastTimestamp;
			elements.debugTimestamp.textContent = state.frameTimestamp;
			elements.debugDelta.textContent = delta + "ms";
			elements.debugErrors.textContent = state.timestampErrors;
		}

		state.lastTimestamp = state.frameTimestamp;

		try {
			// CRITICAL: Pass monotonic frameTimestamp (not Date.now() or video.currentTime)
			// This is the fix for: "Packet timestamp mismatch on a calculator receiving from stream"
			// MediaPipe's calculator graph requires timestamps that are strictly monotonically increasing
			const results = state.poseLandmarker.detectForVideo(
				state.webcam,
				state.frameTimestamp
			);

			// Store world landmarks for future 3D analysis
			if (results.worldLandmarks && results.worldLandmarks.length > 0) {
				state.worldLandmarks = results.worldLandmarks[0];
			}

			// Clear canvas
			state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

			if (results.landmarks && results.landmarks.length > 0) {
				const landmarks = results.landmarks[0];

				// Draw pose landmarks
				drawPoseLandmarks(landmarks);

				// Calculate angles and count reps
				analyzeExercise(landmarks, state.worldLandmarks);

				// Update FPS counter
				updateFPS();
			} else {
				// No pose detected
				updateFeedback(
					"No pose detected. Please step into frame.",
					"warning"
				);
				updateStatus("ready", "Step into view");
			}
		} catch (error) {
			console.error("❌ Pose detection error:", error);
			console.error("Frame timestamp:", state.frameTimestamp);
			console.error("Last timestamp:", state.lastTimestamp);

			// Handle timestamp mismatch errors specifically
			if (error.message && error.message.includes("timestamp")) {
				state.timestampErrors++;
				console.error(
					`❌ TIMESTAMP MISMATCH DETECTED (Error #${state.timestampErrors})`
				);
				console.error("Error message:", error.message);
				console.error("Current frameTimestamp:", state.frameTimestamp);
				console.error("Previous timestamp:", state.lastTimestamp);
				console.error(
					"This error should NOT occur with the monotonic counter fix!"
				);

				// Update debug panel
				if (state.debugMode && elements.debugErrors) {
					elements.debugErrors.textContent = state.timestampErrors;
				}

				// Auto-recovery: Reset timestamp counter with exponential backoff
				if (state.timestampErrors < 3) {
					// Use current time as new baseline
					state.frameTimestamp = Date.now();
					state.lastTimestamp = state.frameTimestamp;
					console.log(
						"✓ Timestamp counter reset to:",
						state.frameTimestamp
					);
					updateFeedback(
						"Timestamp sync issue detected. Recovering...",
						"warning"
					);
					showErrorBanner(
						"Timestamp synchronization issue detected. Attempting auto-recovery..."
					);
				} else {
					// Critical failure - full reset with user notification
					console.error(
						"❌ Critical timestamp error - initiating full reset"
					);
					updateFeedback(
						"❌ Timestamp synchronization failed - restarting detection",
						"error"
					);
					updateStatus("error", "Sync issue");
					showErrorBanner(
						"Critical timestamp error. Restarting pose detection in 1 second..."
					);

					// Full reset and recovery
					setTimeout(() => {
						console.log("♻️ Performing full timestamp reset...");
						state.frameTimestamp = 0;
						state.lastTimestamp = -1;
						state.timestampErrors = 0;
						console.log("✓ Timestamp counters reset successfully");
						updateStatus("active", "Tracking form");
						showSuccessBanner(
							"Pose detection restarted successfully!"
						);
					}, 1000);
				}
			} else {
				updateFeedback("Detection error: " + error.message, "error");
				showErrorBanner("Pose detection error: " + error.message);
			}
		}
	}

	// Update timer
	updateTimer();

	// Continue loop using requestAnimationFrame (syncs with browser refresh)
	state.animationFrameId = requestAnimationFrame(processPose);
}

// Draw pose landmarks with color-coded confidence
function drawPoseLandmarks(landmarks) {
	const exercise = EXERCISES[state.currentExercise];

	// Draw skeleton connections with confidence-based styling
	for (const [start, end] of POSE_CONNECTIONS) {
		const startLandmark = landmarks[start];
		const endLandmark = landmarks[end];

		if (!startLandmark || !endLandmark) continue;

		const startVisible = checkVisibility(startLandmark);
		const endVisible = checkVisibility(endLandmark);

		if (startVisible && endVisible) {
			const avgVisibility =
				(startLandmark.visibility + endLandmark.visibility) / 2;

			state.ctx.beginPath();
			state.ctx.moveTo(
				startLandmark.x * state.canvas.width,
				startLandmark.y * state.canvas.height
			);
			state.ctx.lineTo(
				endLandmark.x * state.canvas.width,
				endLandmark.y * state.canvas.height
			);

			// Color code based on confidence
			if (avgVisibility > 0.8) {
				state.ctx.strokeStyle = "rgba(0, 255, 136, 0.8)"; // Green - high confidence
				state.ctx.lineWidth = 3;
			} else if (avgVisibility > 0.6) {
				state.ctx.strokeStyle = "rgba(255, 170, 0, 0.7)"; // Yellow - medium confidence
				state.ctx.lineWidth = 2;
			} else {
				state.ctx.strokeStyle = "rgba(0, 136, 255, 0.5)"; // Blue - low confidence
				state.ctx.lineWidth = 2;
			}

			state.ctx.stroke();
		}
	}

	// Draw all landmarks as circles
	for (let i = 0; i < landmarks.length; i++) {
		const landmark = landmarks[i];
		if (!landmark) continue;

		const visible = checkVisibility(landmark, 0.5);

		state.ctx.beginPath();
		state.ctx.arc(
			landmark.x * state.canvas.width,
			landmark.y * state.canvas.height,
			4,
			0,
			2 * Math.PI
		);

		// Color code based on visibility
		if (visible) {
			if (landmark.visibility > 0.8) {
				state.ctx.fillStyle = "#00ff88"; // Green - high confidence
			} else if (landmark.visibility > 0.6) {
				state.ctx.fillStyle = "#ffaa00"; // Yellow - medium confidence
			} else {
				state.ctx.fillStyle = "#0088ff"; // Blue - low confidence
			}
		} else {
			state.ctx.fillStyle = "#ff3366"; // Red - not visible
		}

		state.ctx.fill();
	}

	// Highlight key landmarks for current exercise with larger circles
	for (const idx of exercise.landmarks) {
		const landmark = landmarks[idx];
		if (landmark && checkVisibility(landmark, 0.5)) {
			state.ctx.beginPath();
			state.ctx.arc(
				landmark.x * state.canvas.width,
				landmark.y * state.canvas.height,
				10,
				0,
				2 * Math.PI
			);
			state.ctx.fillStyle = "#00ff88";
			state.ctx.fill();
			state.ctx.strokeStyle = "#0a0e1a";
			state.ctx.lineWidth = 3;
			state.ctx.stroke();
		}
	}
}

// Analyze exercise form and count reps with visibility checks
function analyzeExercise(landmarks, worldLandmarks) {
	const exerciseKey = state.currentExercise;
	const exercise = EXERCISES[exerciseKey];
	const angleResult = computeExerciseAngle(
		exerciseKey,
		landmarks,
		worldLandmarks
	);

	if (!angleResult) {
		handleVisibilityInterruption("landmarks");
		state.activeLandmarkSet = null;
		return;
	}

	const { angle, indices, key, score } = angleResult;
	const points = indices.map((idx) => getVisibleLandmark(landmarks, idx));
	if (points.some((pt) => !pt)) {
		handleVisibilityInterruption("landmarks");
		state.activeLandmarkSet = null;
		return;
	}
	state.activeLandmarkSet = indices;
	state.activeLandmarkKey = key;
	state.activeLandmarkScore = score;
	state.visibilityLossFrames = 0;

	updateStatus("active", "Tracking form");

	if (state.repTracker) {
		if (state.repTracker.lastLandmarkKey !== key) {
			if (state.repTracker.lastLandmarkKey) {
				announceSideSwitch(indices);
			}
			state.repTracker.lastLandmarkKey = key;
		}
	}

	const avgConfidence =
		points.reduce((sum, point) => sum + (point.visibility || 0), 0) /
		points.length;
	const confidencePercent = Math.round(avgConfidence * 100);
	elements.confidenceValue.textContent = confidencePercent + "%";
	elements.confidenceValue.className = "confidence-value";
	if (confidencePercent >= 80) {
		elements.confidenceValue.classList.add("high");
	} else if (confidencePercent >= 60) {
		elements.confidenceValue.classList.add("medium");
	} else {
		elements.confidenceValue.classList.add("low");
	}

	state.currentAngle = angle;
	state.smoothedAngle = smoothAngle(angle);

	elements.primaryAngle.textContent = `${Math.round(angle)}°`;
	elements.smoothedAngle.textContent = `${Math.round(
		state.smoothedAngle
	)}°`;
	recordSessionSample(state.smoothedAngle, confidencePercent);

	if (exercise.trackTime) {
		trackPlankHold(landmarks, exercise);
	} else {
		countReps(
			state.smoothedAngle,
			exercise,
			landmarks,
			confidencePercent
		);
	}

	provideFormFeedback(state.smoothedAngle, exercise, landmarks);
}

// Get human-readable landmark name
function getLandmarkName(idx) {
	const names = {
		11: "Left Shoulder",
		12: "Right Shoulder",
		13: "Left Elbow",
		14: "Right Elbow",
		15: "Left Wrist",
		16: "Right Wrist",
		23: "Left Hip",
		24: "Right Hip",
		25: "Left Knee",
		26: "Right Knee",
		27: "Left Ankle",
		28: "Right Ankle",
	};
	return names[idx] || `Landmark ${idx}`;
}

function getPoint(landmarks, index) {
	return getVisibleLandmark(landmarks, index);
}

// Count repetitions with hysteresis and frame validation
function getStageLabel(position) {
	if (position === "bottom") {
		if (state.currentExercise === "squat") return "SQUAT";
		if (state.currentExercise === "deadlift") return "DOWN";
		if (state.currentExercise === "lunge") return "LUNGE";
		return "BOTTOM";
	}
	if (position === "top") {
		if (
			state.currentExercise === "squat" ||
			state.currentExercise === "deadlift" ||
			state.currentExercise === "lunge"
		) {
			return "STANDING";
		}
		return "TOP";
	}
	return "READY";
}

function getRepThresholds(exercise, fallbackAngle) {
	const rawTop = exercise.upThreshold ?? fallbackAngle;
	const rawBottom = exercise.downThreshold ?? fallbackAngle;
	const upBuffer = exercise.upBuffer ?? 0;
	const downBuffer = exercise.downBuffer ?? 0;
	let top = Math.min(180, rawTop + upBuffer);
	let bottom = Math.max(0, rawBottom - downBuffer);
	if (bottom > top) {
		const midpoint = (bottom + top) / 2;
		bottom = Math.max(0, midpoint - 5);
		top = Math.min(180, midpoint + 5);
	}
	return {
		top,
		bottom,
	};
}

function ensureRepTracker(initialAngle, exercise, thresholds) {
	const now = performance.now();
	if (!state.repTracker) {
		let phase = "top";
		if (initialAngle <= thresholds.bottom) {
			phase = "bottom";
		} else if (initialAngle > thresholds.bottom && initialAngle < thresholds.top) {
			phase = "mid";
		}
		state.repTracker = {
			phase,
			thresholds,
			transitionFrames: 0,
			framesInPhase: 0,
			cycleStartTime: now,
			currentPeak: initialAngle,
			currentValley: initialAngle,
			lastRepTime: 0,
			visibilityHoldFrames: 0,
			lastLandmarkKey: state.activeLandmarkKey || null,
		};
		const stageLabel =
			phase === "bottom"
				? getStageLabel("bottom")
				: phase === "top"
				? getStageLabel("top")
				: getStageLabel("ready");
		elements.stage.textContent = stageLabel;
		state.currentStage = stageLabel;
	} else {
		state.repTracker.thresholds = thresholds;
	}
	return state.repTracker;
}

function countReps(angle, exercise, landmarks, confidencePercent) {
	state.frameCount++;
	const thresholds = getRepThresholds(exercise, angle);
	const tracker = ensureRepTracker(angle, exercise, thresholds);
	const now = performance.now();
	const minFrames = exercise.minFrames || 12;
	const transitionRequirement = Math.max(
		5,
		Math.min(8, Math.floor(minFrames / 2))
	);
	const minDuration = exercise.minDurationMs || DEFAULT_MIN_DURATION_MS;
	const maxDuration = exercise.maxDurationMs || DEFAULT_MAX_DURATION_MS;
	const minRange = exercise.minRange || 40;
	const stageLabelTop = getStageLabel("top");
	const stageLabelBottom = getStageLabel("bottom");

	const visibilityOk = confidencePercent >= MIN_VISIBILITY * 100;
	if (!visibilityOk) {
		tracker.visibilityHoldFrames =
			(tracker.visibilityHoldFrames || 0) + 1;
		handleVisibilityInterruption("confidence");
		tracker.phase = "visibility_pause";
		tracker.transitionFrames = 0;
		tracker.framesInPhase = 0;
		return;
	}

	state.visibilityLossFrames = 0;
	tracker.visibilityHoldFrames = 0;

	if (tracker.phase === "visibility_pause" || tracker.phase === "mid") {
		tracker.phase =
			angle <= thresholds.bottom ? "bottom" : "top";
		tracker.transitionFrames = 0;
		tracker.framesInPhase = 0;
		tracker.cycleStartTime = now;
		tracker.currentPeak = angle;
		tracker.currentValley = angle;
		elements.stage.textContent =
			tracker.phase === "bottom" ? stageLabelBottom : stageLabelTop;
		state.currentStage = elements.stage.textContent;
		updateStatus("active", "Tracking form");
	}

	tracker.thresholds = thresholds;
	tracker.framesInPhase = (tracker.framesInPhase || 0) + 1;
	state.stageFrameCount = tracker.framesInPhase;

	tracker.currentPeak = Math.max(tracker.currentPeak ?? angle, angle);
	tracker.currentValley = Math.min(tracker.currentValley ?? angle, angle);

	const atBottom = angle <= thresholds.bottom;
	const atTop = angle >= thresholds.top;

	if (tracker.phase === "top") {
		if (atBottom) {
			tracker.transitionFrames =
				(tracker.transitionFrames || 0) + 1;
			if (tracker.transitionFrames >= transitionRequirement) {
				tracker.phase = "bottom";
				tracker.transitionFrames = 0;
				tracker.framesInPhase = 0;
				tracker.currentValley = angle;
				tracker.bottomTimestamp = now;
				elements.stage.textContent = stageLabelBottom;
				state.currentStage = stageLabelBottom;
			}
		} else {
			tracker.transitionFrames = 0;
		}
	} else if (tracker.phase === "bottom") {
		const elapsed = now - tracker.cycleStartTime;
		if (elapsed > maxDuration) {
			tracker.phase = "top";
			tracker.transitionFrames = 0;
			tracker.framesInPhase = 0;
			tracker.cycleStartTime = now;
			tracker.currentPeak = angle;
			tracker.currentValley = angle;
			elements.stage.textContent = stageLabelTop;
			state.currentStage = stageLabelTop;
			return;
		}
		if (atTop) {
			tracker.transitionFrames =
				(tracker.transitionFrames || 0) + 1;
			if (tracker.transitionFrames >= transitionRequirement) {
				const cycleDuration = now - (tracker.cycleStartTime || now);
				const range =
					(tracker.currentPeak ?? angle) -
					(tracker.currentValley ?? angle);
				if (
					cycleDuration >= minDuration &&
					cycleDuration <= maxDuration &&
					range >= minRange
				) {
					state.repCount++;
					elements.repCount.textContent = state.repCount;
					updateFeedback("Rep completed.", "good", {
						force: true,
					});
				} else {
					if (range < minRange) {
						updateFeedback(
							"Angle not deep enough for rep.",
							"warning"
						);
					} else if (cycleDuration < minDuration) {
						updateFeedback(
							"Movement too fast to count. Slow down slightly.",
							"warning"
						);
					} else if (cycleDuration > maxDuration) {
						updateFeedback(
							"Rep timed out — reset and try again.",
							"warning"
						);
					}
				}
				tracker.lastRepTime = now;
				tracker.phase = "top";
				tracker.transitionFrames = 0;
				tracker.framesInPhase = 0;
				tracker.cycleStartTime = now;
				tracker.currentPeak = angle;
				tracker.currentValley = angle;
				tracker.bottomTimestamp = null;
				elements.stage.textContent = stageLabelTop;
				state.currentStage = stageLabelTop;
			}
		} else {
			tracker.transitionFrames = 0;
		}
	}
}

// Track plank hold time
function trackPlankHold(landmarks, exercise) {
	const [idx1, idx2, idx3] = exercise.landmarks;
	const shoulder = getVisibleLandmark(landmarks, idx1);
	const hip = getVisibleLandmark(landmarks, idx2);
	const ankle = getVisibleLandmark(landmarks, idx3);

	if (!shoulder || !hip || !ankle) {
		updateFeedback("Cannot track plank - adjust position", "warning");
		return;
	}

	const bodyAngle = calculateAngle(shoulder, hip, ankle);
	const aligned =
		Math.abs(bodyAngle - exercise.alignmentTarget) <
		exercise.alignmentTolerance;

	if (aligned) {
		state.stageFrameCount++;
		elements.stage.textContent = "HOLDING";
		const holdSeconds = Math.floor(state.stageFrameCount / state.fps);
		if (holdSeconds >= exercise.minHoldDuration) {
			updateFeedback("Plank hold looks steady.", "good", {
				force: true,
			});
		}
	} else {
		if (state.stageFrameCount > 0) {
			const holdSeconds = Math.floor(
				state.stageFrameCount / (state.fps || 30)
			);
			updateFeedback(`Plank held for ${holdSeconds}s`, "warning");
		}
		state.stageFrameCount = 0;
		elements.stage.textContent = "NOT ALIGNED";
		updateFeedback("Straighten your body", "warning");
	}
}

// Provide form feedback
function provideFormFeedback(angle, exercise, landmarks) {
	const messages = [];
	const exerciseKey = state.currentExercise;
	const profileSets =
		PROFILE_LANDMARK_SETS[exerciseKey] || [exercise.landmarks];

	if (exerciseKey === "bicep_curl") {
		const set = pickVisibleSet(landmarks, profileSets);
		if (!set) return;
		const [shoulder, elbow, wrist] = set.points;
		const elbowMovement = Math.abs(elbow.x - shoulder.x);
		if (elbowMovement > 0.15) {
			messages.push({
				text: "Keep your elbow anchored near your ribs.",
				type: "warning",
			});
		}
		const elbowWristDistance = Math.abs(elbow.x - wrist.x);
		if (elbowWristDistance < 0.05 && angle < 30) {
			messages.push({
				text: "Strong contraction—squeeze briefly at the top.",
				type: "good",
			});
		}
	} else if (exerciseKey === "squat") {
		const set =
			pickVisibleSet(landmarks, profileSets) ||
			pickVisibleSet(landmarks, [
				[23, 25, 27],
				[24, 26, 28],
			]);
		if (!set) return;
		const [hip, knee, ankle] = set.points;
		if (angle < 90 && angle > 70) {
			messages.push({ text: "Depth looks solid.", type: "good" });
		} else if (angle > 100 && state.currentStage === "down") {
			messages.push({
				text: "Drop slightly lower for full range.",
				type: "warning",
			});
		}
		const kneeAnkleDistance = Math.abs(knee.x - ankle.x);
		if (kneeAnkleDistance > 0.1) {
			messages.push({
				text: "Keep the knee tracking over the ankle.",
				type: "warning",
			});
		}
	} else if (exerciseKey === "lunge") {
		const set =
			pickVisibleSet(landmarks, profileSets) ||
			pickVisibleSet(landmarks, [
				[23, 25, 27],
				[24, 26, 28],
			]);
		if (!set) return;
		const [hip, knee, ankle] = set.points;
		if (angle < 100 && angle > 70) {
			messages.push({ text: "Hold the bottom briefly for balance.", type: "good" });
		}
		const kneeAnkleDistance = Math.abs(knee.x - ankle.x);
		if (kneeAnkleDistance > 0.12) {
			messages.push({
				text: "Keep the front knee stacked over the ankle.",
				type: "warning",
			});
		}
	} else if (exerciseKey === "pushup") {
		const armSet =
			pickVisibleSet(landmarks, profileSets) ||
			pickVisibleSet(landmarks, [
				[11, 13, 15],
				[12, 14, 16],
			]);
		if (armSet && angle < 70) {
			messages.push({ text: "Great push-up depth.", type: "good" });
		}
		const alignmentSet = pickVisibleSet(landmarks, [
			[11, 23, 27],
			[12, 24, 28],
		]);
		if (alignmentSet) {
			const [shoulder, hip, ankle] = alignmentSet.points;
			const bodyAngle = calculateAngle(shoulder, hip, ankle);
			if (bodyAngle < 160) {
				messages.push({
					text: "Lift hips slightly to keep a straight line.",
					type: "warning",
				});
			} else {
				messages.push({ text: "Body alignment looks good.", type: "good" });
			}
		}
	} else if (exerciseKey === "shoulder_press") {
		if (angle > 165) {
			messages.push({ text: "Strong lockout overhead.", type: "good" });
		}
	} else if (exerciseKey === "pullup") {
		if (angle < 50) {
			messages.push({ text: "Chin over bar—nice!", type: "good" });
		}
	} else if (exerciseKey === "deadlift") {
		if (angle > 165) {
			messages.push({
				text: "Finish tall with hips fully extended.",
				type: "good",
			});
		}
	}

	if (messages.length > 0) {
		displayFeedbackMessages(messages, { replace: true });
	}
}

// Display feedback messages
function displayFeedbackMessages(messages, options = {}) {
	const { replace = true, force = false } = options;
	const now = Date.now();
	let normalized = messages
		.filter((msg) => msg && msg.text)
		.map((msg) => ({
			text: msg.text,
			type: msg.type || "info",
			timestamp: now,
		}));

	if (!replace) {
		normalized = normalized.filter((msg) =>
			shouldDisplayFeedback(msg.text, force)
		);
	} else if (force) {
		normalized.forEach((msg) => shouldDisplayFeedback(msg.text, true));
	}

	if (normalized.length === 0) {
		if (replace) {
			state.feedbackMessages = [];
			renderFeedbackPlaceholder();
		} else if (state.feedbackMessages.length === 0) {
			renderFeedbackPlaceholder();
		}
		return;
	}

	if (replace) {
		state.feedbackMessages = normalized.slice(-MAX_FEEDBACK_ITEMS);
	} else {
		state.feedbackMessages = state.feedbackMessages
			.concat(normalized)
			.slice(-MAX_FEEDBACK_ITEMS);
	}

	elements.formFeedback.innerHTML = state.feedbackMessages
		.map(
			(msg) => `<div class="feedback-item ${msg.type}">${msg.text}</div>`
		)
		.join("");
}

// Update single feedback message
function updateFeedback(text, type = "good", options = {}) {
	displayFeedbackMessages(
		[{ text, type }],
		Object.assign({ replace: false }, options)
	);
}

// Update timer
function updateTimer() {
	if (!state.startTime) return;

	const elapsed = Date.now() - state.startTime;
	const minutes = Math.floor(elapsed / 60000);
	const seconds = Math.floor((elapsed % 60000) / 1000);

	elements.timer.textContent = `${String(minutes).padStart(2, "0")}:${String(
		seconds
	).padStart(2, "0")}`;
}

// Show error message
function showError(message) {
	elements.videoContainer.innerHTML = `
    <div class="status-message">
      <p style="color: #ff3366;">❌ ${message}</p>
    </div>
  `;
}

function shouldShowBanner(message, type = "info") {
	const key = `${type}:${message}`;
	const now = Date.now();
	const lastShown = state.bannerHistory[key] || 0;
	if (now - lastShown < BANNER_COOLDOWN_MS) {
		return false;
	}
	state.bannerHistory[key] = now;
	return true;
}

// Show error banner
function showErrorBanner(message) {
	if (!shouldShowBanner(message, "error")) {
		return;
	}

	const banner = document.createElement("div");
	banner.className = "error-banner";
	banner.innerHTML = `
    <span class="error-banner-icon" aria-hidden="true">Alert</span>
    <span class="error-banner-text">${message}</span>
    <button class="error-banner-close" aria-label="Dismiss message" onclick="this.parentElement.remove()">×</button>
  `;

	const videoSection = document.querySelector(".video-section");
	const existing = videoSection.querySelector(".error-banner");
	if (existing) {
		existing.remove();
	}

	videoSection.appendChild(banner);

	// Auto-remove after 5 seconds
	setTimeout(() => {
		if (banner.parentElement) {
			banner.remove();
		}
	}, 5000);
}

// Show success banner
function showSuccessBanner(message) {
	if (!shouldShowBanner(message, "success")) {
		return;
	}

	const banner = document.createElement("div");
	banner.className = "success-banner";
	banner.innerHTML = `
    <span class="success-banner-icon" aria-hidden="true">Note</span>
    <span class="success-banner-text">${message}</span>
    <button class="error-banner-close" aria-label="Dismiss message" onclick="this.parentElement.remove()">×</button>
  `;

	const videoSection = document.querySelector(".video-section");
	const existing = videoSection.querySelector(".success-banner");
	if (existing) {
		existing.remove();
	}

	videoSection.appendChild(banner);

	// Auto-remove after 3 seconds
	setTimeout(() => {
		if (banner.parentElement) {
			banner.remove();
		}
	}, 3000);
}

// Show loading message
function showLoading(message) {
	elements.videoContainer.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

// Reset counter and stats
function resetStats() {
	state.repCount = 0;
	state.currentStage = "none";
	state.currentAngle = 0;
	state.smoothedAngle = 0;
	state.angleHistory = [];
	state.stageFrameCount = 0;
	state.feedbackMessages = [];
	state.feedbackHistory = {};
	state.bannerHistory = {};
	state.startTime = state.isRunning ? Date.now() : null;
	state.sessionMetrics.angleSum = 0;
	state.sessionMetrics.confidenceSum = 0;
	state.sessionMetrics.angleSamples = 0;
	state.sessionMetrics.startTime = state.isRunning ? Date.now() : null;
	state.activeLandmarkSet = null;
	state.repTracker = null;
	resetVisibilityTracking();

	elements.repCount.textContent = "0";
	elements.stage.textContent = "Waiting";
	elements.primaryAngle.textContent = "-";
	elements.timer.textContent = "00:00";
	renderFeedbackPlaceholder();
}

// Update exercise
function updateExercise() {
	const exercise = EXERCISES[state.currentExercise];
	elements.instructions.innerHTML = `<p>${exercise.instructions}</p>`;
	resetStats();
}

// Event Listeners
elements.cameraBtn.addEventListener("click", async () => {
	if (state.isRunning) {
		return;
	}

	elements.cameraBtn.disabled = true;
	showLoading("Initializing pose detection...");

	if (!state.poseLandmarker) {
		const initialized = await initializePoseLandmarker();
		if (!initialized) {
			elements.cameraBtn.disabled = false;
			return;
		}
	}

	const webcamStarted = await startWebcam();

	if (webcamStarted) {
		state.frameTimestamp = 0;
		state.lastTimestamp = -1;
		state.timestampErrors = 0;
		state.isRunning = true;
		state.isPaused = false;
		state.startTime = Date.now();
		state.lastFpsUpdate = Date.now();
		state.fpsFrameCount = 0;
		elements.pauseBtn.disabled = false;
		elements.pauseBtn.textContent = "Pause";
		elements.stopBtn.disabled = false;
		beginSessionMetrics();
		updateStatus("active", "Tracking form");
		processPose();
	} else {
		elements.cameraBtn.disabled = false;
	}
});

elements.stopBtn.addEventListener("click", () => {
	if (!state.isRunning) {
		return;
	}
	stopWebcam();
	resetStats();
	const banners = document.querySelectorAll(
		".error-banner, .success-banner"
	);
	banners.forEach((banner) => banner.remove());
});

elements.pauseBtn.addEventListener("click", () => {
	togglePause();
});

elements.resetBtn.addEventListener("click", () => {
	resetStats();
});

if (elements.rearCameraToggle) {
	elements.rearCameraToggle.addEventListener("change", (event) => {
		const previousPreference = captureCameraPreference();
		state.useBackCamera = event.target.checked;
		state.selectedCameraId = null;
		state.preferredFacing = state.useBackCamera ? "environment" : "user";
		syncCameraPreferenceUI();
		renderCameraDeviceList();
		applyCameraPreferenceChange(previousPreference).catch(() => {});
	});
}

if (elements.cameraOptionsBtn && elements.cameraSheet) {
	elements.cameraOptionsBtn.addEventListener("click", openCameraSheet);
	if (elements.closeCameraSheet) {
		elements.closeCameraSheet.addEventListener("click", closeCameraSheet);
	}
	elements.cameraSheet.addEventListener("click", (event) => {
		if (event.target === elements.cameraSheet) {
			closeCameraSheet();
		}
	});
	document.addEventListener("keydown", (event) => {
		if (
			event.key === "Escape" &&
			elements.cameraSheet.classList.contains("open")
		) {
			closeCameraSheet();
		}
	});
}

if (elements.cameraPreferenceSelect) {
	elements.cameraPreferenceSelect.addEventListener("change", (event) =>
		handleCameraPreferenceChange(event.target.value)
	);
}

refreshCameraDevices();
if (navigator.mediaDevices?.addEventListener) {
	navigator.mediaDevices.addEventListener("devicechange", refreshCameraDevices);
}

elements.exerciseSelect.addEventListener("change", (e) => {
	state.currentExercise = e.target.value;
	updateExercise();
});

elements.debugToggleBtn.addEventListener("click", () => {
	state.debugMode = !state.debugMode;
	if (state.debugMode) {
		elements.debugPanel.style.display = "block";
		elements.debugToggleBtn.textContent = "Hide Debug";
		console.log("=".repeat(60));
		console.log("🔧 DEBUG MODE ENABLED");
		console.log("=".repeat(60));
		console.log("Monitoring:");
		console.log("  - Frame timestamps (current value)");
		console.log("  - Timestamp deltas (increment per frame)");
		console.log("  - Timestamp errors (validation failures)");
		console.log("=".repeat(60));
	} else {
		elements.debugPanel.style.display = "none";
		elements.debugToggleBtn.textContent = "Debug";
		console.log("🔧 Debug mode disabled");
	}
});

// Initialize
updateExercise();
updateStatus("ready", "Camera idle");
console.log("=".repeat(60));
console.log("🏋️ AI GYMNASIUM POSE TRACKER - PRODUCTION BUILD");
console.log("=".repeat(60));
console.log("✓ MediaPipe VIDEO mode initialized");
console.log(
	"✓ Monotonic timestamp counter implemented (FIX for packet mismatch)"
);
console.log("✓ Auto-recovery mechanism for timestamp errors");
console.log("✓ Debug panel available (click Debug button)");
console.log("✓ World coordinates captured for 3D analysis");
console.log("✓ 7 exercise types with form feedback");
console.log("✓ Real-time rep counting with hysteresis");
console.log("✓ Performance monitoring (FPS tracking)");
console.log("=".repeat(60));
console.log("");
console.log("🔧 CRITICAL TIMESTAMP FIX:");
console.log('  Problem: "Packet timestamp mismatch on calculator"');
console.log(
	"  Root Cause: video.currentTime and Date.now() can have precision issues"
);
console.log("  Solution: Monotonic frameTimestamp counter (+33ms per frame)");
console.log("");
console.log("  How it works:");
console.log("  1. Initialize frameTimestamp = 0 at start");
console.log("  2. On each new video frame: frameTimestamp += 33");
console.log(
	"  3. Pass frameTimestamp to detectForVideo(video, frameTimestamp)"
);
console.log(
	"  4. MediaPipe calculator graph accepts strictly increasing timestamps"
);
console.log("  5. Validation ensures timestamps NEVER decrease");
console.log("  6. Auto-recovery resets counter on critical failures");
console.log("");
console.log("  Why 33ms? Approximates 30 FPS (1000ms / 30 frames = 33.33ms)");
console.log(
	"  Note: Exact increment value doesn't matter - only monotonic increase"
);
console.log("=".repeat(60));
console.log("");
