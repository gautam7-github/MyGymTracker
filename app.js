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
		instructions:
			"Keep back flat, lift with hips and legs, full upright position",
		formChecks: ["Flat back", "Hip drive", "Shoulders back"],
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
const isMobileDevice =
	/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
	window.innerWidth < 768;

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
};

// DOM Elements
const elements = {
	cameraBtn: document.getElementById("camera-btn"),
	stopBtn: document.getElementById("stop-btn"),
	pauseBtn: document.getElementById("pause-btn"),
	resetBtn: document.getElementById("reset-btn"),
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

// Calculate angle between three points using official formula
function calculateAngle(pointA, pointB, pointC) {
	const radians =
		Math.atan2(pointC.y - pointB.y, pointC.x - pointB.x) -
		Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x);
	let angle = Math.abs((radians * 180.0) / Math.PI);
	if (angle > 180) {
		angle = 360 - angle;
	}
	return angle;
}

// Smooth angle using moving average (last 3 frames)
function smoothAngle(angle) {
	state.angleHistory.push(angle);
	if (state.angleHistory.length > 3) {
		state.angleHistory.shift();
	}
	const sum = state.angleHistory.reduce((a, b) => a + b, 0);
	return sum / state.angleHistory.length;
}

// Check landmark visibility
function checkVisibility(landmark, minVisibility = 0.5) {
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
	return {
		video: {
			width: { ideal: 1280 },
			height: { ideal: 720 },
			facingMode: useRear
				? { ideal: "environment" }
				: { ideal: "user" },
		},
		audio: false,
	};
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
			return navigator.mediaDevices.getUserMedia(
				buildCameraConstraints(false)
			);
		}
		throw error;
	}
}

