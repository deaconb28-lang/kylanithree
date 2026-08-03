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

| **Reddit** (60 subreddits) | The public `.json` endpoints, which need no key at all. See below. |

Bluesky is seeded **only when credentials exist** — see the note in `worker/index.ts`; two failed
polls is all it takes for the backoff to mark a source blocked, so seeding it on a worker with no
app password would bury twenty rows that never recover.

### Reddit: the API is closed, the JSON is not

These are two different things and conflating them is what produced the earlier blanket "no".

- **The API** now sits behind the Responsible Builder Policy: self-service OAuth credentials are
  effectively closed, individual approval is required, and the commercial tier is metered at roughly
  $0.24 per 1,000 requests. That remains ruled out.
- **The public JSON** is the oldest thing Reddit has — append `.json` to any public URL and get the
  listing the browser renders. No key, no registration, no approval. That is what
  `lib/ingest/sources/reddit.ts` uses.

The trade is real and is written into the crawler's settings rather than hidden: unauthenticated
access is rate-limited far harder than a token would be, and Reddit is known to block datacenter
egress ranges. So Reddit is the most timid source in the registry — one request per poll, one poll
at a time, a 60-minute interval, which is about one request a minute across all 60 subreddits.

Two failure modes are handled differently on purpose. A **404** means the subreddit does not exist
and raises `PermanentSourceError`, retiring that row on its first poll. A **403** is left transient,
because it means either "private or quarantined" or "Reddit is refusing this IP" — and retiring on
the second reading would silently delete the whole Reddit registry the first time the worker's
egress range got blocked.

#### Measured result: Reddit refuses datacenter traffic, from every provider tried

The crawler shipped, ran, and **every one of the 60 subreddits answered 403 within a second** —
including `r/smallbusiness`, `r/Entrepreneur` and `r/sysadmin`, which unambiguously exist. A uniform
instant 403 across 60 unrelated communities is an IP-level refusal of the datacenter range, not a
per-subreddit problem and not a User-Agent problem (a bad UA gets 429, not a blanket 403).

Then `/api/health?reddit=probe` asked the follow-up question from **Vercel**: `403 in 21ms`, serving
an HTML interstitial rather than JSON. Twenty-one milliseconds is an edge-level refusal that never
reaches Reddit's application servers. So this is not one provider's range — Reddit declines
datacenter traffic generally, and there is no hosting answer.

**What is deliberately not built: a way around it.** Rotating residential proxies or spoofed origins
would be defeating an access control Reddit has chosen to apply, which is a different thing from
using a public endpoint it leaves open — and it would put the product's access and standing at real
risk for a source that is already substituted by Lemmy.

