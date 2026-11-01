// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteNav } from "./site-nav";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("SiteNav", () => {
  it("renders a link for each primary section", () => {
    usePathname.mockReturnValue("/");
    render(<SiteNav />);

    expect(screen.getByRole("link", { name: "Screener" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      "/compare"
    );
    expect(
      screen.getByRole("link", { name: "SIP calculator" })
    ).toHaveAttribute("href", "/tools/sip");
  });

  it("marks only the link matching the current path as current", () => {
    usePathname.mockReturnValue("/compare");
    render(<SiteNav />);

    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.getByRole("link", { name: "Screener" })
    ).not.toHaveAttribute("aria-current");
  });
});
