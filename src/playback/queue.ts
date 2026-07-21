import type { QueueItem } from "../domain/media";

export type RepeatMode = "off" | "all" | "one";

export interface QueueNavigationOptions {
  readonly shuffle: boolean;
  readonly repeat: RepeatMode;
  readonly random?: () => number;
}
export function shuffled<T>(items: readonly T[], seed = 1): T[] {
  const result = [...items];
  let value = Math.abs(Math.floor(seed)) || 1;
  const random = () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function nextQueueIndex(
  queue: readonly QueueItem[],
  currentIndex: number,
  options: QueueNavigationOptions,
): number | null {
  if (queue.length === 0) {
    return null;
  }
  const random = options.random ?? Math.random;
  if (options.shuffle) {
    const candidates = queue
      .map((_, index) => index)
      .filter((index) => index !== currentIndex);
    if (candidates.length > 0) {
      return candidates[Math.floor(random() * candidates.length)];
    }
    return options.repeat === "all" ? currentIndex : null;
  }
  if (currentIndex < queue.length - 1) {
    return currentIndex + 1;
  }
  return options.repeat === "all" ? 0 : null;
}

export function previousQueueIndex(
  queue: readonly QueueItem[],
  currentIndex: number,
  repeat: RepeatMode,
): number | null {
  if (queue.length === 0) {
    return null;
  }
  if (currentIndex > 0) {
    return currentIndex - 1;
  }
  return repeat === "all" ? queue.length - 1 : null;
}
