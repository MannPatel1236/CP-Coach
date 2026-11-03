import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ProfileCard from "./ProfileCard.jsx";

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
});
