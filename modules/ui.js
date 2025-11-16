import {
	BANNER_COOLDOWN_MS,
	MAX_FEEDBACK_ITEMS,
	FEEDBACK_COOLDOWN_MS,
} from "./config.js";
import { state } from "./state.js";

export const elements = {
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
	confidenceRing: document.getElementById("confidence-ring"),
	formFeedback: document.getElementById("form-feedback"),
	instructions: document.getElementById("instructions"),
	sessionSummary: document.getElementById("sessionSummary"),
	debugPanel: document.getElementById("debug-panel"),
	debugTimestamp: document.getElementById("debug-timestamp"),
	debugDelta: document.getElementById("debug-delta"),
	debugErrors: document.getElementById("debug-errors"),
	videoSection: document.querySelector(".video-section"),
};

export function updateStatus(status, text) {
	elements.statusDot.className = "status-dot " + status;
	elements.statusText.textContent = text;
}

export function updateFPS() {
	state.fpsFrameCount++;
	const now = Date.now();
	if (now - state.lastFpsUpdate >= 1000) {
		state.fps = state.fpsFrameCount;
		elements.fpsValue.textContent = state.fps;

		elements.fpsValue.className = "fps-value";
		if (state.fps < 15) {
			elements.fpsValue.classList.add("low");
		} else if (state.fps < 25) {
			elements.fpsValue.classList.add("medium");
		} else {
			elements.fpsValue.classList.add("high");
		}

		state.fpsFrameCount = 0;
		state.lastFpsUpdate = now;
	}
}

export function renderSessionSummary(summary = null) {
	if (!elements.sessionSummary) return;
	if (!summary) {
		elements.sessionSummary.innerHTML = `
      <h2>Last session</h2>
      <p class="placeholder-text">No session recorded yet.</p>
    `;
		return;
	}
	const { reps, durationMs, avgAngle, avgQuality } = summary;
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

export function shouldDisplayFeedback(text, force = false) {
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

export function renderFeedbackPlaceholder() {
	elements.formFeedback.innerHTML =
		'<p class="placeholder-text">Start exercising to see feedback.</p>';
}

export function displayFeedbackMessages(messages, options = {}) {
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

export function updateFeedback(text, type = "good", options = {}) {
	displayFeedbackMessages(
		[{ text, type }],
		Object.assign({ replace: false }, options)
	);
}

export function updateTimer() {
	if (!state.startTime) return;

	const elapsed = Date.now() - state.startTime;
	const minutes = Math.floor(elapsed / 60000);
	const seconds = Math.floor((elapsed % 60000) / 1000);

	elements.timer.textContent = `${String(minutes).padStart(2, "0")}:${String(
		seconds
	).padStart(2, "0")}`;
}

export function showProgress(percent, message) {
	elements.progressBar.style.display = "flex";
	elements.progressFill.style.width = percent + "%";
	elements.progressText.textContent = message;
}

export function hideProgress() {
	elements.progressBar.style.display = "none";
}

export function showError(message) {
	elements.videoContainer.innerHTML = `
    <div class="status-message">
      <p style="color: #ff3366;">${message}</p>
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

export function showErrorBanner(message) {
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

	if (elements.videoSection) {
		const existing = elements.videoSection.querySelector(".error-banner");
		if (existing) {
			existing.remove();
		}
		elements.videoSection.appendChild(banner);
	}

	setTimeout(() => {
		if (banner.parentElement) {
			banner.remove();
		}
	}, 5000);
}

export function showSuccessBanner(message) {
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

	if (elements.videoSection) {
		const existing = elements.videoSection.querySelector(".success-banner");
		if (existing) {
			existing.remove();
		}
		elements.videoSection.appendChild(banner);
	}

	setTimeout(() => {
		if (banner.parentElement) {
			banner.remove();
		}
	}, 3000);
}

export function showLoading(message) {
	elements.videoContainer.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

export function renderResetState() {
	elements.repCount.textContent = "0";
	elements.stage.textContent = "Waiting";
	elements.primaryAngle.textContent = "-";
	elements.smoothedAngle.textContent = "-";
	elements.timer.textContent = "00:00";
	elements.confidenceValue.textContent = "--";
	elements.confidenceValue.className = "confidence-value";
	updateConfidenceRing(0);
	renderFeedbackPlaceholder();
}

export function syncCameraPreferenceUI() {
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

export function updateConfidenceRing(percent) {
	const clamped = Math.max(0, Math.min(100, percent));
	const dashArray = `${clamped} ${100 - clamped}`;
	if (elements.confidenceRing) {
		elements.confidenceRing.style.setProperty(
			"--confidence-progress",
			clamped
		);
		elements.confidenceRing.style.setProperty(
			"--confidence-dash",
			dashArray
		);
	}
}
