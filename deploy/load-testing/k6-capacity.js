import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const target = __ENV.TARGET_URL || "http://127.0.0.1:3000";
const csrf = __ENV.CSRF_TOKEN || "";
const session = __ENV.SESSION_COOKIE || "";
const failures = new Rate("dublancer_capacity_failures");
const searchLatency = new Trend("dublancer_capacity_search_ms", true);

export const options = {
  scenarios: {
    read_capacity: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: [
        { target: 25, duration: "2m" },
        { target: 100, duration: "5m" },
        { target: 25, duration: "2m" },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<750", "p(99)<1500"],
    dublancer_capacity_failures: ["rate<0.01"],
    dublancer_capacity_search_ms: ["p(95)<500"],
  },
};

export default function () {
  const headers = {
    cookie: session,
    "x-csrf-token": csrf,
    "user-agent": "dublancer-k6-capacity/1.0",
  };
  const started = Date.now();
  const search = http.get(`${target}/api/search?q=enterprise&take=20`, { headers });
  searchLatency.add(Date.now() - started);
  const healthy = check(search, {
    "search is successful": (response) => response.status === 200,
    "search is bounded": (response) => response.timings.duration < 1500,
  });
  failures.add(!healthy);
  const health = http.get(`${target}/api/health/ready`, { headers });
  failures.add(!check(health, { "readiness is available": (response) => response.status === 200 }));
  sleep(0.2);
}
