import { config } from "./config";

// Minimal parser: we only care whether the "User-agent: *" group has "Disallow: /".
// Consecutive User-agent lines share the rules that follow them.
export function blocksEverything(robotsTxt: string): boolean {
  let agents: string[] = [];
  let inRules = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const sep = line.indexOf(":");
    if (sep === -1) continue;

    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value);
      continue;
    }

    if (key === "allow" || key === "disallow") {
      inRules = true;
      if (key === "disallow" && value === "/" && agents.includes("*")) return true;
    }
  }

  return false;
}

export async function isDisallowedByRobots(pageUrl: string): Promise<boolean> {
  const robotsUrl = new URL("/robots.txt", pageUrl).toString();

  let res: Response;
  try {
    res = await fetch(robotsUrl, {
      headers: { "user-agent": config.robotsUserAgent },
      signal: AbortSignal.timeout(config.robotsTimeoutMs),
    });
  } catch {
    // No robots.txt reachable: treat as allowed. If the site itself is down or has a bad
    // certificate, the browser step will report that with a proper message.
    return false;
  }

  // Same as common crawlers: a missing or forbidden robots.txt means no rules.
  if (!res.ok) return false;

  return blocksEverything(await res.text());
}
