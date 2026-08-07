import { render } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration.jsx";

function setVisibilityState(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

describe("ServiceWorkerRegistration", () => {
  afterEach(() => {
    delete navigator.serviceWorker;
    setVisibilityState("visible");
    vi.useRealTimers();
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

  // iOS PWA（ホーム画面から起動したスタンドアロン表示）はService Workerの
  // 自動更新チェックが働きにくいため、フォアグラウンド復帰時に明示的な
  // 更新チェックを行う（examination#122の実機確認で判明した不具合の対応）
  it("フォアグラウンド復帰時（visibilitychange）にregistration.update()を呼ぶ", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ update });
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);
    await Promise.resolve();
    await Promise.resolve();

    setVisibilityState("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(update).toHaveBeenCalled();
  });

  it("非表示（visibilityState !== visible）の間はregistration.update()を呼ばない", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ update });
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);
    await Promise.resolve();
    await Promise.resolve();

    setVisibilityState("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(update).not.toHaveBeenCalled();
  });

  it("定期的にもregistration.update()を呼ぶ", async () => {
    vi.useFakeTimers();
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ update });
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(update).toHaveBeenCalled();
  });
});
