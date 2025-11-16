import {
	closeCameraSheet,
	handleCameraPreferenceChange,
	openCameraSheet,
	refreshCameraDevices,
	startWebcam,
	stopWebcam,
	togglePause,
} from "./modules/camera.js";
import {
	initializePoseLandmarker,
	processPose,
	updateExercise,
} from "./modules/pose.js";
import {
	beginSessionMetrics,
	resetStateValues,
	state,
} from "./modules/state.js";
import {
	elements,
	renderResetState,
	renderSessionSummary,
	showLoading,
	syncCameraPreferenceUI,
	updateStatus,
} from "./modules/ui.js";

function initializeUiState() {
	elements.stopBtn.disabled = true;
	elements.pauseBtn.disabled = true;
	elements.pauseBtn.textContent = "Pause";
	if (elements.rearCameraToggle) {
		elements.rearCameraToggle.checked = state.useBackCamera;
	}
	syncCameraPreferenceUI();
	renderSessionSummary(state.lastSessionSummary);
	updateExercise();
	renderResetState();
	updateStatus("ready", "Camera idle");
}

async function handleStartCamera() {
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

	const started = await startWebcam();

	if (started) {
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
}

function handleStopCamera() {
	if (!state.isRunning) {
		return;
	}
	stopWebcam();
	resetStateValues();
	renderResetState();
	renderSessionSummary(state.lastSessionSummary);
	document
		.querySelectorAll(".error-banner, .success-banner")
		.forEach((banner) => banner.remove());
}

function registerEventListeners() {
	elements.cameraBtn.addEventListener("click", handleStartCamera);

	elements.stopBtn.addEventListener("click", handleStopCamera);

	elements.pauseBtn.addEventListener("click", () => {
		togglePause(processPose);
	});

	elements.resetBtn.addEventListener("click", () => {
		resetStateValues();
		renderResetState();
	});

	if (elements.rearCameraToggle) {
		elements.rearCameraToggle.addEventListener("change", (event) => {
			handleCameraPreferenceChange(
				event.target.checked ? "back" : "front"
			);
		});
	}

	if (elements.cameraOptionsBtn && elements.cameraSheet) {
		elements.cameraOptionsBtn.addEventListener("click", openCameraSheet);
		if (elements.closeCameraSheet) {
			elements.closeCameraSheet.addEventListener(
				"click",
				closeCameraSheet
			);
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
		navigator.mediaDevices.addEventListener(
			"devicechange",
			refreshCameraDevices
		);
	}

	elements.exerciseSelect.addEventListener("change", (e) => {
		state.currentExercise = e.target.value;
		updateExercise();
		renderResetState();
	});

	if (elements.debugToggleBtn) {
		elements.debugToggleBtn.addEventListener("click", () => {
			state.debugMode = !state.debugMode;
			if (state.debugMode) {
				elements.debugPanel.style.display = "block";
				elements.debugToggleBtn.textContent = "Hide Debug";
			} else {
				elements.debugPanel.style.display = "none";
				elements.debugToggleBtn.textContent = "Debug";
			}
		});
	}
}

initializeUiState();
registerEventListeners();
