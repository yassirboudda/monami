import { describe, expect, it } from "vitest";
import { chatRequest, restoreDemo } from "@/lib/demo-profile";
import { niches, platformsFor } from "@/data/mock";

describe("Returning profile and chat", () => {
  it("restores a completed profile so onboarding can be skipped", () => {
    const state = { profile: { hasAccount: false, niche: niches[0], intent: "buy", item: "Display 151", photos: [] }, items: [], savedOffers: [], favorites: ["offer-1"] };
    expect(restoreDemo(JSON.stringify(state))?.profile.item).toBe("Display 151");
    expect(restoreDemo(JSON.stringify(state))?.favorites).toEqual(["offer-1"]);
  });
  it("does not accept an incomplete profile as completed", () => {
    expect(restoreDemo(JSON.stringify({ profile: { intent: "buy" } }))).toBeUndefined();
  });
  it("starts buying directly from chat", () => { expect(chatRequest("Je veux acheter RTX 3080")).toEqual({ intent: "buy", item: "RTX 3080" }); });
  it("starts selling directly from chat", () => { expect(chatRequest("Je veux vendre Dracaufeu holo")).toEqual({ intent: "sell", item: "Dracaufeu holo" }); });
  it("always proposes eBay first in the demo", () => { for (const niche of niches) expect(platformsFor(niche)[0]?.id).toBe("ebay"); });
});