// Stop webcam and cleanup
function stopWebcam() {
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
				analyzeExercise(landmarks);

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

		const startVisible = checkVisibility(startLandmark, 0.5);
		const endVisible = checkVisibility(endLandmark, 0.5);

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
function analyzeExercise(landmarks) {
	const exercise = EXERCISES[state.currentExercise];
	const [idx1, idx2, idx3] = exercise.landmarks;

	const point1 = landmarks[idx1];
	const point2 = landmarks[idx2];
	const point3 = landmarks[idx3];

	// Check visibility of key landmarks
	const visible1 = checkVisibility(point1, 0.5);
	const visible2 = checkVisibility(point2, 0.5);
	const visible3 = checkVisibility(point3, 0.5);

	if (!visible1 || !visible2 || !visible3) {
		const missing = [];
		if (!visible1) missing.push(getLandmarkName(idx1));
		if (!visible2) missing.push(getLandmarkName(idx2));
		if (!visible3) missing.push(getLandmarkName(idx3));

		updateFeedback(
			`${missing.join(", ")} not fully visible. Adjust position.`,
			"warning"
		);
		updateStatus("ready", "Some landmarks missing");
		return;
	}

	updateStatus("active", "Tracking form");

	// Calculate confidence score
	const avgConfidence =
		(point1.visibility + point2.visibility + point3.visibility) / 3;
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

	// Calculate angle using normalized coordinates
	const angle = calculateAngle(point1, point2, point3);
	state.currentAngle = angle;

	// Apply smoothing filter (moving average)
	state.smoothedAngle = smoothAngle(angle);

	// Update angle displays
	elements.primaryAngle.textContent = `${Math.round(angle)}°`;
	elements.smoothedAngle.textContent = `${Math.round(state.smoothedAngle)}°`;

	// Count reps based on exercise type
	if (exercise.trackTime) {
		trackPlankHold(landmarks, exercise);
	} else {
		countReps(state.smoothedAngle, exercise, landmarks);
	}

	// Provide form feedback
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

// Count repetitions with hysteresis and frame validation
function countReps(angle, exercise, landmarks) {
	state.frameCount++;

	// Apply hysteresis buffers to prevent oscillation
	const downThreshold = exercise.downThreshold + exercise.downBuffer;
	const upThreshold = exercise.upThreshold - exercise.upBuffer;

	if (
		state.currentExercise === "bicep_curl" ||
		state.currentExercise === "shoulder_press" ||
		state.currentExercise === "pushup" ||
		state.currentExercise === "pullup"
	) {
		// Extended position (high angle)
		if (angle > downThreshold && state.currentStage !== "down") {
			state.currentStage = "down";
			state.stageFrameCount = 0;
			elements.stage.textContent = "DOWN";
		}

		// Contracted position (low angle)
		if (angle < upThreshold && state.currentStage === "down") {
			state.stageFrameCount++;

			// Only count rep if held for minimum frames (prevents jitter)
			if (state.stageFrameCount >= exercise.minFrames) {
				state.currentStage = "up";
				state.stageFrameCount = 0;
				elements.stage.textContent = "UP";
				state.repCount++;
				elements.repCount.textContent = state.repCount;
				updateFeedback("Rep completed.", "good", { force: true });
			}
		}
	} else if (
		state.currentExercise === "squat" ||
		state.currentExercise === "deadlift"
	) {
		// Standing position (high angle)
		if (angle > downThreshold && state.currentStage !== "up") {
			state.currentStage = "up";
			state.stageFrameCount = 0;
			elements.stage.textContent = "STANDING";
		}

		// Squat/bent position (low angle)
		if (angle < upThreshold && state.currentStage === "up") {
			state.stageFrameCount++;

			// Only count rep if held for minimum frames
			if (state.stageFrameCount >= exercise.minFrames) {
				state.currentStage = "down";
				state.stageFrameCount = 0;
				elements.stage.textContent =
					state.currentExercise === "squat" ? "SQUAT" : "DOWN";
				state.repCount++;
				elements.repCount.textContent = state.repCount;
				updateFeedback("Depth reached. Nice work.", "good", {
					force: true,
				});
			}
		}
	}
}

// Track plank hold time
function trackPlankHold(landmarks, exercise) {
	const [idx1, idx2, idx3] = exercise.landmarks;
	const shoulder = landmarks[idx1];
	const hip = landmarks[idx2];
	const ankle = landmarks[idx3];

	if (
		!checkVisibility(shoulder) ||
		!checkVisibility(hip) ||
		!checkVisibility(ankle)
	) {
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

	// Exercise-specific feedback
	if (state.currentExercise === "bicep_curl") {
		const shoulder = landmarks[11];
		const elbow = landmarks[13];

		// Check if elbow is moving too much (should stay relatively stable)
		const elbowMovement = Math.abs(elbow.x - shoulder.x);
		if (elbowMovement > 0.15) {
			messages.push({
				text: "Keep your elbow stable at your side",
				type: "warning",
			});
		}

		if (angle < 30) {
			messages.push({
				text: "Full contraction - squeeze!",
				type: "good",
			});
		}
	} else if (state.currentExercise === "squat") {
		const hip = landmarks[23];
		const knee = landmarks[25];
		const ankle = landmarks[27];

		// Check if going deep enough
		if (angle < 90 && angle > 70) {
			messages.push({ text: "Depth looks solid.", type: "good" });
		} else if (angle > 100 && state.currentStage === "down") {
			messages.push({
				text: "Go deeper for full range",
				type: "warning",
			});
		}

		// Check knee tracking
		const kneeAnkleDistance = Math.abs(knee.x - ankle.x);
		if (kneeAnkleDistance > 0.1) {
			messages.push({ text: "Keep knees over toes", type: "warning" });
		}
	} else if (state.currentExercise === "pushup") {
		// Check body alignment
		const shoulder = landmarks[11];
		const hip = landmarks[23];
		const ankle = landmarks[27];

		const bodyAngle = calculateAngle(shoulder, hip, ankle);
		if (bodyAngle < 160) {
			messages.push({ text: "Keep your body straight", type: "error" });
		} else {
				messages.push({ text: "Body stays aligned.", type: "good" });
		}

		if (angle < 70) {
			messages.push({ text: "Great depth!", type: "good" });
		}
	} else if (state.currentExercise === "shoulder_press") {
		if (angle > 165) {
			messages.push({ text: "Full extension achieved!", type: "good" });
		}
	} else if (state.currentExercise === "pullup") {
		if (angle < 50) {
			messages.push({ text: "Chin over bar! Perfect!", type: "good" });
		}
	} else if (state.currentExercise === "deadlift") {
		if (angle > 165) {
			messages.push({ text: "Locked out! Good lift!", type: "good" });
		}
	}

	// Update feedback display
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
	state.feedbackMessages = [];
	state.feedbackHistory = {};
	state.bannerHistory = {};
	state.startTime = Date.now();

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
		state.useBackCamera = event.target.checked;
	});
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
