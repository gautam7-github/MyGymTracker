import { state } from "./state.js";

async function prepareBackend() {
	if (!window.tf) {
		throw new Error("TensorFlow.js not loaded.");
	}
	const current = window.tf.getBackend();
	if (current !== "webgl") {
		try {
			await window.tf.setBackend("webgl");
		} catch (error) {
			console.warn("Unable to switch TF.js backend:", error);
		}
	}
	await window.tf.ready();
}

async function loadMoveNetDetector() {
	if (!window.poseDetection) {
		throw new Error("PoseDetection library not available.");
	}
	await prepareBackend();
	return window.poseDetection.createDetector(
		window.poseDetection.SupportedModels.MoveNet,
		{
			modelType:
				window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
			enableSmoothing: true,
		}
	);
}

export function preloadMoveNetDetector() {
	if (state.moveNetDetector) {
		return Promise.resolve(state.moveNetDetector);
	}
	if (!state.moveNetInitPromise) {
		state.moveNetInitPromise = loadMoveNetDetector()
			.then((detector) => {
				state.moveNetDetector = detector;
				return detector;
			})
			.catch((error) => {
				console.error("MoveNet preload failed:", error);
				state.moveNetInitPromise = null;
				throw error;
			});
	}
	return state.moveNetInitPromise;
}

export async function estimateMoveNet(video) {
	if (!state.moveNetDetector) {
		preloadMoveNetDetector();
		return null;
	}
	return state.moveNetDetector.estimatePoses(video, {
		maxPoses: 1,
		flipHorizontal: false,
	});
}
