import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const androidFiles = [
  "src/mobile/AppMobile.tsx",
  "src/mobile/providers/android-library-provider.ts",
  "src/mobile/screens/LibraryScreen.tsx",
  "src/mobile/components/LibraryEmpty.tsx",
];

/**
 * Regression guards for the Storage Access Framework picker.
 *
 * These assert the architectural contract from the implementation plan without
 * needing a device: native picker calls must route through the trusted
 * `android_*` Tauri commands, the renderer never touches `plugin:*`, and the
 * additive SAF import is wired through the provider + library UI.
 */
describe("Android SAF picker wiring", () => {
  const fileText = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("routes the SAF picker through trusted app commands, never inline plugins", () => {
    const blocked: string[] = [];
    const inlinePlugin = /plugin:(permissionbridge|mediastore|artworkbridge|rustbridge)\|/g;
    for (const rel of androidFiles) {
      for (const match of fileText(rel).matchAll(inlinePlugin)) {
        blocked.push(`${rel}: ${match[0]}`);
      }
    }
    expect(blocked, blocked.join("\n")).toEqual([]);
  });

  it("uses Tauri's activity callback API and persists returned URI grants", () => {
    const kotlin = fileText(
      "src-tauri/android/app/src/main/java/com/cadmium/music/MediaStorePlugin.kt",
    );
    expect(kotlin).toContain("Intent.ACTION_OPEN_DOCUMENT");
    expect(kotlin).toContain('startActivityForResult(invoke, intent, "pickAudioResult")');
    expect(kotlin).toContain("@ActivityCallback");
    expect(kotlin).toContain("takePersistableUriPermission");
    expect(kotlin).toContain("candidatesJson");
    expect(kotlin).toContain("JSONArray()");
    expect(kotlin).toContain("JSONObject.NULL");
    expect(kotlin).not.toContain("candidates.toTypedArray()");
    expect(kotlin).not.toContain("override fun onActivityResult");
    expect(kotlin).not.toContain("Manifest.permission.MANAGE_EXTERNAL_STORAGE");
  });

  it("keeps SAF rows outside authoritative MediaStore availability updates", () => {
    const library = fileText("src-tauri/src/library.rs");
    expect(library).toContain("source_kind = 'android_saf'");
    expect(library).toContain("WHERE source_kind = 'android'");
  });

  it("invokes the trusted picker + additive import commands from the provider", () => {
    const provider = fileText("src/mobile/providers/android-library-provider.ts");
    expect(provider).toContain('"android_native_pick_audio"');
    expect(provider).toContain('"android_import_picked"');
    // Cancellation must NOT be turned into an error path.
    expect(provider).toContain('status: "cancelled"');
  });

  it("exposes a prominent 'Choose audio files' action in the empty state", () => {
    const empty = fileText("src/mobile/components/LibraryEmpty.tsx");
    expect(empty).toContain("Choose audio files");
    expect(empty).toContain("onChooseFiles");
    // Accent-priority primary action keeps the green mobile accent language.
    expect(empty).toContain("primary-button--accent");
  });

  it("keeps 'Scan device' separate and adds a plus/add action when populated", () => {
    const screen = fileText("src/mobile/screens/LibraryScreen.tsx");
    const count = (screen.match(/onImportMusic/g) || []).length;
    // Empty-state (x2) + populated header call site => at least 2 bindings.
    expect(count).toBeGreaterThanOrEqual(2);
    expect(screen).toContain("Choose audio files");
    expect(screen).toContain("Scan device");
  });

  it("surfaces importing state, result, and exact error text via AppMobile", () => {
    const app = fileText("src/mobile/AppMobile.tsx");
    expect(app).toContain("importing");
    expect(app).toContain("importResult");
    expect(app).toContain('"error"');
    expect(app).toContain("Could not import files");
  });
});
