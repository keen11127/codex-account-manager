import { useSyncExternalStore } from "react";

let currentNow = Date.now();
let timer: number | null = null;
const listeners = new Set<() => void>();

function startClock() {
  if (timer !== null || typeof window === "undefined") return;
  timer = window.setInterval(() => {
    currentNow = Date.now();
    for (const listener of listeners) listener();
  }, 1_000);
}

function stopClock() {
  if (timer === null || listeners.size > 0 || typeof window === "undefined") {
    return;
  }
  window.clearInterval(timer);
  timer = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startClock();
  return () => {
    listeners.delete(listener);
    stopClock();
  };
}

function getSnapshot() {
  return currentNow;
}

export function useSecondClock() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
