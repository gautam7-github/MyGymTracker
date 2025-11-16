import {
	FUSION_DECAY,
	MIN_VISIBILITY,
	MOVENET_CONFIDENCE_THRESHOLD,
} from "./config.js";

const MEDIA_PIPE_TO_MOVENET = {
	0: 0,
	2: 1,
	5: 2,
	7: 3,
	8: 4,
	11: 5,
	12: 6,
	13: 7,
	14: 8,
	15: 9,
	16: 10,
	23: 11,
	24: 12,
	25: 13,
	26: 14,
	27: 15,
	28: 16,
};

function getMoveNetPoint(mpIndex, keypoints) {
	const moveNetIndex = MEDIA_PIPE_TO_MOVENET[mpIndex];
	if (
		moveNetIndex == null ||
		!keypoints ||
		!keypoints.length ||
		!keypoints[moveNetIndex]
	) {
		return null;
	}
	return keypoints[moveNetIndex];
}

export function fuseLandmarks({
	mediapipeLandmarks = [],
	moveNetKeypoints = [],
	previousLandmarks = [],
	videoWidth = 1,
	videoHeight = 1,
}) {
	const fused = new Array(33).fill(null);

	for (let index = 0; index < 33; index++) {
		const mpPoint = mediapipeLandmarks[index];
		const mpScore = mpPoint?.visibility ?? 0;
		const movePoint = getMoveNetPoint(index, moveNetKeypoints);
		const moveScore = movePoint?.score ?? 0;
		let normalizedMove = null;
		if (movePoint && videoWidth && videoHeight) {
			normalizedMove = {
				x: movePoint.x / videoWidth,
				y: movePoint.y / videoHeight,
			};
		}

		let fusedPoint = null;

		if (mpScore >= MIN_VISIBILITY) {
			if (
				moveScore >= MOVENET_CONFIDENCE_THRESHOLD &&
				normalizedMove
			) {
				const totalWeight = mpScore + moveScore;
				fusedPoint = {
					x:
						(mpPoint.x * mpScore +
							normalizedMove.x * moveScore) /
						totalWeight,
					y:
						(mpPoint.y * mpScore +
							normalizedMove.y * moveScore) /
						totalWeight,
					z: mpPoint.z ?? 0,
					visibility: Math.min(1, totalWeight / 2),
				};
			} else {
				fusedPoint = { ...mpPoint };
			}
		} else if (
			moveScore >= MOVENET_CONFIDENCE_THRESHOLD &&
			normalizedMove
		) {
			fusedPoint = {
				x: normalizedMove.x,
				y: normalizedMove.y,
				z: mpPoint?.z ?? 0,
				visibility: moveScore,
			};
		} else if (previousLandmarks && previousLandmarks[index]) {
			const prev = previousLandmarks[index];
			fusedPoint = {
				...prev,
				visibility: (prev.visibility || 0.5) * FUSION_DECAY,
				stale: true,
			};
		}

		fused[index] = fusedPoint;
	}

	return fused;
}
