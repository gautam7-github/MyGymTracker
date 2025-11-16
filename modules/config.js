export const EXERCISES = {
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

export const POSE_CONNECTIONS = [
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

export const PROFILE_LANDMARK_SETS = {
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

export const FEEDBACK_COOLDOWN_MS = 3000;
export const BANNER_COOLDOWN_MS = 6000;
export const MAX_FEEDBACK_ITEMS = 3;
export const MIN_VISIBILITY = 0.6;
export const VISIBILITY_HISTORY_FRAMES = 6;
export const VISIBILITY_WARNING_FRAMES = 18;
export const SIDE_SWITCH_NOTICE_COOLDOWN = 4000;
export const DEFAULT_MIN_DURATION_MS = 300;
export const DEFAULT_MAX_DURATION_MS = 10000;
export const SMOOTHING_WINDOW = 5;
export const MOVENET_CONFIDENCE_THRESHOLD = 0.6;
export const MOVENET_FRAME_INTERVAL = 2;
export const FUSION_DECAY = 0.9;

export const isMobileDevice =
	/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
	window.innerWidth < 768;
