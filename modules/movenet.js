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

export async function ensureMoveNetDetector() {
	if (state.moveNetDetector) {
		return state.moveNetDetector;
	}
	if (!window.poseDetection) {
		throw new Error("PoseDetection library not available.");
	}
	await prepareBackend();
	state.moveNetDetector = await window.poseDetection.createDetector(
		window.poseDetection.SupportedModels.MoveNet,
		{
			modelType:
				window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
			enableSmoothing: true,
		}
	);
	return state.moveNetDetector;
}

export async function estimateMoveNet(video) {
	const detector = await ensureMoveNetDetector();
	return detector.estimatePoses(video, {
		maxPoses: 1,
		flipHorizontal: false,
	});
}
