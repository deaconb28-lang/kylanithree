import { NextRequest } from "next/server";
import { Searches, type DiscoverLead } from "@/lib/discover/collections";
import { analysisFromUrlAlone, fastAnalyze, fetchPageText } from "@/lib/discover/fastAnalyze";
import { runPassOne } from "@/lib/discover/passOne";
import { recordNicheCommunities } from "@/lib/discover/nicheMap";
import { mergeLeads, shallowSurvival } from "@/lib/discover/merge";
import { track } from "@/lib/discover/analytics";
import { Deadline } from "@/lib/search/deadline";
import { resolveVenues } from "@/lib/search/venues";
import { extractLeads } from "@/lib/search/extract";
import { Trace } from "@/lib/search/trace";
import { personFingerprint } from "@/lib/credits/fingerprint";

// The whole run, streamed.
//
// Every stage has a hard budget and every budget failure ships partial results rather than an
// error. The user must never land on a retry screen — degraded beats dead, always.
//
// Vercel caps a function at 60s even with Fluid Compute, so the run budgets itself to 50 and closes
// the stream cleanly with whatever it has. A `partial` status tells the client it may reconnect for
// more; it never sees a killed connection.
export const maxDuration = 60;
const RUN_BUDGET_MS = 50_000;

type Event = { event: string; data: unknown };

