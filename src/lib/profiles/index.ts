/**
 * Project Profiles Module
 *
 * Provides project-type-specific configurations for the dashboard.
 */

// Types
export type {
	ProfileId,
	QuickAction,
	ContextPackDefaults,
	ProjectProfile,
	ProjectProfileSettings,
	ProfileDetectionResult,
	MultiProfileDetectionResult
} from './types';

// Built-in profiles
export {
	iosProfile,
	webProfile,
	infraProfile,
	genericProfile,
	builtInProfiles,
	profilesById,
	getProfile
} from './definitions';

// Detection
export {
	detectProfile,
	detectProfileFromPath,
	detectAllProfiles,
	detectAllProfilesFromPath,
	describeDetection,
	describeMultiDetection
} from './detection';

// Script detection
export {
	detectAllScripts,
	detectPackageJsonScripts,
	detectMakefileTargets,
	detectDockerComposeServices,
	detectPackageManager,
	scriptsToQuickActions,
	type DetectedScript,
	type ScriptDetectionResult
} from './script-detector';
