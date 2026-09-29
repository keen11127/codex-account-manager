const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const {
  normalizeRouting,
  readProviderState,
  stripProviderConfig,
  writeProviderState,
} = require("./workspace-suite.cjs");
const { readManagedFile, writeManagedFile } = require("./workspace-tools.cjs");

const instances = new Map();

function instanceKey(codexHome) {
  const resolved = path.resolve(codexHome);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function emptyRuntime() {
  return {
    startedAt: null,
    requestCount: 0,
    failoverCount: 0,
    inFlight: 0,
    successCount: 0,
    failureCount: 0,
    lastRequestAt: null,
    lastProviderId: null,
    lastError: null,
    health: new Map(),
  };
}

function healthFor(runtime, id) {
  if (!runtime.health.has(id)) {
    runtime.health.set(id, {
      state: "closed",
      openedAt: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      failedRequests: 0,
      lastStatus: null,
      outcomes: [],
    });
  }
  return runtime.health.get(id);
}

function circuitAvailable(health, routing) {
  if (health.state !== "open") return true;
  if (!health.openedAt) return true;
  if (Date.now() - health.openedAt < routing.recoverySeconds * 1000) return false;
  health.state = "half_open";
  health.consecutiveSuccesses = 0;
  return true;
}

function recordAttempt(runtime, routing, providerId, ok, status) {
  const health = healthFor(runtime, providerId);
  health.totalRequests += 1;
  health.lastStatus = status || null;
  health.outcomes.push(Boolean(ok));
  if (health.outcomes.length > 50) health.outcomes.shift();
  if (ok) {
    health.consecutiveFailures = 0;
    health.consecutiveSuccesses += 1;
    if (health.state !== "half_open" || health.consecutiveSuccesses >= routing.successThreshold) {
      health.state = "closed";
      health.openedAt = null;
    }
  } else {
    health.failedRequests += 1;
    health.consecutiveFailures += 1;
    health.consecutiveSuccesses = 0;
    const recentFailures = health.outcomes.filter((item) => !item).length;
    const errorRate = health.outcomes.length > 0
      ? recentFailures / health.outcomes.length * 100
      : 0;
    if (
      health.consecutiveFailures >= routing.failureThreshold ||
      (health.outcomes.length >= routing.minimumRequests && errorRate >= routing.errorRateThreshold)
    ) {
      health.state = "open";
      health.openedAt = Date.now();
    }
  }
}

function upstreamUrl(baseUrl, requestUrl) {
  const upstream = new URL(baseUrl);
  const basePath = upstream.pathname.replace(/\/$/, "");
  const incoming = new URL(String(requestUrl || "/"), "http://localhost");
  const incomingPath = incoming.pathname.startsWith("/")
    ? incoming.pathname
    : `/${incoming.pathname}`;
  if (/\/v1$/i.test(basePath) && /^\/v1(?:\/|$)/i.test(incomingPath)) {
    upstream.pathname = `${basePath}${incomingPath.slice(3)}` || basePath;
  } else {
    upstream.pathname = `${basePath}${incomingPath}`.replace(/\/{2,}/g, "/");
  }
  upstream.search = incoming.search;
  return upstream;
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > 64 * 1024 * 1024) {
        reject(new Error("请求体超过 64 MB"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function forward(provider, incoming, response, body, routing) {
  return new Promise((resolve, reject) => {
    const url = upstreamUrl(provider.baseUrl, incoming.url);
    const transport = url.protocol === "https:" ? https : http;
    const headers = { ...incoming.headers };
    delete headers.host;
    delete headers["x-account-manager-route-token"];
    if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;
    headers.host = url.host;
    headers["content-length"] = String(body.length);
    let settled = false;
    let firstByteTimer = null;
    let idleTimer = null;
    let totalTimer = null;
    const clearTimers = () => {
      if (firstByteTimer) clearTimeout(firstByteTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (totalTimer) clearTimeout(totalTimer);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimers();
      callback(value);
    };
    const request = transport.request(url, {
      method: incoming.method,
      headers,
    });
    request.on("response", (upstream) => {
      if (firstByteTimer) clearTimeout(firstByteTimer);
      const retryable = upstream.statusCode === 408 || upstream.statusCode === 409 || upstream.statusCode === 425 || upstream.statusCode === 429 || (upstream.statusCode || 0) >= 500;
      if (retryable) {
        upstream.resume();
        finish(resolve, { accepted: false, status: upstream.statusCode || null });
        return;
      }
      response.writeHead(upstream.statusCode || 502, upstream.headers);
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (routing.idleTimeout > 0) {
          idleTimer = setTimeout(() => {
            upstream.destroy(new Error("上游流式响应长时间无数据"));
          }, routing.idleTimeout * 1000);
        }
      };
      resetIdleTimer();
      upstream.on("data", (chunk) => {
        resetIdleTimer();
        if (!response.write(chunk)) upstream.pause();
      });
      response.on("drain", () => upstream.resume());
      upstream.on("end", () => {
        if (!response.writableEnded) response.end();
        finish(resolve, { accepted: true, status: upstream.statusCode || null });
      });
      upstream.on("error", (error) => finish(reject, error));
    });
    request.on("error", (error) => finish(reject, error));
    firstByteTimer = setTimeout(
      () => request.destroy(new Error("等待上游首字节超时")),
      routing.firstByteTimeout * 1000,
    );
    totalTimer = setTimeout(
      () => request.destroy(new Error("上游请求总超时")),
      routing.requestTimeout * 1000,
    );
    if (body.length) request.write(body);
    request.end();
  });
}

async function handleRequest(instance, incoming, response) {
  const { codexHome, runtime } = instance;
  runtime.requestCount += 1;
  runtime.inFlight += 1;
  runtime.lastRequestAt = new Date().toISOString();
  try {
    const state = await readProviderState(codexHome);
    const routing = normalizeRouting(state.routing);
    if (incoming.headers["x-account-manager-route-token"] !== routing.routeToken) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid route token" }));
      runtime.failureCount += 1;
      return;
    }
    const body = await collectBody(incoming);
    const queueIds = routing.autoFailover
      ? routing.providerIds
      : [state.activeId].filter((id) => id !== "official");
    const queue = queueIds
      .map((id) => state.profiles.find((provider) => provider.id === id))
      .filter(Boolean)
      .filter((provider) => circuitAvailable(healthFor(runtime, provider.id), routing));
    if (queue.length === 0) throw new Error("路由队列中没有可用供应商");

    let lastError = null;
    const maxAttempts = Math.min(queue.length, Math.max(1, routing.maxRetries + 1));
    for (let index = 0; index < maxAttempts; index += 1) {
      const provider = queue[index];
      runtime.lastProviderId = provider.id;
      try {
        const result = await forward(provider, incoming, response, body, routing);
        recordAttempt(runtime, routing, provider.id, result.accepted, result.status);
        if (result.accepted) {
          if (index > 0) runtime.failoverCount += 1;
          runtime.successCount += 1;
          runtime.lastError = null;
          return;
        }
        lastError = new Error(`上游返回 HTTP ${result.status}`);
      } catch (error) {
        recordAttempt(runtime, routing, provider.id, false, null);
        lastError = error;
        if (response.headersSent) throw error;
      }
    }
    throw lastError || new Error("所有上游均未返回有效响应");
  } catch (error) {
    runtime.failureCount += 1;
    runtime.lastError = String(error?.message || error);
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: { message: runtime.lastError, type: "router_error" } }));
    } else if (!response.writableEnded) {
      response.end();
    }
  } finally {
    runtime.inFlight = Math.max(0, runtime.inFlight - 1);
  }
}

