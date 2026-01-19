import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

const SETTINGS_KEY = 'beads-dashboard-settings';
const SETTINGS_VERSION = 1;

export type Theme = 'light' | 'dark' | 'auto';
export type FontSize = 'small' | 'medium' | 'large';
export type Density = 'compact' | 'comfortable';

export interface AppearanceSettings {
	theme: Theme;
	fontSize: FontSize;
	density: Density;
}

export interface BehaviorSettings {
	autoRefreshMs: number;
	notificationsEnabled: boolean;
	soundEnabled: boolean;
}

export interface KanbanSettings {
	hiddenColumns: string[];
	cardFields: string[];
}

export interface DashboardSettings {
	version: number;
	appearance: AppearanceSettings;
	behavior: BehaviorSettings;
	kanban: KanbanSettings;
}

const defaultSettings: DashboardSettings = {
	version: SETTINGS_VERSION,
	appearance: {
		theme: 'light',
		fontSize: 'medium',
		density: 'comfortable'
	},
	behavior: {
		autoRefreshMs: 1000,
		notificationsEnabled: true,
		soundEnabled: false
	},
	kanban: {
		hiddenColumns: [],
		cardFields: ['priority', 'labels', 'assignee']
	}
};

function loadSettings(): DashboardSettings {
	if (!browser) return defaultSettings;

	try {
		const stored = localStorage.getItem(SETTINGS_KEY);
		if (!stored) return defaultSettings;

		const parsed = JSON.parse(stored) as DashboardSettings;

		// Handle version migrations if needed
		if (parsed.version !== SETTINGS_VERSION) {
			return migrateSettings(parsed);
		}

		// Merge with defaults to handle new fields
		return {
			...defaultSettings,
			...parsed,
			appearance: { ...defaultSettings.appearance, ...parsed.appearance },
			behavior: { ...defaultSettings.behavior, ...parsed.behavior },
			kanban: { ...defaultSettings.kanban, ...parsed.kanban }
		};
	} catch {
		return defaultSettings;
	}
}

function migrateSettings(oldSettings: DashboardSettings): DashboardSettings {
	// Future migrations go here
	return {
		...defaultSettings,
		...oldSettings,
		version: SETTINGS_VERSION
	};
}

function saveSettings(settings: DashboardSettings): void {
	if (!browser) return;
	localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Create the store
function createSettingsStore() {
	const { subscribe, set, update } = writable<DashboardSettings>(loadSettings());

	return {
		subscribe,
		set: (settings: DashboardSettings) => {
			saveSettings(settings);
			set(settings);
		},
		update: (fn: (settings: DashboardSettings) => DashboardSettings) => {
			update((current) => {
				const updated = fn(current);
				saveSettings(updated);
				return updated;
			});
		},
		reset: () => {
			saveSettings(defaultSettings);
			set(defaultSettings);
		},
		setTheme: (theme: Theme) => {
			update((s) => {
				const updated = { ...s, appearance: { ...s.appearance, theme } };
				saveSettings(updated);
				return updated;
			});
		},
		setFontSize: (fontSize: FontSize) => {
			update((s) => {
				const updated = { ...s, appearance: { ...s.appearance, fontSize } };
				saveSettings(updated);
				return updated;
			});
		},
		setDensity: (density: Density) => {
			update((s) => {
				const updated = { ...s, appearance: { ...s.appearance, density } };
				saveSettings(updated);
				return updated;
			});
		},
		setAutoRefresh: (ms: number) => {
			update((s) => {
				const updated = { ...s, behavior: { ...s.behavior, autoRefreshMs: ms } };
				saveSettings(updated);
				return updated;
			});
		},
		exportSettings: (): string => {
			return JSON.stringify(get({ subscribe }), null, 2);
		},
		importSettings: (json: string): boolean => {
			try {
				const imported = JSON.parse(json) as DashboardSettings;
				// Validate basic structure
				if (!imported.appearance || !imported.behavior || !imported.kanban) {
					return false;
				}
				const merged = {
					...defaultSettings,
					...imported,
					version: SETTINGS_VERSION
				};
				saveSettings(merged);
				set(merged);
				return true;
			} catch {
				return false;
			}
		}
	};
}

export const settings = createSettingsStore();

// Derived stores for individual settings
export const theme = derived(settings, ($s) => $s.appearance.theme);
export const fontSize = derived(settings, ($s) => $s.appearance.fontSize);
export const density = derived(settings, ($s) => $s.appearance.density);
export const autoRefreshMs = derived(settings, ($s) => $s.behavior.autoRefreshMs);

// Computed theme based on system preference when 'auto' is selected
export const effectiveTheme = derived(settings, ($s) => {
	if ($s.appearance.theme !== 'auto') return $s.appearance.theme;
	if (!browser) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
});
