# Where else can Kylani find buyers?

Every verdict below comes from an actual request made against the live endpoint, not from
recollection. The probe ran from a sandbox on 2026-08-03; the raw status codes and response
fragments are reproduced verbatim, because "I think that API needs a key" and "that API answered
401 with this body" are different kinds of claim and only one of them is worth writing down.

**Read the sandbox caveat first.** Two rows below say `Blocked by egress policy`. That is *this
sandbox's* outbound proxy refusing the host, not the platform refusing us — Stack Exchange is one
of the two sources the production crawler runs on, and it obviously works from Railway. Reddit's
row is therefore inconclusive here and is assessed separately on what is publicly known about its
terms. Nothing else in the table is affected: every other host answered.

---

## Built as a result of this evaluation

| Source | Why it won |
|---|---|
| **Lemmy** (17 instances) | `/api/v3/post/list` answers unauthenticated on 17 of 20 instances probed. Reddit-shaped conversation — a person posting a problem into a topical community — with no key, no registration and no datacenter-IP block. This is the closest thing to the source the product most wants and least plausibly gets. |
| **Bluesky** (20 standing queries) | Already a query-time source; now crawled continuously. The crawl unit is a *phrase* rather than a place, because a flat network has no communities to enumerate. |

Both are seeded in `worker/index.ts`. Bluesky is seeded **only when credentials exist** — see the
note there; two failed polls is all it takes for the backoff to mark a source blocked, so seeding
it on a worker with no app password would bury twenty rows that never recover.

---

## The full probe

### Short-form social

| Source | Result | Verdict |
|---|---|---|
| Reddit `search.json` | `403` — **sandbox egress, inconclusive** | **No.** Not on this evidence, but the answer is still no: the API is paid, its terms are enforced by revoking access outright, and it blocks datacenter traffic. Lemmy is the substitute, and that is why it was built. |
| X `api/v2/tweets/search/recent` | `401 Unauthorized` | **No.** Needs a paid bearer token; recent-search is not on any free tier. Revisit only if someone is paying for it. |
| Bluesky `searchPosts` | `200` on `describeServer`; search needs a session | **Built.** 403s unauthenticated from a datacenter IP — a free account and app password fix it. |
| Mastodon `/api/v2/search` | `200` but `statuses: []` | **Not yet.** Status search is disabled for unauthenticated callers — it answers 200 with nothing rather than erroring, which is exactly the silent-zero failure this codebase keeps removing. Would need a token per instance. Worth a second look. |
| Mastodon `/api/v1/timelines/public` | `422 "requires an authenticated user"` | Same conclusion. |
| Lemmy | `200`, full post + creator + community | **Built.** |
| Threads (Meta) | `500 Invalid OAuth 2.0 Access Token` | **No.** Requires an approved Meta app and a user-authorised token; there is no public search over other people's posts at all. |
| Facebook Graph search | `400 (#27) This app is for use in Workplace` | **No.** Public post search was removed from the Graph API years ago. Nothing here to integrate. |
| LinkedIn `/v2/me` | `401 EMPTY_ACCESS_TOKEN` | **No.** No public search API exists; the only data available is the signed-in user's own. Scraping profiles is a direct terms violation and the enforcement is account termination. |

### Developer and maker communities

| Source | Result | Verdict |
|---|---|---|
| GitHub `search/issues` | `200`, `total_count: 5700` for `"looking for a tool" in:body` | **Strongest unbuilt candidate.** People describing tooling pain in their own words, with a public profile attached to every one. 60 req/hr unauthenticated, 30/min with a token. |
| dev.to `/api/articles` | `200`, free, no key | **Worth building.** Small volume, high signal for developer-tool niches. |
| Lobsters `/newest.json` | `200`, free, no key | **Worth building.** Very small, very high signal. Cheap enough that the low volume does not matter. |
| Product Hunt GraphQL | `429` + Cloudflare interstitial | **No** without an OAuth token. |

### Job boards — hiring as a demand signal

The pitch already names job ads as a place buyers describe their pain, and these are all open. The
caveat is that a job ad identifies a **company**, not a person who said something — so it feeds a
different lead shape than everything above, and would want its own card rather than being mixed
into the same list.

| Source | Result | Verdict |
|---|---|---|
| RemoteOK `/api` | `200`, free (attribution required — read their terms before shipping) | Viable |
| Remotive `/api/remote-jobs` | `200`, free | Viable |
| Arbeitnow `/api/job-board-api` | `200`, free | Viable, EU-weighted |
| Greenhouse `boards-api` | `200` for `stripe` | Viable, but **per-company board token** — needs a company list first |
| Ashby `posting-api/job-board` | `200` for `ramp` | Same shape as Greenhouse |
| Lever `/v0/postings` | `404` for the token tried | API is real; that company does not use it. Same per-company shape. |
| HN Algolia `tags=job` | `200` | Already reachable through the existing HN crawler |
| USAJobs | `401` | Needs a free key + registered email header |
| Adzuna | `400` | Needs a free app id + key |

### Company and location data — enrichment, not discovery

None of these find a person describing a problem. They answer "who is this company", which is what
`lib/enrich/` (Apollo) already does.

| Source | Result | Verdict |
|---|---|---|
| SEC EDGAR full-text | `200`, free, no key, 1,689 hits on the test query | Real and open, but it searches **filings** — the language of a 10-K is not the language of a buyer with a problem. Low value here. |
| Companies House (UK) | `401 Empty Authorization header` | Free key available. Registry facts only. |
| OpenCorporates | `401 Invalid Api Token` | Paid for anything meaningful. Apollo already covers this ground. |
| Google Places | `403 Method doesn't allow unregistered callers` | Paid, per-request. Only relevant for local/physical businesses. |
| OpenStreetMap Nominatim | `200`, free | The free substitute for Places if local business data is ever wanted. Heavy usage-policy constraints; not a lead source. |

---

## What to build next, in order

1. **GitHub issues and discussions.** The best remaining ratio of signal to friction: open, free,
   full-text, and every hit carries an addressable public profile — which matters because the
   person crawler can then actually enrich them.
2. **dev.to and Lobsters.** Cheap, open, and they round out developer-tool coverage that currently
   leans entirely on Hacker News and Stack Exchange.
3. **Job boards, as a separate lead type.** RemoteOK, Remotive and Arbeitnow are one crawler each.
   Do not merge them into the person list — a company hiring for a problem is a different claim
   from a person describing one, and flattening the two would make the product's central promise
   ("something this person actually said") untrue for a subset of cards.
4. **Mastodon, if a token is worth the setup.** Same class of content as Bluesky; the friction is
   per-instance registration rather than money.

## What not to revisit

X, Reddit, LinkedIn, Facebook and Threads are all blocked by policy rather than by effort. None of
them is a matter of finding the right endpoint: X and Reddit are paid, LinkedIn and Meta have no
public search over other people's posts at any price, and all four enforce their terms by removing
access. The engineering answer to "we want Reddit" is Lemmy, which is why it is now built.
