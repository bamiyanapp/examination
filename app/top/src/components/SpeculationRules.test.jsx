import { render, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import SpeculationRules from "./SpeculationRules.jsx";

function setSupports(value) {
  window.HTMLScriptElement = window.HTMLScriptElement || function () {};
  window.HTMLScriptElement.supports = value === undefined ? undefined : vi.fn(() => value);
}

function setConnection(connection) {
  Object.defineProperty(navigator, "connection", { value: connection, configurable: true });
}

describe("SpeculationRules", () => {
  beforeEach(() => {
    setSupports(true);
    setConnection(undefined);
  });

  afterEach(() => {
    cleanup();
    document.querySelectorAll('script[type="speculationrules"]').forEach((el) => el.remove());
  });

  it("非対応ブラウザでは何もしない", () => {
    setSupports(undefined);
    render(<SpeculationRules />);
    expect(document.querySelector('script[type="speculationrules"]')).toBeNull();
  });

  it("対応ブラウザでは先読みルールを挿入する", () => {
    render(<SpeculationRules />);
    const script = document.querySelector('script[type="speculationrules"]');
    expect(script).not.toBeNull();
    const rules = JSON.parse(script.textContent);
    expect(rules.prefetch[0].source).toBe("list");
    expect(rules.prefetch[0].urls).not.toContain("/education/voice-practice/");
  });

  it("現在のページ自身は先読み対象から除外する", () => {
    window.history.pushState({}, "", "/");
    render(<SpeculationRules />);
    const script = document.querySelector('script[type="speculationrules"]');
    const rules = JSON.parse(script.textContent);
    expect(rules.prefetch[0].urls).not.toContain("/");
  });

  it("データセーバー有効時は先読みしない", () => {
    setConnection({ saveData: true });
    render(<SpeculationRules />);
    expect(document.querySelector('script[type="speculationrules"]')).toBeNull();
  });

  it("低速回線時は先読みしない", () => {
    setConnection({ effectiveType: "2g" });
    render(<SpeculationRules />);
    expect(document.querySelector('script[type="speculationrules"]')).toBeNull();
  });
});
