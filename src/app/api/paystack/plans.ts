export const PAYSTACK_PLANS = [
  { id: "premium_calm", name: "Calm Pack", amountKobo: 250000 },
  { id: "premium_coach", name: "Coach Pack", amountKobo: 450000 },
  { id: "premium_studio", name: "Studio Pack", amountKobo: 750000 },
] as const;

export function getPaystackPlan(packageId: string) {
  return PAYSTACK_PLANS.find(plan => plan.id === packageId);
}
