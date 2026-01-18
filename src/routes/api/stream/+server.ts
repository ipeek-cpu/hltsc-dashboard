import { getAllIssues, getDataVersion, getRecentEvents } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  let lastDataVersion = getDataVersion();
  let lastEventTime = new Date().toISOString();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial data immediately
      try {
        const initialData = {
          type: 'init',
          issues: getAllIssues(),
          dataVersion: lastDataVersion
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`));
      } catch (error) {
        console.error('Error sending initial data:', error);
      }

      // Poll for changes every second
      intervalId = setInterval(() => {
        try {
          const currentVersion = getDataVersion();

          if (currentVersion !== lastDataVersion) {
            lastDataVersion = currentVersion;

            // Get new events since last check
            const newEvents = getRecentEvents(lastEventTime, 50);
            if (newEvents.length > 0) {
              lastEventTime = newEvents[0].created_at;
            }

            // Send full update
            const update = {
              type: 'update',
              issues: getAllIssues(),
              events: newEvents,
              dataVersion: currentVersion
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
          }
        } catch (error) {
          console.error('Stream poll error:', error);
        }
      }, 1000);
    },
    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
