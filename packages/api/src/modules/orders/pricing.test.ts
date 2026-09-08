import { expect, it } from "vitest";
import { automaticDeliveryPricing } from "./pricing";
it("handles explicit zero zone price, fallback, pickup and disabled pricing", () => {
  const base = {
    enabled: true,
    zoneFee: null,
    baseFee: 5,
    legacyFee: 2,
    pickup: false,
    captainSharePercentage: 75,
  };
  expect(automaticDeliveryPricing(base).deliveryFee).toBe(5);
  expect(automaticDeliveryPricing({ ...base, zoneFee: 0 }).deliveryFee).toBe(0);
  expect(automaticDeliveryPricing({ ...base, pickup: true }).deliveryFee).toBe(
    0,
  );
  expect(
    automaticDeliveryPricing({ ...base, enabled: false }).deliveryFee,
  ).toBe(2);
});
