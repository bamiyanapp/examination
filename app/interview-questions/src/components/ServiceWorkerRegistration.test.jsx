import { render } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration.jsx";

describe("ServiceWorkerRegistration", () => {
  afterEach(() => {
    delete navigator.serviceWorker;
  });

  it("対応ブラウザでは/sw.jsを登録する", () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);

    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("非対応ブラウザでは何もしない", () => {
    delete navigator.serviceWorker;

    expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
  });
});
