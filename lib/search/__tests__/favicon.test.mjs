import test from "node:test";
import assert from "node:assert/strict";

import { isPublicHost, hostOf, stackExchangeIcon } from "../../../.test-build/lib/favicon.js";

// /api/favicon fetches whatever host it is handed, so `isPublicHost` is the entire guard between a
// site-icon feature and a server-side request forgery. These are here because a regression would not
// look like a bug — the icons would keep working.

test("the hosts this product actually crawls are allowed", () => {
  for (const host of [
    "news.ycombinator.com",
    "github.com",
    "stackoverflow.com",
    "unix.stackexchange.com",
    "lemmy.world",
    "programming.dev",
    "bsky.app",
    "meta.discourse.org",
  ]) {
    assert.equal(isPublicHost(host), true, `${host} should be allowed`);
  }
});

test("IP literals are refused in every spelling", () => {
  // The bug this pins, found against a running build rather than by reading the code: `0x7f.1` was
  // ACCEPTED by an earlier version, because it contains a letter and so slipped past a
  // /^[0-9.]+$/ test — and the URL parser then normalises it to 127.0.0.1 before anything is
  // dialled. The dotted-decimal spellings are the obvious ones; these are the ones that bite.
  for (const host of [
    "127.0.0.1",
    "169.254.169.254", // cloud metadata — the whole reason this matters
    "192.168.1.1",
    "10.0.0.1",
    "0x7f.1",
    "0177.0.0.1",
    "2130706433",
    "0x7f000001",
  ]) {
    assert.equal(isPublicHost(host), false, `${host} must be refused`);
  }
});

test("internal and unqualified names are refused", () => {
  for (const host of ["localhost", "metadata.google.internal", "db.local", "wiki.intranet", "router.lan", "kubernetes"]) {
    assert.equal(isPublicHost(host), false, `${host} must be refused`);
  }
});

test("malformed hosts never reach a fetch", () => {
  for (const host of ["", ".", "..", "foo..bar.com", ".leading.com", "trailing.com.", "a".repeat(300) + ".com"]) {
    assert.equal(isPublicHost(host), false, `${JSON.stringify(host)} must be refused`);
  }
  // Credentials, ports and paths smuggled through the host parameter.
  for (const host of ["user@evil.com", "evil.com:8080", "evil.com/../admin", "evil.com#x", "evil.com?a=b"]) {
    assert.equal(isPublicHost(host), false, `${host} must be refused`);
  }
});

test("hostOf takes the host from a permalink and nothing else", () => {
  assert.equal(hostOf("https://news.ycombinator.com/item?id=123"), "news.ycombinator.com");
  assert.equal(hostOf("https://www.reddit.com/r/x/comments/y"), "reddit.com", "www is stripped");
  assert.equal(hostOf("https://UNIX.StackExchange.com/q/1"), "unix.stackexchange.com");
  // No permalink is a normal state — a lead with no link renders initials, not a broken icon.
  assert.equal(hostOf(undefined), null);
  assert.equal(hostOf(null), null);
  assert.equal(hostOf(""), null);
  assert.equal(hostOf("not a url"), null);
  assert.equal(hostOf("https://localhost/x"), null, "a host with no dot has no site to show");
});

test("Stack Exchange sites resolve to their CDN icon, and nothing else does", () => {
  // 166 of the source registry, and their homepages 403 a datacenter fetch — so without this the
  // generic path cannot find their icon at all.
  assert.equal(
    stackExchangeIcon("unix.stackexchange.com"),
    "https://cdn.sstatic.net/Sites/unix/Img/apple-touch-icon.png",
  );
  assert.equal(
    stackExchangeIcon("stackoverflow.com"),
    "https://cdn.sstatic.net/Sites/stackoverflow/Img/apple-touch-icon.png",
  );
  assert.equal(
    stackExchangeIcon("askubuntu.com"),
    "https://cdn.sstatic.net/Sites/askubuntu/Img/apple-touch-icon.png",
  );
  // Must not claim a CDN path for a host that has none — that would send every lead's icon request
  // to sstatic.net and get a 404 instead of the real favicon.
  assert.equal(stackExchangeIcon("github.com"), null);
  assert.equal(stackExchangeIcon("lemmy.world"), null);
  assert.equal(stackExchangeIcon("stackexchange.com.evil.test"), null);
});
