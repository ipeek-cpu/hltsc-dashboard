import { json } from '@sveltejs/kit';
import { getProjectById, getProjectProfileSettings, setProjectProfileSettings } from '$lib/dashboard-db';
import type { CustomAction } from '$lib/dashboard-db';
import { detectAllProfilesFromPath, getProfile, builtInProfiles } from '$lib/profiles';
import { detectAllScripts, type DetectedScript } from '$lib/profiles/script-detector';
import type { QuickAction } from '$lib/profiles';
import type { RequestHandler } from './$types';

/**
 * GET /api/projects/[id]/profile
 * Returns the current profile settings, detection results, and combined quick actions
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		// Detect all profiles (supports monorepos)
		const multiDetection = await detectAllProfilesFromPath(project.path);

		// Load saved profile settings
		const savedSettings = getProjectProfileSettings(params.id);

		// Determine which profiles are currently selected
		let selectedProfileIds: string[];
		let isAutoDetected: boolean;

		if (savedSettings && !savedSettings.isAutoDetected) {
			// User has manually selected profiles
			selectedProfileIds = savedSettings.selectedProfiles;
			isAutoDetected = false;
		} else {
			// Use auto-detected profiles
			selectedProfileIds = multiDetection.detectedProfiles.length > 0
				? multiDetection.detectedProfiles.map((p) => p.profileId)
				: ['generic'];
			isAutoDetected = true;
		}

		// Get custom actions from saved settings
		const customActions: CustomAction[] = savedSettings?.customActions || [];

		// Get full profile objects for selected profiles
		const selectedProfiles = selectedProfileIds.map((id) => {
			const profile = getProfile(id);
			return {
				id: profile.id,
				name: profile.name,
				description: profile.description,
				icon: profile.icon
			};
		});

		// Combine quick actions from all selected profiles (deduplicated by id)
		const quickActionsMap = new Map<string, QuickAction>();

		// Add profile actions first
		for (const profileId of selectedProfileIds) {
			const profile = getProfile(profileId);
			for (const action of profile.quickActions) {
				if (!quickActionsMap.has(action.id)) {
					quickActionsMap.set(action.id, action);
				}
			}
		}

		// Add custom actions (can override profile actions with same id)
		for (const action of customActions) {
			quickActionsMap.set(action.id, action as QuickAction);
		}

		const combinedQuickActions = Array.from(quickActionsMap.values());

		// Combine context defaults (merge patterns from all profiles)
		const combinedContextDefaults = {
			includePatterns: [...new Set(
				selectedProfileIds.flatMap((id) => getProfile(id).contextDefaults.includePatterns)
			)],
			excludePatterns: [...new Set(
				selectedProfileIds.flatMap((id) => getProfile(id).contextDefaults.excludePatterns)
			)],
			codeGraphFocus: [...new Set(
				selectedProfileIds.flatMap((id) => getProfile(id).contextDefaults.codeGraphFocus)
			)]
		};

		// Combine suggested agents
		const combinedSuggestedAgents = [...new Set(
			selectedProfileIds.flatMap((id) => getProfile(id).suggestedAgents)
		)];

		// Detect scripts from project files (package.json, Makefile, etc.)
		const scriptDetection = detectAllScripts(project.path);

		// Check if actions need configuration (no custom actions and using default profile actions)
		const needsActionConfiguration = customActions.length === 0 && scriptDetection.scripts.length > 0;

		return json({
			// Selected profiles (what's currently active)
			selectedProfiles,
			isAutoDetected,

			// Custom actions for this project
			customActions,

			// Detection results (what was found in the project)
			detection: {
				detectedProfiles: multiDetection.detectedProfiles.map((p) => ({
					profileId: p.profileId,
					profileName: p.profileName || getProfile(p.profileId).name,
					confidence: p.confidence,
					matchedPatterns: p.matchedPatterns
				})),
				isMonorepo: multiDetection.isMonorepo,
				primaryProfile: multiDetection.primaryProfile
			},

			// Auto-detected scripts from project files
			detectedScripts: {
				scripts: scriptDetection.scripts,
				sources: scriptDetection.sources
			},

			// Flag indicating if user should configure actions
			needsActionConfiguration,

			// All available profiles
			availableProfiles: builtInProfiles.map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description,
				icon: p.icon
			})),

			// Combined resources from selected profiles + custom actions
			quickActions: combinedQuickActions,
			contextDefaults: combinedContextDefaults,
			suggestedAgents: combinedSuggestedAgents
		});
	} catch (error) {
		console.error('Error detecting profile:', error);
		return json({ error: 'Failed to detect profile' }, { status: 500 });
	}
};

/**
 * POST /api/projects/[id]/profile
 * Update the project's profile selection or custom actions
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	try {
		const body = await request.json();
		const { profileIds, useAutoDetect, customActions, addAction, removeActionId } = body;

		// Load existing settings to preserve data
		const existingSettings = getProjectProfileSettings(params.id);
		const currentCustomActions = existingSettings?.customActions || [];

		// Handle adding a single custom action
		if (addAction) {
			const newAction: CustomAction = {
				id: addAction.id || `custom-${Date.now()}`,
				label: addAction.label,
				icon: addAction.icon || 'terminal',
				command: addAction.command,
				description: addAction.description,
				requiresConfirmation: addAction.requiresConfirmation || false
			};

			const updatedActions = [...currentCustomActions.filter(a => a.id !== newAction.id), newAction];

			setProjectProfileSettings(params.id, {
				selectedProfiles: existingSettings?.selectedProfiles || [],
				isAutoDetected: existingSettings?.isAutoDetected ?? true,
				customActions: updatedActions,
				updatedAt: new Date().toISOString()
			});

			return json({ success: true, action: newAction, customActions: updatedActions });
		}

		// Handle removing a custom action
		if (removeActionId) {
			const updatedActions = currentCustomActions.filter(a => a.id !== removeActionId);

			setProjectProfileSettings(params.id, {
				selectedProfiles: existingSettings?.selectedProfiles || [],
				isAutoDetected: existingSettings?.isAutoDetected ?? true,
				customActions: updatedActions,
				updatedAt: new Date().toISOString()
			});

			return json({ success: true, customActions: updatedActions });
		}

		// Handle replacing all custom actions
		if (customActions !== undefined) {
			setProjectProfileSettings(params.id, {
				selectedProfiles: existingSettings?.selectedProfiles || [],
				isAutoDetected: existingSettings?.isAutoDetected ?? true,
				customActions: customActions,
				updatedAt: new Date().toISOString()
			});

			return json({ success: true, customActions });
		}

		// Handle reverting to auto-detect
		if (useAutoDetect) {
			setProjectProfileSettings(params.id, {
				selectedProfiles: [],
				isAutoDetected: true,
				customActions: currentCustomActions, // Preserve custom actions
				updatedAt: new Date().toISOString()
			});

			return json({ success: true, message: 'Reverted to auto-detected profiles' });
		}

		// Handle profile selection
		if (profileIds && Array.isArray(profileIds) && profileIds.length > 0) {
			// Validate all profile IDs
			const validProfileIds = profileIds.filter((id: string) => {
				const profile = getProfile(id);
				return profile.id !== 'generic' || id === 'generic';
			});

			if (validProfileIds.length === 0) {
				return json({ error: 'No valid profile IDs provided' }, { status: 400 });
			}

			// Save the manual selection, preserving custom actions
			setProjectProfileSettings(params.id, {
				selectedProfiles: validProfileIds,
				isAutoDetected: false,
				customActions: currentCustomActions,
				updatedAt: new Date().toISOString()
			});

			// Get full profile objects for response
			const selectedProfiles = validProfileIds.map((id: string) => {
				const profile = getProfile(id);
				return {
					id: profile.id,
					name: profile.name,
					description: profile.description,
					icon: profile.icon
				};
			});

			// Combine quick actions from all selected profiles + custom
			const quickActionsMap = new Map<string, QuickAction>();
			for (const profileId of validProfileIds) {
				const profile = getProfile(profileId);
				for (const action of profile.quickActions) {
					if (!quickActionsMap.has(action.id)) {
						quickActionsMap.set(action.id, action);
					}
				}
			}
			for (const action of currentCustomActions) {
				quickActionsMap.set(action.id, action as QuickAction);
			}

			return json({
				success: true,
				selectedProfiles,
				quickActions: Array.from(quickActionsMap.values())
			});
		}

		return json({ error: 'No valid operation specified' }, { status: 400 });
	} catch (error) {
		console.error('Error updating profile:', error);
		return json({ error: 'Failed to update profile' }, { status: 500 });
	}
};
