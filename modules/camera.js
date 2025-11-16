import {
	hideProgress,
	renderSessionSummary,
	showError,
	showErrorBanner,
	showProgress,
	syncCameraPreferenceUI,
	updateFeedback,
	updateStatus,
	elements,
} from "./ui.js";
import {
	captureCameraPreference,
	finalizeSessionSummary,
	resetVisibilityTracking,
	restoreCameraPreference,
	state,
} from "./state.js";
import { isMobileDevice } from "./config.js";

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

export function openCameraSheet() {
	if (!elements.cameraSheet) return;
	refreshCameraDevices();
	renderCameraDeviceList();
	elements.cameraSheet.classList.add("open");
	elements.cameraSheet.setAttribute("aria-hidden", "false");
	if (elements.cameraSheetContent) {
		elements.cameraSheetContent.focus();
	}
}

export function closeCameraSheet() {
	if (!elements.cameraSheet) return;
	elements.cameraSheet.classList.remove("open");
	elements.cameraSheet.setAttribute("aria-hidden", "true");
}

export function handleCameraPreferenceChange(value) {
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
			state.preferredFacing = state.useBackCamera
				? "environment"
				: "user";
	}
	if (elements.rearCameraToggle) {
		elements.rearCameraToggle.checked = state.useBackCamera;
	}
	syncCameraPreferenceUI();
	renderCameraDeviceList();
	applyCameraPreferenceChange(previousPreference).catch(() => {});
}

export function selectCameraDevice(deviceId) {
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

export async function refreshCameraDevices() {
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

export function buildCameraConstraints(useRear) {
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

export async function getCameraStream(useRear) {
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

export async function applyCameraPreferenceChange(previousPreference = null) {
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

export async function startWebcam() {
	try {
		showProgress(20, "Requesting camera access...");

		const stream = await getCameraStream(state.useBackCamera);

		showProgress(50, "Initializing video stream...");

		state.webcam = document.createElement("video");
		state.webcam.id = "webcam";
		state.webcam.autoplay = true;
		state.webcam.playsInline = true;
		state.webcam.srcObject = stream;

		await new Promise((resolve) => {
			state.webcam.onloadedmetadata = resolve;
		});

		await state.webcam.play();

		showProgress(80, "Setting up canvas...");

		state.canvas = document.createElement("canvas");
		state.canvas.id = "canvas";
		state.ctx = state.canvas.getContext("2d");
		state.canvas.width = state.webcam.videoWidth;
		state.canvas.height = state.webcam.videoHeight;

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
			showError("No camera found. Please connect a camera and try again.");
		} else {
			showError("Failed to access camera: " + error.message);
		}
		updateStatus("error", "Camera problem");
		return false;
	}
}

export function stopWebcam() {
	if (state.isRunning && state.sessionMetrics.startTime) {
		const summary = finalizeSessionSummary();
		renderSessionSummary(summary);
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

export function togglePause(processPose) {
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
