export const immersiveFramebufferScale = 0.8;
export const immersiveFoveation = 0.75;

export function selectSustainableFrameRate(supported?: Float32Array | readonly number[]): number | undefined {
  if (!supported?.length) return undefined;
  const rates = Array.from(supported).filter((rate) => Number.isFinite(rate) && rate > 0).sort((a, b) => a - b);
  return rates.find((rate) => rate >= 72) ?? rates.at(-1);
}

export function applyAxisDeadzone(value: number, deadzone = 0.18): number {
  if (Math.abs(value) <= deadzone) return 0;
  return Math.sign(value) * (Math.abs(value) - deadzone) / (1 - deadzone);
}
