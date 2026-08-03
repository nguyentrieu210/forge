#!/usr/bin/env node
import path from "node:path";
import { readJsonc, serverRoot } from "./wrangler-cli.mjs";

const CONFIGS = [
  "apps/jobs-worker/wrangler.jsonc",
  "apps/query-worker/wrangler.jsonc",
  "apps/social-ingress-worker/wrangler.jsonc",
];

let consumers = 0;
const dlqs = new Set();
for (const relative of CONFIGS) {
  const config = readJsonc(path.join(serverRoot, relative));
  for (const consumer of config.queues?.consumers ?? []) {
    consumers += 1;
    const queue = consumer.queue;
    if (!queue || typeof queue !== "string") throw new Error(`${relative}: queue consumer has no queue name`);
    if (!Number.isInteger(consumer.max_retries) || consumer.max_retries < 1 || consumer.max_retries > 20) {
      throw new Error(`${relative}:${queue}: max_retries must be an integer in [1,20]`);
    }
    if (!consumer.dead_letter_queue || typeof consumer.dead_letter_queue !== "string") {
      throw new Error(`${relative}:${queue}: dead_letter_queue is required so exhausted retries are retained`);
    }
    if (consumer.dead_letter_queue === queue) throw new Error(`${relative}:${queue}: DLQ cannot be the source queue`);
    dlqs.add(consumer.dead_letter_queue);
    if (!Number.isInteger(consumer.max_batch_size) || consumer.max_batch_size < 1) {
      throw new Error(`${relative}:${queue}: max_batch_size must be a positive integer`);
    }
    if (!Number.isFinite(consumer.max_batch_timeout) || consumer.max_batch_timeout < 0) {
      throw new Error(`${relative}:${queue}: max_batch_timeout must be non-negative`);
    }
  }
}

if (consumers === 0) throw new Error("no queue consumers found; safety check would be vacuous");
console.log(`QUEUE_SAFETY_PASS consumers=${consumers} dlqs=${[...dlqs].sort().join(",")}`);
