import { redisSubscriber } from "./redis";

export function createSseResponse(
  topics: string[],
  signal: AbortSignal,
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const subscriber = redisSubscriber.duplicate();
      let closed = false;

      const send = (
        event: string,
        data: unknown,
      ) => {
        if (closed) return;

        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      await subscriber.connect();
      await subscriber.subscribe(...topics);

      subscriber.on("message", (channel, message) => {
        try {
          send("message", {
            channel,
            ...JSON.parse(message),
          });
        } catch {
          send("message", {
            channel,
            raw: message,
          });
        }
      });

      const heartbeat = setInterval(() => {
        send("heartbeat", {
          at: new Date().toISOString(),
        });
      }, 25000);

      const close = async () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);

        try {
          await subscriber.unsubscribe(...topics);
          await subscriber.quit();
        } finally {
          controller.close();
        }
      };

      signal.addEventListener("abort", () => {
        void close();
      });

      send("connected", {
        topics,
        connectedAt: new Date().toISOString(),
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
