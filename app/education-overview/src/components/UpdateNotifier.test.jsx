import { act } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import UpdateNotifier from "./UpdateNotifier.jsx";

function setServiceWorker(controller) {
  const listeners = {};
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      controller,
      addEventListener: (type, handler) => {
        listeners[type] = handler;
      },
      removeEventListener: (type) => {
        delete listeners[type];
      },
    },
    configurable: true,
  });
  return {
    dispatchControllerChange: () => act(() => listeners.controllerchange?.()),
  };
}

describe("UpdateNotifier", () => {
  it("既にService Workerの制御下にあったページでcontrollerchangeが起きたら更新バナーを表示する", () => {
    const { dispatchControllerChange } = setServiceWorker({});

    render(<UpdateNotifier />);
    expect(screen.queryByText("新しいバージョンがあります")).not.toBeInTheDocument();

    dispatchControllerChange();

    expect(screen.getByText("新しいバージョンがあります")).toBeInTheDocument();
  });

  it("初回インストール時（読み込み時点でcontrollerが無い）はバナーを表示しない", () => {
    const { dispatchControllerChange } = setServiceWorker(null);

    render(<UpdateNotifier />);
    dispatchControllerChange();

    expect(screen.queryByText("新しいバージョンがあります")).not.toBeInTheDocument();
  });

  it("更新するボタンを押すとページを再読み込みする", () => {
    const { dispatchControllerChange } = setServiceWorker({});
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      configurable: true,
      writable: true,
    });

    render(<UpdateNotifier />);
    dispatchControllerChange();
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));

    expect(reloadMock).toHaveBeenCalled();
  });

  it("非対応ブラウザでは何もしない", () => {
    setServiceWorker({});
    delete navigator.serviceWorker;

    expect(() => render(<UpdateNotifier />)).not.toThrow();
  });
});
