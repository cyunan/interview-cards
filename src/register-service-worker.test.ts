import { describe, expect, it, vi } from "vitest";

import { registerAppServiceWorker } from "./register-service-worker";

describe("registerAppServiceWorker", () => {
  it("defers the page reload when an updated worker takes control", () => {
    const register = vi.fn();

    registerAppServiceWorker(register);

    const options = register.mock.calls[0]?.[0];
    expect(options).toMatchObject({ immediate: true });
    expect(options.onNeedReload).toEqual(expect.any(Function));
    expect(options.onNeedReload()).toBeUndefined();
  });
});
