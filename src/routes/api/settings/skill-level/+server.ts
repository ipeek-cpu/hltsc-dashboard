import { json } from '@sveltejs/kit';
import { getUserSkillLevel, setUserSkillLevel, type SkillLevel } from '$lib/settings';
import type { RequestHandler } from './$types';

const VALID_SKILL_LEVELS: SkillLevel[] = ['non-coder', 'junior', 'senior', 'principal'];

/**
 * GET - Get current user skill level
 */
export const GET: RequestHandler = async () => {
	const level = getUserSkillLevel();
	return json({
		level,
		isSet: !!level
	});
};

/**
 * POST - Set user skill level
 * Body: { level: SkillLevel }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { level } = body;

		if (!level || !VALID_SKILL_LEVELS.includes(level)) {
			return json(
				{ error: `Invalid skill level. Must be one of: ${VALID_SKILL_LEVELS.join(', ')}` },
				{ status: 400 }
			);
		}

		setUserSkillLevel(level);

		return json({
			success: true,
			level
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to set skill level' },
			{ status: 500 }
		);
	}
};
