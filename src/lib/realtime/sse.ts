import { AppError } from "@/lib/errors/app-error";
import { redisSubscriber, runRedisOperation } from "./redis";

export async function createSseResponse(
  topics: string[],
  signal: AbortSignal,
) {
  const encoder = new TextEncoder();
  const subscriber = redisSubscriber.duplicate();

  try {
    await runRedisOperation(subscriber, async () => {
      await subscriber.subscribe(...topics);
      return true;
    });
  } catch {
    subscriber.disconnect(false);
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Realtime updates are temporarily unavailable. The application remains usable and will reconnect automatically.",
      503,
      { retryable: true },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
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

      subscriber.on("end", () => {
        send("realtime-unavailable", {
          retryable: true,
          at: new Date().toISOString(),
        });
        void close();
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
          if (["ready", "connect"].includes(subscriber.status)) {
            await subscriber.unsubscribe(...topics);
            await subscriber.quit();
          } else {
            subscriber.disconnect(false);
          }
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
    cancel() {
      subscriber.disconnect(false);
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
