export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

export function poissonSample(lambda: number): number {
  let L = Math.exp(-lambda), k = 0, p = 1
  do { k++; p *= Math.random() } while (p > L)
  return k - 1
}

export function weightedAverage(values: number[], weights: number[]): number {
  const sum = values.reduce((acc, v, i) => acc + v * weights[i], 0)
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  return sum / totalWeight
}