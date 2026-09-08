import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Custom K6 Metrics
const ttftTrend = new Trend('ttft_ms');
const tokensPerSecTrend = new Trend('tokens_per_sec');
const errorRate = new Rate('error_rate');
const rateLimitRate = new Rate('rate_limited_rate');

export const options = {
  scenarios: {
    // Stage 1: Warmup & baseline (50 VUs)
    baseline_load: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '5s', target: 50 },
        { duration: '10s', target: 50 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '2s',
      exec: 'chatScenario',
    },
    // Stage 2: 100 Concurrent Users
    load_100_users: {
      executor: 'ramping-vus',
      startTime: '20s',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 100 },
        { duration: '10s', target: 100 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '2s',
      exec: 'chatScenario',
    },
    // Stage 3: Burst Stress Test
    burst_stress: {
      executor: 'ramping-vus',
      startTime: '40s',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 200 },
        { duration: '10s', target: 200 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '2s',
      exec: 'chatScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    error_rate: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:4000';

const samplePrompts = [
  'Explain how distributed systems handle traffic spikes.',
  'Write a TypeScript rate limiter using Redis token buckets.',
  'How does Prefix/KV caching work in LLM inference clusters?',
  'Why do retry storms happen during downstream model outages?',
  'Describe PostgreSQL read replica scaling patterns.',
];

export function chatScenario() {
  const prompt = samplePrompts[Math.floor(Math.random() * samplePrompts.length)];
  const userId = `vu_user_${__VU % 20}`; // 20 unique users simulating multi-tenancy

  const payload = JSON.stringify({
    userId,
    message: prompt,
    modelId: 'mock-fast',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    timeout: '10s',
  };

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/api/chat`, payload, params);

  if (res.status === 200) {
    check(res, {
      'status is 200': (r) => r.status === 200,
      'is SSE stream': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/event-stream'),
      'contains start event': (r) => r.body.includes('"type":"start"'),
      'contains meta event': (r) => r.body.includes('"type":"meta"'),
    });

    // Extract TTFT and speed from response body
    const metaMatch = res.body.match(/"ttftMs":(\d+)/);
    if (metaMatch && metaMatch[1]) {
      ttftTrend.add(parseInt(metaMatch[1], 10));
    }

    const speedMatch = res.body.match(/"tokensPerSec":([\d.]+)/);
    if (speedMatch && speedMatch[1]) {
      tokensPerSecTrend.add(parseFloat(speedMatch[1]));
    }

    errorRate.add(0);
    rateLimitRate.add(0);
  } else if (res.status === 429) {
    rateLimitRate.add(1);
    check(res, {
      'rate limit returns 429': (r) => r.status === 429,
    });
  } else {
    errorRate.add(1);
  }

  sleep(Math.random() * 0.5 + 0.2); // Jittered user think time
}
