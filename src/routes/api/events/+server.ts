import { json } from '@sveltejs/kit';
import { getRecentEvents } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const since = url.searchParams.get('since') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);
  const events = getRecentEvents(since, limit);
  return json(events);
};
