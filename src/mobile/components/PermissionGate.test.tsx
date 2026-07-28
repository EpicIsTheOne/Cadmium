import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PermissionGate } from "./PermissionGate";

describe("PermissionGate", () => {
  it("renders inside the mobile-shell styling scope", () => {
    const html = renderToStaticMarkup(
      <PermissionGate state="denied" onRequest={() => {}} onOpenSettings={() => {}} />,
    );

    expect(html).toContain('class="app-shell mobile-shell"');
    expect(html).toContain('class="mobile-permission"');
  });
});
