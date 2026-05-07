export function hasUsablePaystackSecret(secretKey: string | undefined) {
  if (!secretKey) return false;
  const normalized = secretKey.toLowerCase();
  return !normalized.includes("placeholder") && !normalized.includes("replace_with_real_key");
}