async function stopRouter(codexHome) {
  const key = instanceKey(codexHome);
  const instance = instances.get(key);
  if (!instance) return;
  await new Promise((resolve) => instance.server.close(() => resolve()));
  instances.delete(key);
}

async function startRouter(codexHome, routing) {
  const key = instanceKey(codexHome);
  const existing = instances.get(key);
  if (existing && existing.address === routing.listenAddress && existing.port === routing.listenPort) return existing;
  if (existing) await stopRouter(codexHome);
  const runtime = emptyRuntime();
  const instance = {
    codexHome,
    address: routing.listenAddress,
    port: routing.listenPort,
    runtime,
    server: null,
  };
  const server = http.createServer((request, response) => void handleRequest(instance, request, response));
  instance.server = server;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(routing.listenPort, routing.listenAddress, () => {
      server.off("error", reject);
      resolve();
    });
  });
  runtime.startedAt = Date.now();
  instances.set(key, instance);
  return instance;
}

function routerToml(routing, model) {
  const address = routing.listenAddress === "0.0.0.0" ? "127.0.0.1" : routing.listenAddress;
  const host = address.includes(":") && !address.startsWith("[") ? `[${address}]` : address;
  return [
    `model = ${JSON.stringify(model || "gpt-5.5")}`,
    'model_provider = "account_manager_router"',
    "",
    '[model_providers."account_manager_router"]',
    'name = "Local Router"',
    `base_url = ${JSON.stringify(`http://${host}:${routing.listenPort}/v1`)}`,
    'wire_api = "responses"',
    "requires_openai_auth = false",
    `experimental_bearer_token = ${JSON.stringify(routing.routeToken)}`,
    `http_headers = { "x-account-manager-route-token" = ${JSON.stringify(routing.routeToken)} }`,
  ].join("\n");
}

