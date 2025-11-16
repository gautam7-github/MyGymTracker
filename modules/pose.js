import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import {
	DEFAULT_MAX_DURATION_MS,
	DEFAULT_MIN_DURATION_MS,
	EXERCISES,
	MIN_VISIBILITY,
	POSE_CONNECTIONS,
	PROFILE_LANDMARK_SETS,
	SMOOTHING_WINDOW,
	SIDE_SWITCH_NOTICE_COOLDOWN,
	VISIBILITY_HISTORY_FRAMES,
	VISIBILITY_WARNING_FRAMES,
} from "./config.js";
import {
	recordSessionSample,
	resetStateValues,
	state,
} from "./state.js";
import {
	displayFeedbackMessages,
	elements,
	renderFeedbackPlaceholder,
	showError,
	showErrorBanner,
	showProgress,
	hideProgress,
	showSuccessBanner,
	updateFeedback,
	updateFPS,
	updateStatus,
	updateTimer,
} from "./ui.js";

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

function smoothAngle(angle) {
	state.angleHistory.push(angle);
	if (state.angleHistory.length > SMOOTHING_WINDOW) {
		state.angleHistory.shift();
	}
	const sum = state.angleHistory.reduce((a, b) => a + b, 0);
	return sum / state.angleHistory.length;
}

