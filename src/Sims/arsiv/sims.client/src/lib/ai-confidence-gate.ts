/**
 * Fast Intent Router / kural-motoru kademesi güven eşiği — TEK KAYNAK.
 * Frontend web router kapısında kullanır; sidecar'a configure_ai payload'ındaki
 * `confidenceGate` alanıyla bildirilir (main.py varsayılanının üzerine yazar).
 * Eşik değişirse yalnızca bu sabit değişir, iki taraf senkron kalır.
 */
export const FAST_ROUTE_CONFIDENCE_THRESHOLD = 80;

/** Gate kalibrasyon istatistiği: kabul vs eşik-altı üst katmana devir. */
const gateStats = { accepted: 0, escalated: 0 };

export function recordFastGateOutcome(accepted: boolean, confidence?: number): void {
  if (accepted) {
    gateStats.accepted += 1;
    return;
  }
  gateStats.escalated += 1;
  const total = gateStats.accepted + gateStats.escalated;
  console.debug(
    `%c🚪 [Yula Gate]%c Fast Intent eşiği altında (%${confidence ?? "?"}) → üst katmana devredildi | ${gateStats.accepted} kabul / ${gateStats.escalated} devir (%${total ? Math.round((100 * gateStats.escalated) / total) : 0} düşüş)`,
    "color: #f59e0b; font-weight: bold;",
    "color: inherit;"
  );
}

export function getFastGateStats(): { accepted: number; escalated: number } {
  return { ...gateStats };
}
