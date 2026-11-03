import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ProfileCard from "./ProfileCard.jsx";
import { rankColor } from "../utils.js";

// jsdom normalises inline colors to rgb(), so compare against the converted hex.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

// Pin the avatar display contract: the backend now supplies an avatar URL for both
// platforms, so the card must render it, request it without a referrer (some image
// CDNs reject cross-origin referrers), and degrade to the icon placeholder when the
// URL fails — CF's userpic host serves 503s independently of this app.

const CF_USER = {
  handle: "tourist", platform: "cf", rating: 3382, maxRating: 4009,
  rank: "legendary grandmaster", maxRank: "tourist",
  avatar: "https://userpic.codeforces.org/422/avatar/2b5dbe87f0d859a2.jpg",
};

const LC_USER = {
  handle: "neal_wu", platform: "lc", rating: 2500,
  avatar: "https://assets.leetcode.com/users/neal_wu/avatar_1737814509.png",
};

describe("ProfileCard avatars", () => {
  it("renders the Codeforces avatar url", () => {
    const { getByAltText } = render(<ProfileCard user={CF_USER} tagCount={5} weakCount={1} />);
    expect(getByAltText("tourist avatar").getAttribute("src")).toBe(CF_USER.avatar);
  });

  it("renders the LeetCode avatar url", () => {
    const { getByAltText } = render(<ProfileCard user={LC_USER} tagCount={5} weakCount={1} />);
    expect(getByAltText("neal_wu avatar").getAttribute("src")).toBe(LC_USER.avatar);
  });

  it("requests the image without a referrer", () => {
    const { getByAltText } = render(<ProfileCard user={CF_USER} tagCount={5} weakCount={1} />);
    expect(getByAltText("tourist avatar").getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("falls back to the icon placeholder when the image fails to load", () => {
    const { getByAltText, queryByAltText } = render(
      <ProfileCard user={CF_USER} tagCount={5} weakCount={1} />,
    );
    fireEvent.error(getByAltText("tourist avatar"));
    expect(queryByAltText("tourist avatar")).toBeNull();
  });

  it("shows the placeholder when there is no avatar at all", () => {
    const { queryByAltText } = render(
      <ProfileCard user={{ ...CF_USER, avatar: null }} tagCount={5} weakCount={1} />,
    );
    expect(queryByAltText("tourist avatar")).toBeNull();
  });

  // CF and LC share one fallback branch: same UserIcon, same 50px circle, coloured
  // by the card's rank/rating accent (CF = rankColor, LC = its fixed green). CF's
  // avatar host currently 503s, so this is the path CF users actually see — it must
  // not look different from LC's.
  it("falls back to the same rating-coloured icon on both platforms", () => {
    for (const [user, accent] of [
      [CF_USER, rankColor(CF_USER.rank)],
      [LC_USER, "#28a745"],
    ]) {
      const { container, getByAltText, unmount } = render(
        <ProfileCard user={user} tagCount={5} weakCount={1} />,
      );
      fireEvent.error(getByAltText(`${user.handle} avatar`));

      const placeholder = container.querySelector("svg")?.parentElement;
      expect(container.querySelector("img")).toBeNull();
      expect(placeholder).toBeTruthy();
      expect(getComputedStyle(placeholder).width).toBe("50px");
      expect(getComputedStyle(placeholder).borderRadius).toBe("50%");
      expect(getComputedStyle(placeholder).borderColor).toBe(hexToRgb(accent));
      unmount();
    }
  });
});
