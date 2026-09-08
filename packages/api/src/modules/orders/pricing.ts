import { roundMoney } from "@samou-go/shared-types";
export function automaticDeliveryPricing(input: {
  enabled: boolean;
  zoneFee: number | null;
  baseFee: number;
  legacyFee: number;
  pickup: boolean;
  captainSharePercentage: number;
}) {
  const deliveryFee = input.pickup
    ? 0
    : input.enabled
      ? (input.zoneFee ?? input.baseFee)
      : input.legacyFee;
  return {
    deliveryFee: roundMoney(deliveryFee),
    autoPriced: input.enabled && !input.pickup,
    captainSharePercentage: input.captainSharePercentage,
  };
}