function sse(controller: ReadableStreamDefaultController, { event, data }: Event) {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: searchId } = await ctx.params;
  const anonId = req.nextUrl.searchParams.get("anonId") ?? searchId;
  const deadline = new Deadline(RUN_BUDGET_MS);

  const stream = new ReadableStream({
    async start(controller) {
      const searches = await Searches();
      let leads: DiscoverLead[] = [];
      let passOneFingerprints: string[] = [];
      let degraded = false;

      const narrate = async (text: string) => {
        sse(controller, { event: "narration", data: { text } });
        await searches.updateOne({ searchId }, { $push: { narration: { at: new Date(), text } } }).catch(() => {});
      };

      const emitLeads = async (incoming: DiscoverLead[]) => {
        if (incoming.length === 0) return;
        // Merge server-side too, so a client that reconnects gets the same ordering it had.
        const { leads: next, added } = mergeLeads({ existing: leads, incoming });
        leads = next;
        sse(controller, { event: "leads", data: { leads, added } });
        await searches.updateOne({ searchId }, { $set: { leads } }).catch(() => {});
      };

      try {
        const search = await searches.findOne({ searchId });
        if (!search) {
          sse(controller, { event: "error", data: { message: "That search has expired. Start a new one." } });
          controller.close();
          return;
        }

        await searches.updateOne({ searchId }, { $set: { status: "running" } });
        sse(controller, { event: "status", data: { status: "running" } });

        // --- Tier 1 inference: ~2s, and the first thing the screen can show ------------------
        await narrate(search.productUrl ? `Reading ${search.productUrl}` : "Reading what you described");
        const pageText = search.productUrl ? await fetchPageText(search.productUrl) : "";

        let fast;
        try {
          fast = await fastAnalyze({ url: search.productUrl, sentence: search.productSentence, pageText });
        } catch (err) {
          // The screen must never be a dead end. A domain-derived analysis is a poor search, but it
          // is a search, and the deep pass corrects it within seconds.
          console.error("[discover] fast analysis failed, falling back to the URL alone:", err instanceof Error ? err.message : err);
          degraded = true;
          fast = analysisFromUrlAlone(search.productUrl ?? search.productSentence ?? "your product");
        }

        await searches.updateOne({ searchId }, { $set: { fast } });
        sse(controller, { event: "inference", data: { fast } });
        await narrate(`Looking for people saying things like "${fast.keywords[0]}"`);

        // --- Pass 1: 8s, hard -----------------------------------------------------------------
        const passOne = await runPassOne({ keywords: fast.keywords, nicheKey: fast.nicheKey, correlationId: searchId });
        passOneFingerprints = passOne.leads.map((l) => l.personFingerprint);

        await emitLeads(passOne.leads);

        // How pass 1 was served, recorded whether or not it found anything. Written before the
        // `leads.length > 0` branch below on purpose: a run that found nothing is precisely the one
        // where this needs answering, and hanging it off a lead count would lose it every time.
        const passOneRoute = {
          corpusRoute: passOne.corpusRoute,
          corpusLeads: passOne.corpusLeads,
          corpusTimedOut: passOne.corpusTimedOut,
          usedCorpus: passOne.usedCorpus,
          usedLive: passOne.usedLive,
          ms: passOne.ms,
        };
        await searches.updateOne({ searchId }, { $set: { passOneRoute } });
        sse(controller, { event: "pass_one_route", data: passOneRoute });

        // `firstLeadAt` is server truth for this run; the funnel's time-to-first-lead is reported by
        // the browser instead, so it is on the same clock as the legacy flow it is compared against.
        if (passOne.leads.length > 0) {
          await searches.updateOne({ searchId }, { $set: { firstLeadAt: new Date(), passOneFingerprints } });
        }
        await track({
          anonId,
          name: "pass_one_complete",
          flow: "discover",
          searchId,
          ms: passOne.ms,
          props: {
            corpus: passOne.usedCorpus,
            live: passOne.usedLive,
            corpusRoute: passOne.corpusRoute,
            corpusLeads: passOne.corpusLeads,
            corpusTimedOut: passOne.corpusTimedOut,
          },
        });
        await narrate(
          passOne.leads.length > 0
            ? `${passOne.leads.length} so far — still finding more`
            : "Nothing in the fast sources yet — widening the search",
        );

        // --- Pass 2: full coverage, streams ----------------------------------------------------
        const trace = new Trace();
        const buyers = [{ name: "Buyer", desc: fast.whatYouSell }];

        const { venues } = await resolveVenues({
          nicheKey: fast.nicheKey,
          buyers,
          whatYouSell: fast.whatYouSell,
          lexiconTerms: fast.keywords,
          trace,
          deadline,
        });
        const searchable = venues.filter((v) => v.searchable);
        await recordNicheCommunities(fast.nicheKey, searchable.map((v) => v.id));

        await searches.updateOne({ searchId }, { $set: { communitiesTotal: searchable.length } });
        // The venue list, not just its length: the screen draws the actual map of where it is
        // looking, and a founder recognising "r/logistics" on it is most of why the wait works.
        sse(controller, { event: "venues", data: { venues: searchable.map((v) => ({ id: v.id, name: v.name, platform: v.platform })) } });
        sse(controller, { event: "progress", data: { communitiesTotal: searchable.length, communitiesScanned: 0 } });
        await narrate(`Scanning ${searchable.length} ${searchable.length === 1 ? "community" : "communities"}`);

        // Shards rather than one call, so leads stream in as each lands instead of arriving in one
        // batch at the end — and so a slow shard cannot hold up the ones that already finished.
        const SHARD = 2;
        let correctedAt: number = search.correctedAt?.getTime() ?? 0;

        for (let i = 0; i < searchable.length && !deadline.expired(); i += SHARD) {
          // A correction landing mid-run steers the rest of the search rather than only re-ranking
          // what is already on screen. The correction route is the writer here; this run adopts the
          // keywords AND the re-ranked list, so the next `leads` event cannot clobber the new order.
          const current = await searches.findOne({ searchId }, { projection: { fast: 1, leads: 1, correctedAt: 1 } }).catch(() => null);
          if (current?.correctedAt && current.correctedAt.getTime() > correctedAt && current.fast) {
            correctedAt = current.correctedAt.getTime();
            fast = current.fast;
            leads = current.leads;
            sse(controller, { event: "inference", data: { fast } });
            await narrate(`Searching again for "${fast.keywords[0]}"`);
          }

          const shard = searchable.slice(i, i + SHARD);
          sse(controller, { event: "progress", data: { scanningIds: shard.map((v) => v.id) } });
          try {
            const { leads: found } = await extractLeads({
              venues: shard,
              lexicon: {
                problemPhrases: fast.keywords,
                seekingPhrases: fast.keywords,
                negativeTerms: [],
                relevanceWindowDays: 365,
              },
              whatYouSell: fast.whatYouSell,
              problem: fast.whatYouSell,
              buyers,
              trace,
              deadline,
            });

            const mapped: DiscoverLead[] = [];
            for (const l of found) {
              const fp = personFingerprint({ platform: l.platform, authorHandle: l.author });
              // No stable identity means no way to dedupe this person against pass 1, so they are
              // dropped rather than shown twice under two spellings.
              if (!fp) continue;
              mapped.push({
                personFingerprint: fp,
                author: l.author,
                platform: l.platform,
                venueName: l.venueName,
                permalink: l.permalink,
                excerpt: l.excerpt,
                postedAt: l.postedAt,
                matchedFor: fast.keywords.filter((k) => l.excerpt.toLowerCase().includes(k.toLowerCase())),
                score: l.confidence,
                intentType: l.intentTier === "seeking" ? "seeking_tool" : l.intentTier === "complaining" ? "describing_pain" : undefined,
                engagement: { score: l.score, numComments: l.numComments },
                foundInPass: 2,
              });
            }
            await emitLeads(mapped);
          } catch (err) {
            // One dead shard degrades the result set; it never fails the run.
            degraded = true;
            console.error("[discover] shard failed:", err instanceof Error ? err.message : err);
          }

          const scanned = Math.min(i + SHARD, searchable.length);
          await searches.updateOne({ searchId }, { $set: { communitiesScanned: scanned } }).catch(() => {});
          sse(controller, {
            event: "progress",
            data: {
              communitiesScanned: scanned,
              communitiesTotal: searchable.length,
              scanningIds: [],
              scannedIds: searchable.slice(0, scanned).map((v) => v.id),
            },
          });
        }

        const hitBudget = deadline.expired();
        const survival = shallowSurvival(leads, passOneFingerprints);
        await searches.updateOne(
          { searchId },
          {
            $set: {
              status: hitBudget ? "partial" : "complete",
              completedAt: new Date(),
              shallowSurvival: survival ?? undefined,
            },
          },
        );

        if (degraded) await track({ anonId, name: "search_degraded", flow: "discover", searchId });
        await track({
          anonId,
          name: "search_complete",
          flow: "discover",
          searchId,
          ms: deadline.elapsed(),
          props: { leads: leads.length, partial: hitBudget, shallowSurvival: survival ?? -1 },
        });

        sse(controller, {
          event: "complete",
          data: { total: leads.length, partial: hitBudget, shallowSurvival: survival },
        });
      } catch (err) {
        // Even here: whatever was found still ships. The client renders leads and a quiet note,
        // never a retry screen with nothing behind it.
        console.error("[discover] run failed:", err instanceof Error ? err.message : err);
        await searches.updateOne({ searchId }, { $set: { status: leads.length > 0 ? "partial" : "failed" } }).catch(() => {});
        await track({ anonId, name: leads.length > 0 ? "search_degraded" : "search_failed", flow: "discover", searchId });
        sse(controller, {
          event: "complete",
          data: { total: leads.length, partial: true, message: leads.length > 0 ? null : "Couldn't finish the search." },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Vercel's proxy buffers by default, which would hold every event until the stream closed and
      // defeat the entire point of streaming.
      "X-Accel-Buffering": "no",
    },
  });
}