**What IS built: everything downstream of approval.** `crawlReddit` sends to `oauth.reddit.com` with
a bearer token whenever `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are set, falling back to the
public path otherwise, and the worker seeds and re-enables the 60 subreddits on the next boot once
they appear. Getting Responsible Builder approval is a form; turning it on afterwards is two
variables and no code change. The keyed path is also metered per client id rather than per IP, so
the timid 60-minute interval could be raised considerably if yield justifies it.

The 403-is-transient rule earned its keep on the first run: had 403 been treated as permanent, that
tick would have retired all 60 rows and the registry would have deleted itself over an IP block.

---

## The full probe

### Short-form social

| Source | Result | Verdict |
|---|---|---|
| Reddit `search.json` | `403` — **sandbox egress, inconclusive** | **Built, via the public `.json` path.** See below — the earlier "no" was about the *API*, and the JSON endpoints are a different door. |
| X `api/v2/tweets/search/recent` | `401 Unauthorized` | **No.** Needs a paid bearer token; recent-search is not on any free tier. Revisit only if someone is paying for it. |
| Bluesky `searchPosts` | `200` on `describeServer`; search needs a session | **Built.** 403s unauthenticated from a datacenter IP — a free account and app password fix it. |
| Mastodon `/api/v2/search` | `200` but `statuses: []` | **Not yet.** Status search is disabled for unauthenticated callers — it answers 200 with nothing rather than erroring, which is exactly the silent-zero failure this codebase keeps removing. Would need a token per instance. Worth a second look. |
| Mastodon `/api/v1/timelines/public` | `422 "requires an authenticated user"` | Same conclusion. |
| Lemmy | `200`, full post + creator + community | **Built.** |
| Threads (Meta) | `500 [190] Invalid OAuth 2.0 Access Token` — **inconclusive**, see below | **Not built.** The only Meta surface with a plausible path; needs an app, App Review and the `threads_keyword_search` permission. |
| Facebook post search | `400 [100/33] Unsupported get request` | **No, and creating an app does not change it.** See below. |
| Facebook page search | `400 (#27) This app is for use in Workplace` | Endpoint exists but is gated — and it finds *Pages*, not people with problems. |
| Instagram `ig_hashtag_search` | `400 [100] Param user_id is not a valid Instagram User ID` | **Real endpoint**, but see below — it does not yield an addressable person. |
| LinkedIn `/v2/me` | `401 EMPTY_ACCESS_TOKEN` | **No.** No public search API exists; the only data available is the signed-in user's own. Scraping profiles is a direct terms violation and the enforcement is account termination. |

### Developer and maker communities

| Source | Result | Verdict |
|---|---|---|
| GitHub `search/issues` | `200`, `total_count: 5700` for `"looking for a tool" in:body` | **Strongest unbuilt candidate.** People describing tooling pain in their own words, with a public profile attached to every one. 60 req/hr unauthenticated, 30/min with a token. |
| dev.to `/api/articles` | `200`, free, no key | **Worth building.** Small volume, high signal for developer-tool niches. |
| Lobsters `/newest.json` | `200`, free, no key | **Worth building.** Very small, very high signal. Cheap enough that the low volume does not matter. |
| Product Hunt GraphQL | `429` + Cloudflare interstitial | **No** without an OAuth token. |

### Meta: creating an app is not the blocker

Worth writing down because the app-creation process looks like the obstacle and is not. Meta's
create-an-app flow is straightforward — pick use cases, connect a business portfolio, get an App ID.
The question is what any of it *unlocks* for finding strangers who are describing a problem, and the
probes above discriminate real endpoints from removed ones.

**The probe method matters here.** On `graph.facebook.com` an invented path answers
`[100/33] Unsupported get request ... Object with ID 'x' does not exist`, so a real-but-gated
endpoint is distinguishable from a removed one:

- `search?type=post` → `[100/33] Unsupported get request`. **Public post search is gone.** It is not
  a permission you can be granted; the endpoint no longer serves that type.
- `search?type=page` → `[27] this app does not have permission`. The path exists, so this one is a
  permissions question — but it returns *Pages*, which are businesses, not people with a complaint.
- `ig_hashtag_search` → `[100] Param user_id is not a valid Instagram User ID`. **The endpoint is
  real and it validated the parameter**, unlike the invented control which said the object does not
  exist. So Instagram hashtag search genuinely exists.

**Instagram still fails the product test, for a reason that has nothing to do with access.** Kylani
sends from the founder's Gmail, so a lead is only worth anything if the person is identifiable. The
Hashtag Search API returns media for a hashtag — and for media the app does not own it does not
return the poster's identity, on top of a 30-hashtags-per-7-days cap and a Business account plus App
Review. A wall of captions with no addressable author is not a lead. *(The endpoint's existence was
verified here; the shape of what it returns is from Meta's documentation, not something this probe
could confirm without a token.)*

**Threads is the only plausible one, and this probe could not settle it.** `graph.threads.net`
returns `[190] Invalid OAuth 2.0 Access Token` for *every* path including a deliberately invented
one — auth is checked before routing, so the real-vs-fake trick that works on `graph.facebook.com`
tells us nothing here. Meta does document a Threads keyword-search capability gated behind a
`threads_keyword_search` permission and App Review. Whether it returns enough to identify and reach
a person is **unverified** and would need an approved app to find out.

**Recommendation: not now.** Every Meta path costs an app, a business portfolio, probably business
verification, and App Review — weeks of process — for at best one source (Threads) whose content
shape overlaps almost entirely with Bluesky, which is already built, free, and needs no approval.
GitHub issue search is a far better use of the same effort: verified `200` unauthenticated, 5,700
hits on a single problem phrase, and every hit carries a public profile.

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

X, LinkedIn, Facebook and Threads are blocked by policy rather than by effort. None is a matter of
finding the right endpoint: X is paid, LinkedIn and Meta have no public search over other people's
posts at any price, and all of them enforce their terms by removing access.

Reddit came off this list — but only its **API** was ever the problem, and only the **JSON path** is
now built. Do not re-open the OAuth question without an approved Responsible Builder application;
the answer there has not changed.