async function configureRouter(codexHome) {
  const state = await readProviderState(codexHome);
  const routing = normalizeRouting(state.routing);
  state.routing = routing;
  if (routing.enabled) await startRouter(codexHome, routing);
  else await stopRouter(codexHome);

  const current = await readManagedFile(codexHome, "config");
  if (routing.enabled && routing.takeover) {
    if (!routing.directConfig) routing.directConfig = current.content;
    const primaryId = routing.providerIds[0] || state.activeId;
    const primary = state.profiles.find((item) => item.id === primaryId);
    if (!primary) throw new Error("路由接管需要至少一个可用供应商");
    const common = stripProviderConfig(routing.directConfig || current.content);
    const next = `${routerToml(routing, primary.model)}${common ? `\n\n${common}` : ""}\n`;
    if (current.content !== next) await writeManagedFile(codexHome, "config", next);
  } else if (routing.directConfig) {
    await writeManagedFile(codexHome, "config", routing.directConfig);
    routing.directConfig = null;
  }
  state.routing = routing;
  await writeProviderState(codexHome, state);
  return getRouterStatus(codexHome);
}

async function getRouterStatus(codexHome) {
  const state = await readProviderState(codexHome);
  const routing = normalizeRouting(state.routing);
  const instance = instances.get(instanceKey(codexHome));
  const runtime = instance?.runtime || emptyRuntime();
  const now = Date.now();
  return {
    running: Boolean(instance),
    takeoverActive: Boolean(instance && routing.takeover),
    address: instance ? `http://${instance.address}:${instance.port}/v1` : null,
    settings: routing,
    runtime: {
      requestCount: runtime.requestCount,
      failoverCount: runtime.failoverCount,
      inFlight: runtime.inFlight,
      successCount: runtime.successCount,
      failureCount: runtime.failureCount,
      uptimeSeconds: runtime.startedAt ? Math.floor((now - runtime.startedAt) / 1000) : 0,
      lastRequestAt: runtime.lastRequestAt,
      lastProviderId: runtime.lastProviderId,
      lastError: runtime.lastError,
      providers: state.profiles.map((provider) => {
        const health = healthFor(runtime, provider.id);
        return {
          id: provider.id,
          state: health.state,
          cooldownSeconds: health.state === "open" && health.openedAt
            ? Math.max(0, routing.recoverySeconds - Math.floor((now - health.openedAt) / 1000))
            : 0,
          lastStatus: health.lastStatus,
          consecutiveFailures: health.consecutiveFailures,
          consecutiveSuccesses: health.consecutiveSuccesses,
          totalRequests: health.totalRequests,
          failedRequests: health.failedRequests,
          errorRate: health.outcomes.length > 0
            ? Math.round(health.outcomes.filter((item) => !item).length / health.outcomes.length * 100)
            : 0,
        };
      }),
    },
  };
}

async function resetRouterHealth(codexHome, providerId) {
  const instance = instances.get(instanceKey(codexHome));
  if (instance) instance.runtime.health.delete(providerId);
  return getRouterStatus(codexHome);
}

async function stopAllRouters() {
  await Promise.all([...instances.values()].map((instance) => stopRouter(instance.codexHome)));
}

async function suspendRouter(codexHome) {
  const state = await readProviderState(codexHome);
  const routing = normalizeRouting(state.routing);
  await stopRouter(codexHome);
  if (routing.directConfig) {
    const current = await readManagedFile(codexHome, "config");
    if (current.content !== routing.directConfig) {
      await writeManagedFile(codexHome, "config", routing.directConfig);
    }
  }
}

module.exports = {
  circuitAvailable,
  configureRouter,
  getRouterStatus,
  recordAttempt,
  resetRouterHealth,
  stopAllRouters,
  suspendRouter,
  upstreamUrl,
};
