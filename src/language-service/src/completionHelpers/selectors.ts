/**
 * Integration-provided selectors (Home Assistant 2024.12+) use the
 * `trigger: <domain>.<subtype>` and `condition: <domain>.<subtype>` forms. The
 * schema covers these with a generic fallback, so the concrete selector IDs are
 * completed dynamically from the connected instance via these property matches.
 */
export class SelectorCompletionContribution {
  public static triggerPropertyMatches: string[] = ["trigger"]

  public static conditionPropertyMatches: string[] = ["condition"]
}
