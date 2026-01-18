import { json } from '@sveltejs/kit';
import { getAllIssues } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const issues = getAllIssues();
  return json(issues);
};
