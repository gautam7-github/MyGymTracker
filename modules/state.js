import { isMobileDevice } from "./config.js";

export const state = {
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
	frameTimestamp: 0,
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

export function resetVisibilityTracking() {
	state.activeLandmarkSet = null;
	state.visibilityHistory = new Map();
	state.visibilityLossFrames = 0;
	state.activeLandmarkKey = null;
	state.activeLandmarkScore = null;
	state.lastSideSwitchNotice = 0;
}

export function resetStateValues() {
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
	state.pendingCameraChange = null;
	resetVisibilityTracking();
}

export function beginSessionMetrics() {
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

export function recordSessionSample(angle, confidencePercent) {
	if (!state.sessionMetrics.startTime) return;
	state.sessionMetrics.angleSum += angle;
	state.sessionMetrics.confidenceSum += confidencePercent;
	state.sessionMetrics.angleSamples += 1;
}

export function finalizeSessionSummary() {
	if (!state.sessionMetrics.startTime) {
		return null;
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
	state.sessionMetrics = {
		angleSum: 0,
		confidenceSum: 0,
		angleSamples: 0,
		startTime: null,
	};
	return state.lastSessionSummary;
}

export function captureCameraPreference() {
	return {
		useBackCamera: state.useBackCamera,
		selectedCameraId: state.selectedCameraId,
		preferredFacing: state.preferredFacing,
	};
}

export function restoreCameraPreference(preference = null) {
	if (!preference) return;
	state.useBackCamera = preference.useBackCamera;
	state.selectedCameraId = preference.selectedCameraId;
	state.preferredFacing = preference.preferredFacing;
}
