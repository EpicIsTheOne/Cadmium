import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const mobileFiles = [
  "src/mobile/AppMobile.tsx",
  "src/mobile/playback/mobile-engine.ts",
  "src/mobile/providers/android-library-provider.ts",
];

describe("Android native bridge ACL boundary", () => {
  it("routes native calls through trusted app commands instead of ACL-blocked inline plugins", () => {
    const blockedInvokes: string[] = [];
    const nativePluginInvoke = /plugin:(permissionbridge|mediastore|artworkbridge|rustbridge)\|/g;

    for (const relative of mobileFiles) {
      const text = readFileSync(join(root, relative), "utf8");
      for (const match of text.matchAll(nativePluginInvoke)) {
        blockedInvokes.push(`${relative}: ${match[0]}`);
      }
    }

    expect(blockedInvokes, blockedInvokes.join("\n")).toEqual([]);
  });
});
