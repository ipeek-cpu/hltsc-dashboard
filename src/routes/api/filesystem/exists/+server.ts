import { json } from '@sveltejs/kit';
import fs from 'fs';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const path = url.searchParams.get('path');

	if (!path) {
		return json({ error: 'Path is required' }, { status: 400 });
	}

	try {
		const exists = fs.existsSync(path);
		return json({ exists, path });
	} catch {
		return json({ exists: false, path });
	}
};
