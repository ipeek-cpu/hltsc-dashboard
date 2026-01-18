import { json } from '@sveltejs/kit';
import { getIssueStats, getDataVersion } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const stats = getIssueStats();
  const dataVersion = getDataVersion();
  return json({ stats, dataVersion });
};
