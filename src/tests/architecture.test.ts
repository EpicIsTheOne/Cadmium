/**
 * Architecture boundary test.
 *
 * Enforces the non-negotiable repository boundary from the implementation
 * plan: mobile and desktop are separate products that reuse an explicit shared
 * layer. Android must never import from src/desktop; desktop must never import
 * from src/mobile. Shared code must not depend on platform-specific APIs.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(root, "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function relativeImportSources(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const sources: string[] = [];
  const re = /(?:import|export)[^"']*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) sources.push(m[1]);
  return sources;
}

function isMobile(file: string) {
  return file.split(/[\\/]/).includes("mobile");
}
function isDesktop(file: string) {
  return file.split(/[\\/]/).includes("desktop");
}
function isShared(file: string) {
  return file.split(/[\\/]/).includes("shared");
}

describe("repository architecture boundary", () => {
  const files = walk(SRC);

  it("forbids mobile importing desktop", () => {
    const violations: string[] = [];
    for (const file of files.filter(isMobile)) {
      for (const spec of relativeImportSources(file)) {
        if (spec.startsWith(".") && spec.includes("desktop")) {
          violations.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("forbids desktop importing mobile", () => {
    const violations: string[] = [];
    for (const file of files.filter(isDesktop)) {
      for (const spec of relativeImportSources(file)) {
        if (spec.startsWith(".") && spec.includes("mobile")) {
          violations.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("forbids shared code from importing desktop or mobile", () => {
    const violations: string[] = [];
    for (const file of files.filter(isShared)) {
      for (const spec of relativeImportSources(file)) {
        if (spec.startsWith(".") && (spec.includes("desktop") || spec.includes("mobile"))) {
          violations.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps shared free of platform-only tokens", () => {
    // Shared must not reach into Tauri desktop APIs, browser audio elements,
    // Android APIs, or filesystem path assumptions.
    const banned = [
      "@tauri-apps/api/core",
      "@tauri-apps/api/webview",
      "new Audio(",
      "HTMLAudioElement",
      "android.content",
      "MediaStore",
      "convertFileSrc",
    ];
    const violations: string[] = [];
    for (const file of files.filter(isShared)) {
      const text = readFileSync(file, "utf8");
      for (const token of banned) {
        if (text.includes(token)) violations.push(`${file}: ${token}`);
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("exposes the planned shared directories", () => {
    for (const dir of ["shared", "desktop", "mobile", "platform"]) {
      expect(statSync(join(SRC, dir)).isDirectory(), `missing ${dir}`).toBe(true);
    }
  });
});