function checkVisibility(landmark, minVisibility = MIN_VISIBILITY) {
	return (
		landmark &&
		landmark.visibility !== undefined &&
		landmark.visibility > minVisibility
	);
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

function getStageLabels() {
	return {
		top: getStageLabel("top"),
		bottom: getStageLabel("bottom"),
	};
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
	const { top: stageLabelTop, bottom: stageLabelBottom } = getStageLabels();

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

function trackPlankHold(landmarks, exercise) {
	const [idx1, idx2, idx3] = exercise.landmarks;
	const shoulder = getVisibleLandmark(landmarks, idx1);
	const hip = getVisibleLandmark(landmarks, idx2);
	const ankle = getVisibleLandmark(landmarks, idx3);

	if (!shoulder || !hip || !ankle) {
		updateFeedback("Cannot track plank - adjust position", "warning");
		return;
	}

	const bodyAngle = calculateAngle3D(shoulder, hip, ankle);
	const aligned =
		Math.abs(bodyAngle - exercise.alignmentTarget) <
		exercise.alignmentTolerance;

	if (aligned) {
		state.stageFrameCount++;
		elements.stage.textContent = "HOLDING";
		const holdSeconds = Math.floor(state.stageFrameCount / (state.fps || 30));
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
			messages.push({
				text: "Hold the bottom briefly for balance.",
				type: "good",
			});
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
			const bodyAngle = calculateAngle3D(shoulder, hip, ankle);
			if (bodyAngle < 160) {
				messages.push({
					text: "Lift hips slightly to keep a straight line.",
					type: "warning",
				});
			} else {
				messages.push({
					text: "Body alignment looks good.",
					type: "good",
				});
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

	const exerciseConfig = EXERCISES[state.currentExercise];
	if (exerciseConfig.trackTime) {
		trackPlankHold(landmarks, exerciseConfig);
	} else {
		countReps(
			state.smoothedAngle,
			exerciseConfig,
			landmarks,
			confidencePercent
		);
	}

	provideFormFeedback(state.smoothedAngle, exerciseConfig, landmarks);
}

export async function initializePoseLandmarker() {
	try {
		showProgress(10, "Resolving vision tasks...");

		const vision = await FilesetResolver.forVisionTasks(
			"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
		);

		showProgress(40, "Loading pose detection model...");

		state.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
			baseOptions: {
				modelAssetPath:
					"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
				delegate: "GPU",
			},
			runningMode: "VIDEO",
			numPoses: 1,
			minPoseDetectionConfidence: 0.6,
			minPosePresenceConfidence: 0.5,
			minTrackingConfidence: 0.5,
		});

		showProgress(100, "Model loaded successfully!");
		setTimeout(hideProgress, 500);

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

function drawPoseLandmarks(landmarks) {
	const exercise = EXERCISES[state.currentExercise];

	for (const [start, end] of POSE_CONNECTIONS) {
		const startLandmark = landmarks[start];
		const endLandmark = landmarks[end];

		if (!startLandmark || !endLandmark) continue;

		const startVisible =
			startLandmark.visibility && startLandmark.visibility > MIN_VISIBILITY;
		const endVisible =
			endLandmark.visibility && endLandmark.visibility > MIN_VISIBILITY;

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

			if (avgVisibility > 0.8) {
				state.ctx.strokeStyle = "rgba(0, 255, 136, 0.8)";
				state.ctx.lineWidth = 3;
			} else if (avgVisibility > 0.6) {
				state.ctx.strokeStyle = "rgba(255, 170, 0, 0.7)";
				state.ctx.lineWidth = 2;
			} else {
				state.ctx.strokeStyle = "rgba(0, 136, 255, 0.5)";
				state.ctx.lineWidth = 2;
			}

			state.ctx.stroke();
		}
	}

	for (let i = 0; i < landmarks.length; i++) {
		const landmark = landmarks[i];
		if (!landmark) continue;

		const visible = landmark.visibility && landmark.visibility > 0.5;

		state.ctx.beginPath();
		state.ctx.arc(
			landmark.x * state.canvas.width,
			landmark.y * state.canvas.height,
			4,
			0,
			2 * Math.PI
		);

		if (visible) {
			if (landmark.visibility > 0.8) {
				state.ctx.fillStyle = "#00ff88";
			} else if (landmark.visibility > 0.6) {
				state.ctx.fillStyle = "#ffaa00";
			} else {
				state.ctx.fillStyle = "#0088ff";
			}
		} else {
			state.ctx.fillStyle = "#ff3366";
		}

		state.ctx.fill();
	}

	for (const idx of exercise.landmarks) {
		const landmark = landmarks[idx];
		if (landmark && landmark.visibility > 0.5) {
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

export function processPose() {
	if (
		!state.isRunning ||
		state.isPaused ||
		!state.webcam ||
		!state.poseLandmarker
	) {
		return;
	}

	if (state.webcam.readyState < 2) {
		state.animationFrameId = requestAnimationFrame(processPose);
		return;
	}

	if (state.webcam.currentTime !== state.lastVideoTime) {
		state.lastVideoTime = state.webcam.currentTime;
		state.frameTimestamp += 33;

		if (state.frameTimestamp <= state.lastTimestamp) {
			state.frameTimestamp = state.lastTimestamp + 33;
			state.timestampErrors++;
			if (state.debugMode) {
				updateFeedback(
					"Timestamp corrected to maintain monotonic sequence",
					"warning"
				);
			}
		}

		if (state.debugMode) {
			const delta = state.frameTimestamp - state.lastTimestamp;
			if (elements.debugTimestamp) {
				elements.debugTimestamp.textContent = String(
					state.frameTimestamp
				);
			}
			if (elements.debugDelta) {
				elements.debugDelta.textContent = `${delta}ms`;
			}
			if (elements.debugErrors) {
				elements.debugErrors.textContent = String(
					state.timestampErrors
				);
			}
		}

		try {
			const results = state.poseLandmarker.detectForVideo(
				state.webcam,
				state.frameTimestamp
			);

			if (results.worldLandmarks && results.worldLandmarks.length > 0) {
				state.worldLandmarks = results.worldLandmarks[0];
			}

			if (state.debugMode && elements.debugTimestamp) {
				elements.debugTimestamp.textContent = String(
					state.frameTimestamp
				);
			}
			state.lastTimestamp = state.frameTimestamp;

			if (results?.landmarks?.length) {
				const landmarks = results.landmarks[0];
				state.ctx.clearRect(
					0,
					0,
					state.canvas.width,
					state.canvas.height
				);
				drawPoseLandmarks(landmarks);
				analyzeExercise(landmarks, state.worldLandmarks);
				updateFPS();
			} else {
				updateFeedback(
					"No pose detected. Please step into frame.",
					"warning"
				);
				updateStatus("ready", "Step into view");
			}
		} catch (error) {
			console.error("Pose detection error:", error);

			if (error.message && error.message.includes("timestamp")) {
				state.timestampErrors++;
				if (state.debugMode && elements.debugErrors) {
					elements.debugErrors.textContent = state.timestampErrors;
				}

				if (state.timestampErrors < 3) {
					state.frameTimestamp = Date.now();
					state.lastTimestamp = state.frameTimestamp;
					updateFeedback(
						"Timestamp sync issue detected. Recovering...",
						"warning"
					);
					showErrorBanner(
						"Timestamp synchronization issue detected. Attempting auto-recovery..."
					);
				} else {
					updateFeedback(
						"Timestamp synchronization failed - restarting detection",
						"error"
					);
					updateStatus("error", "Sync issue");
					showErrorBanner(
						"Critical timestamp error. Restarting pose detection in 1 second..."
					);
					setTimeout(() => {
						state.frameTimestamp = 0;
						state.lastTimestamp = -1;
						state.timestampErrors = 0;
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

	updateTimer();
	state.animationFrameId = requestAnimationFrame(processPose);
}

export function updateExercise() {
	const exercise = EXERCISES[state.currentExercise];
	if (elements.instructions) {
		elements.instructions.innerHTML = `<p>${exercise.instructions}</p>`;
	}
	resetStateValues();
	renderFeedbackPlaceholder();
}
