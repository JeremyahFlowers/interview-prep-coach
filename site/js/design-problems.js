// The system-design problem bank, and the worked answers.
//
// Where this fits: the design half's equivalent of the coding catalog. A coding
// problem names the pattern it wants; a design problem names the components its
// reference answer reaches for, which is what makes component mastery, search,
// drills and the practice ladder work identically on both halves of the app.
//
// The format follows how the interview actually runs, and the practice format
// follows from it: you whiteboard your own answer against the clock, and only
// then reveal this. Comparing is the exercise. Reading it first is not.
//
// `walkthrough` is staged rather than a finished diagram on purpose. A complete
// architecture shown at once is a picture to admire; the same architecture
// arrived at in six steps, each naming the pressure that forced the next box,
// is an argument you can reconstruct — which is what an interview asks for.
//
// `rubric` is what a good answer covers, not what this answer says. There is
// more than one right design, and a bank that only rewards matching the
// reference teaches the wrong thing.

export const DESIGN_PROBLEMS = [
  {
    id: "url-shortener",
    name: "Design a URL shortener",
    difficulty: "Easy",
    tags: ["read-heavy", "key-value", "caching"],
    prompt:
      "Design a service that turns a long URL into a short one and redirects anyone who visits the short link.",
    requirements: {
      functional: [
        "Create a short code for a given URL",
        "Redirect a short code to its original URL",
        "Optionally let the caller choose a custom alias",
      ],
      nonFunctional: [
        "Redirects must be fast — this is on the critical path of somebody else's page load",
        "Read-to-write ratio is enormous, on the order of 100:1 or worse",
        "Links effectively never expire, so storage only grows",
      ],
    },
    estimate: {
      assumptions: ["100M new links/day", "100:1 read:write", "~500 bytes stored per link"],
      derive: [
        "Writes: 100M/day ÷ 86,400 ≈ 1,200/s average, call it 3,000/s peak",
        "Reads: 100:1 → ~120,000/s average — this is a read system with a write feature",
        "Storage: 100M × 500B = 50GB/day ≈ 18TB/year — large, but not exotic",
        "A 7-character base62 code gives 62⁷ ≈ 3.5 × 10¹² codes: centuries of headroom",
      ],
    },
    entities: [
      { name: "Link", fields: "code (pk), longUrl, ownerId, createdAt, expiresAt?",
        note: "Immutable once created. That single fact is what makes the entire read path cacheable, and it is worth saying out loud." },
      { name: "User", fields: "id, email",
        note: "Only exists if custom aliases or per-owner stats are in scope. If they are not, say so and leave it out." },
      { name: "Click", fields: "code, at, country, referrer",
        note: "Append-only, and off the redirect path. It is a different system that happens to share a key." },
    ],
    api: [
      { call: "POST /links", body: "{ longUrl, customAlias?, expiresAt? }", returns: "201 { code, shortUrl }",
        note: "The only write in the system. Everything else is a read." },
      { call: "GET /{code}", body: "—", returns: "302 Location: longUrl",
        note: "Not under /links. The short URL is the product, and every prefix character is one the user has to carry." },
      { call: "DELETE /links/{code}", body: "—", returns: "204",
        note: "Needs an owner, which is the reason User is an entity at all." },
      { call: "GET /links/{code}/stats", body: "—", returns: "200 { clicks, byDay }",
        note: "Served from the analytics store. Never from the redirect path." },
    ],
    deepDives: [
      {
        q: "Custom aliases and generated codes share one namespace. What stops them colliding?",
        answer: "One table, with uniqueness enforced by the store rather than by a check in the application: insert-if-absent, or a conditional write. A custom alias that loses the race gets a 409 and the caller picks again. Generated codes cannot collide with each other by construction — they come from a counter, not a hash — so only the custom path pays for the check.",
        watchFor: "\"Check whether it exists, then write it\" is two operations with a race between them. Say what makes it one.",
      },
      {
        q: "One link goes viral: a million reads a second, every one of them the same key. What breaks first?",
        answer: "The single cache shard that key hashes to. Adding cache nodes does not help, because the load is one key and partitioning cannot split it. The value is tiny and immutable, so replicate rather than partition: cache it at the CDN edge with a long TTL and keep a small in-process LRU on each app server. The origin then sees one request per server per TTL.",
        watchFor: "Adding capacity the hot key cannot use. Name the hot-key problem as a hot-key problem.",
      },
      {
        q: "Storage is 18TB and only grows. How do you expire links without scanning it?",
        answer: "Expiry is a property of the row, so check expiresAt on read and return 410. That makes correctness independent of any sweep ever running. Reclaiming the space is a separate, lazy job — a store-native TTL, or an index on expiry walked in the background — and the read path never waits for it.",
        watchFor: "A nightly scan of the whole table, or treating expiry as a deletion problem rather than a read-time check.",
      },
      {
        q: "301 or 302 — and what does that choose for you?",
        answer: "301 is permanent: browsers and intermediaries cache it, so the redirect becomes free, and in exchange you stop seeing the clicks and can never change where the link points. 302 sends every click back to you, which buys analytics and re-targeting at the cost of a round trip every time. It is a requirements question: a marketing link that must be counted and re-pointed is a 302.",
        watchFor: "Picking one as a preference rather than deriving it from a requirement.",
      },
      {
        q: "120,000 clicks a second, each one an analytics event. How does that not slow the redirect down?",
        answer: "The redirect returns before the event is durable. Write it to a local buffer or a log shipper, batch it, and aggregate downstream. Losing a handful of events in a crash is acceptable for a click count; a slow redirect is not. If the count has to be exact, that is a requirement — say so, and pay for it with a durable queue rather than pretending it is free.",
        watchFor: "A synchronous insert into the analytics store on the hot path.",
      },
    ],
    walkthrough: [
      {
        title: "The smallest thing that works",
        components: ["app-servers", "relational-db"],
        says: "One service, one table: code → long URL. Write inserts a row, read selects by primary key and returns a 301.",
        because: "Start where the interviewer can see the whole thing. Everything after this is a response to a specific pressure, and naming the pressure is the part being assessed.",
      },
      {
        title: "Where the code comes from",
        components: ["key-value"],
        says: "Generate codes from a counter encoded in base62, handing each app server a pre-allocated block of the number space. Do not hash the URL and hope.",
        because: "Hashing needs collision handling on every write and makes the same URL collide with itself. A counter is ordered, dense and free of collisions; block allocation stops the counter itself becoming the bottleneck.",
        watchFor: "Sequential codes are guessable. If links are private, that is a requirement, not a detail — say so and add randomness inside the block.",
      },
      {
        title: "Reads leave the database",
        components: ["cache"],
        says: "Put a cache in front of the lookup, keyed by code, with a long TTL. Links are immutable once created, which makes this the easy kind of caching.",
        because: "120,000 reads/s against one database is the actual problem in this design. Immutable values mean no invalidation problem at all — the hard part of caching simply does not arise here.",
        watchFor: "A cold cache hands the whole read load to the database at once. Say what happens on restart.",
      },
      {
        title: "Reads leave your servers entirely",
        components: ["cdn"],
        says: "Serve the redirect at the edge where the platform allows it, or at minimum put the redirect behind a CDN with a long TTL.",
        because: "A redirect is a tiny, cacheable, geographically-sensitive response — the textbook case for an edge. It also cuts the latency a user's browser actually experiences, which is the whole product.",
      },
      {
        title: "Storage past one machine",
        components: ["sharding", "key-value"],
        says: "Shard by the short code itself. Every read and every write already carries it, so no query needs to cross a shard.",
        because: "18TB/year outgrows one box. The shard key is obvious here precisely because the access pattern is: the code is in every request, so nothing scatters.",
        watchFor: "Analytics — 'how many clicks did this get' — is a different access pattern and does not belong on this path.",
      },
      {
        title: "Counting clicks without slowing redirects",
        components: ["queue", "worker-pool", "wide-column"],
        says: "Fire an event per redirect onto a queue and aggregate it asynchronously. Never write to a counter on the redirect path.",
        because: "A synchronous counter write doubles the cost of the hottest path in the system and couples a redirect's availability to the analytics store's. Losing a click count is acceptable; failing a redirect is not.",
      },
    ],
    rubric: [
      "Asked about read:write ratio before designing anything",
      "Computed enough scale to justify the choices, rather than assuming 'big'",
      "Chose a code generation scheme and defended it against the alternative",
      "Put a cache on the read path and said what happens when it is cold",
      "Named a shard key and showed that queries carry it",
      "Kept analytics off the redirect path",
      "Said what is lost when each component fails",
    ],
  },

  {
    id: "rate-limiter",
    name: "Design a distributed rate limiter",
    difficulty: "Medium",
    tags: ["coordination", "caching", "consistency"],
    prompt:
      "Design a rate limiter that caps each API client at N requests per minute, across a fleet of gateway instances.",
    requirements: {
      functional: [
        "Allow or reject a request based on the client's recent rate",
        "Limits configurable per client and per endpoint",
        "Tell the client the limit, what is left, and when it resets",
      ],
      nonFunctional: [
        "The check is on every request, so it must add ~1ms, not ~10ms",
        "Must stay roughly correct across many gateway instances",
        "It must not become the reason the API is down",
      ],
    },
    estimate: {
      assumptions: ["50,000 req/s across the fleet", "20 gateway instances", "1M distinct clients"],
      derive: [
        "50,000 counter operations/s — a single Redis handles this, but not with room to spare",
        "1M clients × a small counter ≈ tens of MB: memory is not the constraint, round trips are",
        "Per-instance limits would give 20× the intended limit, so the state must be shared",
      ],
    },
    entities: [
      { name: "Policy", fields: "subject (clientId | ip | apiKey), endpoint, limit, windowSec",
        note: "Configuration, not traffic: read constantly, written rarely. Keeping it data rather than code is what makes a limit changeable without a deploy." },
      { name: "Counter", fields: "key = subject:endpoint:window, count, expiresAt",
        note: "The only hot thing in the system. It lives in memory and is allowed to be lost — which is a decision you should make deliberately, not discover." },
      { name: "Decision", fields: "allowed, remaining, resetAt, retryAfter",
        note: "Not stored. It is the response, and those four fields are the response headers." },
    ],
    api: [
      { call: "check(subject, endpoint, cost)", body: "in-process", returns: "{ allowed, remaining, resetAt }",
        note: "A library call inside the gateway, not a service call. Making it an HTTP hop adds exactly the latency the design is trying to avoid." },
      { call: "GET /limits/{subject}", body: "—", returns: "200 { limits }",
        note: "So a customer can see their own limits instead of discovering them by being rejected." },
      { call: "PUT /limits/{subject}", body: "{ endpoint, limit, windowSec }", returns: "204",
        note: "The config plane. This is the endpoint that makes \"raise their limit now\" possible." },
      { call: "every response", body: "—", returns: "X-RateLimit-Limit / -Remaining / -Reset, and 429 + Retry-After",
        note: "Telling the client when to come back is the difference between backing off and hammering you." },
    ],
    deepDives: [
      {
        q: "Raise one customer's limit right now, with no deploy. How?",
        answer: "The policy is a row, not a constant. Gateways read it from a store and keep it in a local cache with a short TTL, or subscribe to change notifications. The cost is a bounded window of staleness — name the number, ten seconds or so, and confirm it is acceptable.",
        watchFor: "Limits compiled into the gateway, or a read of the policy store on every request — which puts the config plane on the hot path.",
      },
      {
        q: "The counter store is unreachable. Does everything get rejected, or does everything get through?",
        answer: "This is a business decision and the answer is that somebody must have made it. Fail open keeps the product up and accepts a window of abuse; fail closed protects the backend and turns a dependency outage into your outage. The usual choice is to fail open with a conservative per-instance local limit, so it degrades instead of disappearing.",
        watchFor: "Not having an answer, or picking one without saying whose risk is being taken.",
      },
      {
        q: "100 million distinct clients. What does the counter state actually cost?",
        answer: "Only clients seen inside the current window have a counter, and those counters expire with the window — the working set is active clients, not all clients. At roughly a hundred bytes a key, a million active clients is about 100MB, which fits in memory comfortably. That sizing only holds for a counter-based algorithm: a sliding log stores an entry per request and does not fit.",
        watchFor: "Sizing for every client who ever existed, or choosing sliding-log accuracy without pricing its storage.",
      },
      {
        q: "A fixed window lets a client send 2N requests across the boundary. Does that matter, and what do you do?",
        answer: "It is real: N at the end of one window and N at the start of the next is a 2N burst against a backend sized for N. A sliding window counter — weighting the previous window by how much of it is still in view — removes most of the error for one extra read and no per-request storage. A token bucket is the answer if bursts are something you want to allow deliberately rather than merely tolerate.",
        watchFor: "Asserting that a fixed window is fine without acknowledging the seam.",
      },
      {
        q: "The check runs on every request. Where does it physically run?",
        answer: "In the gateway process, against a counter that is either local with asynchronous reconciliation or in a store on the same rack. A cross-availability-zone round trip per request is the thing to design out — it can cost more than the work being protected. Pipeline or batch the updates where the algorithm allows it.",
        watchFor: "A network call to a distant, strongly consistent store on every single request.",
      },
    ],
    walkthrough: [
      {
        title: "Name the algorithm before the infrastructure",
        components: [],
        says: "Fixed window is one counter per client per minute. Sliding window log is exact and stores every timestamp. Token bucket allows a burst then a steady rate. Pick token bucket unless told otherwise.",
        because: "Each has a specific failure: fixed window lets 2× through across a boundary, the log costs memory proportional to traffic, and token bucket is approximate at the edges. Interviewers are listening for you to name the tradeoff, not the algorithm.",
      },
      {
        title: "Shared state, because per-instance is not a limit",
        components: ["cache"],
        says: "Keep the counter in Redis, keyed by client and window. Do the check and decrement in one atomic operation — a Lua script or INCR with expiry — not read-then-write.",
        because: "Twenty instances each enforcing the limit enforce twenty times the limit. Read-then-write races under exactly the load the limiter exists for.",
        watchFor: "A round trip per request is the latency budget. Say the number.",
      },
      {
        title: "Making it fast enough",
        components: ["cache", "rate-limiter"],
        says: "Give each instance a local allowance drawn from the shared budget, refilled periodically. Check locally; synchronise in the background.",
        because: "This is the real answer to 'add 1ms not 10ms'. It trades exactness for latency — the limit becomes approximate near the boundary — which for rate limiting is a trade almost always worth making, and saying so out loud is the point.",
      },
      {
        title: "What happens when the counter store is down",
        components: ["load-shedding"],
        says: "Decide fail-open or fail-closed, and say why. For a public API protecting scarce capacity, fail closed to a conservative local limit. For a login flow, fail open.",
        because: "This is the question that separates a design from a diagram. Either answer is defensible; having not considered it is not.",
      },
      {
        title: "Telling the client",
        components: ["api-gateway"],
        says: "Return 429 with the limit, remaining and reset headers, plus Retry-After.",
        because: "A client that is refused without being told when to return will retry immediately, and your limiter becomes a load amplifier.",
      },
    ],
    rubric: [
      "Named an algorithm and its specific failure mode",
      "Recognised per-instance counters do not enforce a fleet limit",
      "Made the check-and-decrement atomic",
      "Addressed the latency cost of a round trip per request",
      "Decided fail-open vs fail-closed deliberately",
      "Told the client enough to back off correctly",
    ],
  },

  {
    id: "news-feed",
    name: "Design a news feed",
    difficulty: "Hard",
    tags: ["fan-out", "caching", "ranking"],
    prompt:
      "Design the home timeline for a social network: the list of recent posts from everyone a user follows.",
    requirements: {
      functional: [
        "A user sees recent posts from people they follow",
        "Posting is fast and appears promptly for followers",
        "The feed is paginated and stable enough to scroll",
      ],
      nonFunctional: [
        "Feed load is the most common request in the product, and must be fast",
        "The follower graph is wildly uneven — most users have hundreds, some have millions",
        "Slightly stale is fine; missing a post entirely is not",
      ],
    },
    estimate: {
      assumptions: ["500M daily users", "2 posts/user/day", "each user follows ~200", "feed opened 10×/day"],
      derive: [
        "Writes: 1B posts/day ≈ 12,000/s",
        "Feed reads: 5B/day ≈ 58,000/s — this is fundamentally a read system",
        "Fan-out on write: 1B posts × 200 followers = 200B timeline inserts/day. That number is the whole problem.",
      ],
    },
    entities: [
      { name: "User", fields: "id, handle, displayName", note: "" },
      { name: "Follow", fields: "followerId, followeeId, createdAt",
        note: "The edge, and the whole problem. Its cardinality is what decides push against pull." },
      { name: "Post", fields: "id, authorId, body, createdAt", note: "" },
      { name: "FeedEntry", fields: "userId, postId, score, createdAt",
        note: "Only exists if you fan out on write. It is a materialised view — derivable, rebuildable, and safe to cap." },
    ],
    api: [
      { call: "POST /posts", body: "{ body, mediaIds? }", returns: "201 { id, createdAt }",
        note: "Returns as soon as the post is durable. Fan-out happens after, asynchronously." },
      { call: "GET /feed", body: "?cursor=&limit=", returns: "200 { items, nextCursor }",
        note: "A cursor, not an offset. An offset page shifts under the reader every time somebody posts." },
      { call: "POST /follows/{userId}", body: "—", returns: "204", note: "" },
      { call: "DELETE /follows/{userId}", body: "—", returns: "204", note: "" },
    ],
    deepDives: [
      {
        q: "A user with 50 million followers posts. What happens?",
        answer: "Fan-out on write turns one post into fifty million writes, and the queue backs up behind it for everyone else. So do not fan those out: above a threshold an author is pulled at read time and merged with the pushed feed. The cost is that every read now does a merge, and the threshold is a number you tune rather than derive.",
        watchFor: "\"Make the queue bigger.\" The problem is not throughput, it is that the work is unbounded per post.",
      },
      {
        q: "Someone unfollows. Do you rewrite their timeline?",
        answer: "No. Filter at read time against the current follow set and let the stale entries age out of the capped list. Rewriting is work proportional to everything that author ever posted, triggered by an action that happens constantly and that nobody is waiting on.",
        watchFor: "A delete-by-author sweep across the unfollower's feed — correct, and far too expensive for what it buys.",
      },
      {
        q: "A brand-new user follows nobody. What is in their feed?",
        answer: "Nothing, which is a product failure rather than a correct empty result. Serve a global or topical popular feed until there are enough follows to personalise, and say that is what you are doing. This is worth naming precisely because it is the part that gets skipped as an infrastructure question when it is a product one.",
        watchFor: "Returning an empty list and treating it as correct.",
      },
      {
        q: "Rank by relevance instead of recency. What changes?",
        answer: "The feed store stops being the answer and becomes a candidate set. Scoring moves to read time over a bounded number of candidates, with features precomputed offline so the read stays cheap. Pagination gets harder: pin the ranking inputs per scroll session, or the same post appears twice as scores move under the reader.",
        watchFor: "Ranking the whole corpus at read time, or ignoring what ranking does to pagination stability.",
      },
      {
        q: "How large do you let one user's materialised feed get?",
        answer: "Capped — the most recent several hundred entries. Deep scrolling past the cap falls back to a pull, which is rare enough to be allowed to be slower. An uncapped per-user list is storage proportional to users times their following activity, with no natural limit.",
        watchFor: "Unbounded per-user lists, which is the version of this design that works in a demo and not in a year.",
      },
    ],
    walkthrough: [
      {
        title: "The two approaches, stated as a tradeoff",
        components: [],
        says: "Fan-out on write pushes each post into every follower's timeline — expensive writes, trivial reads. Fan-out on read assembles the feed by querying everyone you follow — cheap writes, expensive reads.",
        because: "Every good answer to this problem is a position on this tradeoff. Picking one without naming the other is the most common way this interview goes wrong.",
      },
      {
        title: "Fan-out on write, for almost everyone",
        components: ["queue", "worker-pool", "wide-column"],
        says: "On post, enqueue a fan-out job; workers append the post id into each follower's timeline list, stored per user and capped at a few hundred entries.",
        because: "Reads outnumber writes five to one and are latency-critical, so pay on write. A capped list bounds storage and matches how far anyone actually scrolls.",
        watchFor: "This is asynchronous, so a post appears in followers' feeds a second or two later. That is a product decision — check it is acceptable.",
      },
      {
        title: "Celebrities break it, so exclude them",
        components: ["cache"],
        says: "Above a follower threshold, do not fan out. Store those posts once, and merge them into the feed at read time from a small per-celebrity cache.",
        because: "One post to 100M followers is 100M writes for one action. The hybrid is the actual answer to this interview: fan-out on write for the tail, fan-out on read for the head, merged at request time.",
        watchFor: "Name the threshold and say it is tunable. A hard-coded 10,000 invites the follow-up about why.",
      },
      {
        title: "Serving the read",
        components: ["cache", "app-servers"],
        says: "Keep the top of each timeline in cache. A feed request reads the cached list of ids, merges any celebrity posts, then hydrates the post bodies in one batched fetch.",
        because: "Separating the id list from the post bodies means one cached post object serves every follower, instead of being copied into every timeline.",
      },
      {
        title: "Ranking, if asked",
        components: ["stream-processing", "search-index"],
        says: "Chronological first. If ranking is required, score candidates at read time from features maintained by a stream job, and keep the candidate set small.",
        because: "Ranking turns a merge into a scoring problem and changes the caching story completely. Do not volunteer it before the interviewer asks; do have an answer.",
      },
      {
        title: "Pagination that does not repeat itself",
        components: [],
        says: "Cursor on post id or timestamp, never offset.",
        because: "An offset into a list that is growing at the head shows the same post twice. It is a small thing that signals whether you have built one of these.",
      },
    ],
    rubric: [
      "Stated the fan-out tradeoff in both directions before choosing",
      "Computed the fan-out write volume and used it to justify the choice",
      "Handled the celebrity case as a hybrid rather than ignoring it",
      "Separated timeline ids from post bodies",
      "Made fan-out asynchronous and acknowledged the staleness that buys",
      "Used a cursor rather than an offset",
      "Bounded per-user timeline storage",
    ],
  },

  {
    id: "chat",
    name: "Design a chat system",
    difficulty: "Hard",
    tags: ["realtime", "delivery", "ordering"],
    prompt:
      "Design one-to-one and small-group messaging with delivery receipts and history.",
    requirements: {
      functional: [
        "Send and receive messages in near real time",
        "Messages are durable and readable as history",
        "Sent / delivered / read receipts",
        "Delivery to a recipient who is offline right now",
      ],
      nonFunctional: [
        "Delivery in well under a second when both parties are online",
        "Messages must never be lost, and must not be shown out of order",
        "Connection count is the scaling unit, not request rate",
      ],
    },
    estimate: {
      assumptions: ["50M concurrent connections", "40 messages per user per day", "500M users"],
      derive: [
        "50M concurrent sockets ÷ ~50k per node = ~1,000 connection nodes",
        "20B messages/day ≈ 230,000/s average",
        "Storage at ~200 bytes/message ≈ 4TB/day — this is a write-heavy store",
      ],
    },
    entities: [
      { name: "User / Device", fields: "userId, deviceId, pushToken",
        note: "Delivery is per device, not per user. That distinction is most of what makes receipts and multi-device hard." },
      { name: "Conversation", fields: "id, type (direct | group), memberIds", note: "" },
      { name: "Message", fields: "id, conversationId, senderId, body, sentAt, seq",
        note: "seq is per conversation and assigned by the server. It is what makes \"what order did this happen in\" a question with an answer." },
      { name: "Receipt", fields: "conversationId, userId, deviceId, upToSeq, state (delivered | read)",
        note: "Up-to a sequence, not per message — otherwise a screenful of messages is a screenful of writes." },
      { name: "Connection", fields: "userId, deviceId, nodeId, since",
        note: "Ephemeral routing state with a TTL. It is not history and must not be treated as durable." },
    ],
    api: [
      { call: "WS connect", body: "auth token", returns: "session established",
        note: "The connection is the subscription. There is no polling endpoint to design." },
      { call: "WS send", body: "{ conversationId, clientMsgId, body }", returns: "ack { id, seq, sentAt }",
        note: "clientMsgId makes a resend after a dropped connection idempotent instead of a duplicate." },
      { call: "GET /conversations/{id}/messages", body: "?afterSeq=&limit=", returns: "200 { messages, nextSeq }",
        note: "Catch-up is a query by sequence, which is why the server assigns one." },
      { call: "POST /conversations/{id}/receipts", body: "{ upToSeq, state }", returns: "204", note: "" },
    ],
    deepDives: [
      {
        q: "A node holding 50,000 connections crashes. What happens to those users?",
        answer: "Connections are ephemeral, so nothing durable is lost: clients reconnect — with backoff and jitter, or all fifty thousand arrive at the replacement together — their registry entries expire by TTL, and anything sent meanwhile was persisted before it was delivered, so it arrives on resume. The property that makes this true is writing before delivering, and it is worth saying explicitly.",
        watchFor: "Any answer in which an in-flight message existed only in the crashed node's memory.",
      },
      {
        q: "A client has been offline for a week. How does it catch up without downloading everything?",
        answer: "It knows the last sequence it saw per conversation and asks for what came after, paginated. Conversations it has not opened are fetched lazily when opened rather than eagerly on connect. The server keeps a bounded backlog and is allowed to answer \"that is too old, here is a snapshot instead\".",
        watchFor: "Replaying a global log, or sending the whole history on reconnect.",
      },
      {
        q: "Group chat with a thousand members. How does one send become a thousand deliveries?",
        answer: "One durable write to the conversation, then fan out to connected devices only; everyone else picks it up from history on resume. Receipts have to aggregate — a count of who has read up to which sequence — because a thousand receipt rows per message per state is more write traffic than the messages themselves.",
        watchFor: "A thousand durable writes per message, or per-member receipt rows.",
      },
      {
        q: "Two messages are sent at the same instant from different devices. What order does everyone see?",
        answer: "The order the server commits them in, expressed as the per-conversation sequence, and it is the same for every participant. Client timestamps are for display and will disagree — clocks are not synchronised and cannot be made to be. Total ordering per conversation is enough here; global ordering across all conversations is neither needed nor affordable.",
        watchFor: "Ordering by client timestamp, or promising a global order.",
      },
      {
        q: "Add end-to-end encryption. What does it cost you?",
        answer: "The server stops being able to read content, so everything that depended on reading it goes: server-side search, link previews, spam classification and moderation either move to the client or stop existing. Key distribution and adding a second device become the hard problems. Metadata — who talks to whom, when, how much — is still visible, and pretending otherwise is the common mistake.",
        watchFor: "\"Just encrypt the messages\" without naming the features that die.",
      },
    ],
    walkthrough: [
      {
        title: "Connections are the architecture",
        components: ["websockets", "load-balancer"],
        says: "A tier of connection servers holding long-lived sockets, behind a load balancer configured for upgrades and long idle timeouts. This tier is stateful by nature.",
        because: "Everything about this design follows from the fact that a user is attached to one specific machine. That is the constraint the rest of the answer works around.",
      },
      {
        title: "Finding the machine a user is on",
        components: ["cache", "pub-sub"],
        says: "Keep a session registry — user id to connection node — in a shared cache, and route a message by publishing to that node's channel.",
        because: "The sender's connection is on a different node from the recipient's. Something has to know where to deliver, and a registry plus pub/sub is the standard answer.",
        watchFor: "The registry is stale the moment a node dies. Say how it is repaired — TTL plus heartbeat.",
      },
      {
        title: "Durable before delivered",
        components: ["wide-column", "queue"],
        says: "Write the message to storage first, then attempt delivery. Partition history by conversation id, clustered by message id so a read is a range scan.",
        because: "'Never lost' means the write happens before the network hop that might fail. Doing it the other way round is the bug this design is most often written with.",
      },
      {
        title: "Ordering, honestly",
        components: ["event-log"],
        says: "Order per conversation, not globally, using a sequence assigned by the store. Clients sort by it and can detect gaps.",
        because: "Global ordering across a chat system is neither achievable nor wanted. Per-conversation is what users perceive, and it is cheap because a conversation is a partition.",
      },
      {
        title: "Offline recipients",
        components: ["queue", "worker-pool"],
        says: "If the registry shows no connection, the message is already durable; queue a push notification. On reconnect the client asks for everything after its last sequence number.",
        because: "Offline is the normal case, not the exception. A design that only works when both parties are connected is answering an easier question.",
      },
      {
        title: "Receipts as messages",
        components: ["pub-sub"],
        says: "Delivered and read are just small events on the same path, written and routed the same way.",
        because: "Reusing the delivery path instead of inventing a second one keeps ordering and durability guarantees identical for both, which is the only way the two stay consistent.",
      },
    ],
    rubric: [
      "Recognised connections, not requests, as the scaling unit",
      "Solved routing between connection nodes explicitly",
      "Persisted before delivering",
      "Scoped ordering to a conversation and said why not globally",
      "Handled the offline case as the normal path",
      "Said what happens when a connection node dies",
    ],
  },

  {
    id: "web-crawler",
    name: "Design a web crawler",
    difficulty: "Medium",
    tags: ["pipeline", "coordination", "storage"],
    prompt:
      "Design a crawler that fetches and stores a large portion of the public web, politely and without repeating itself.",
    requirements: {
      functional: [
        "Fetch pages starting from a seed set and follow links",
        "Store page content for downstream indexing",
        "Do not fetch the same URL repeatedly",
        "Respect robots.txt and per-host politeness",
      ],
      nonFunctional: [
        "Throughput in the thousands of pages per second",
        "Must not overwhelm any single host",
        "Must make progress despite crashes, and not restart from scratch",
      ],
    },
    estimate: {
      assumptions: ["1B pages/month", "~100KB per page"],
      derive: [
        "1B ÷ 2.6M seconds ≈ 400 pages/s average, several thousand at peak",
        "100TB/month of raw content — object storage, not a database",
        "URL seen-set at 1B+ entries: a Bloom filter is the classic answer",
      ],
    },
    entities: [
      { name: "UrlRecord", fields: "url (normalised, pk), host, firstSeen, lastFetched, etag, status, nextEligibleAt",
        note: "Normalisation is part of identity here: the same page reached three ways must be one record or the dedup does nothing." },
      { name: "Page", fields: "urlHash, fetchedAt, contentHash, blobRef",
        note: "The content is in a blob store; this row is a pointer to it. contentHash is what catches the same page served at many URLs." },
      { name: "HostState", fields: "host, robots, crawlDelay, lastFetchedAt, healthy",
        note: "Politeness is per host, which makes the host a first-class entity rather than a field on a URL." },
      { name: "FrontierEntry", fields: "url, host, priority, leasedUntil",
        note: "Leased, not popped. A worker that dies must not take its URLs with it." },
    ],
    api: [
      { call: "enqueue(urls[], fromUrl)", body: "internal", returns: "accepted count",
        note: "Normalises, dedups and drops anything robots disallows before it ever reaches the frontier." },
      { call: "next(workerId)", body: "internal", returns: "{ url, host, leaseUntil }",
        note: "A lease with a visibility timeout. This one choice is what makes worker crashes a non-event." },
      { call: "complete(url, result)", body: "{ status, contentHash, links[] }", returns: "ok",
        note: "Must be safe to apply twice, because a lease that expires mid-flight means it will be." },
      { call: "GET /crawl/status", body: "—", returns: "200 { queued, inFlight, fetchedPerSec, byHost }",
        note: "A crawler without this is a program you cannot tell is stuck." },
    ],
    deepDives: [
      {
        q: "A calendar page generates infinite URLs. How do you not crawl it forever?",
        answer: "Bound it rather than try to detect it: a per-host page budget, a depth limit from each seed, aggressive URL normalisation to collapse parameter permutations, and content hashing so a page that only produces near-duplicates stops being expanded from. Traps are indistinguishable from large sites, so the defence has to be a budget rather than a classifier.",
        watchFor: "Pattern blacklists as the primary defence — they only catch the traps somebody has already seen.",
      },
      {
        q: "Which URL do you fetch next, and why that one?",
        answer: "Not FIFO. Score by host importance, observed change frequency, depth from seed, and how overdue a refetch is. But the frontier is already partitioned by host for politeness, so priority operates inside a host's queue and across hosts you are choosing which host is eligible now — the two constraints have to be designed together.",
        watchFor: "A single global priority queue, which pulls directly against the per-host rate limiting.",
      },
      {
        q: "Your Bloom filter says you have seen this URL. What is the false-positive rate, and does it matter?",
        answer: "A false positive means a page is never fetched — a silent, permanent omission with nothing to alert on. Size it for the URL count you expect and state the rate: around ten bits per element gives roughly one percent. For anything that matters, back it with an exact lookup in the store. The filter's errors only go one way, and that direction is the tolerable one, which is why it is the right structure here.",
        watchFor: "Not knowing which direction the filter can be wrong in.",
      },
      {
        q: "A worker dies holding fifty leased URLs. What happens to them?",
        answer: "Their leases expire and they become eligible again, with no coordination and nobody noticing. That requires fetch and complete to be idempotent, because a lease that expires while the work is still in flight means the same URL genuinely will be processed twice.",
        watchFor: "A pop-based queue, where a crash loses the work silently.",
      },
      {
        q: "A host publishes a stricter robots.txt, or starts returning 429. How fast do you comply?",
        answer: "robots is cached per host with a TTL and refetched on a schedule, so compliance is bounded by that TTL — name it. A 429 or a 503 with Retry-After feeds straight into that host's state and slows it immediately, without waiting for anything. Because politeness is enforced at the host partition, one host backing off does not slow the fleet.",
        watchFor: "Caching robots indefinitely, or treating 429 as a transient error to retry through.",
      },
    ],
    walkthrough: [
      {
        title: "A pipeline, not a program",
        components: ["queue", "worker-pool"],
        says: "Frontier queue → fetchers → parser → extracted links back to the frontier. Each stage scales independently.",
        because: "Fetching is IO-bound and parsing is CPU-bound. Splitting them lets each scale on its own constraint, which is the entire reason this is a pipeline.",
      },
      {
        title: "Politeness is a partitioning problem",
        components: ["consistent-hashing", "rate-limiter"],
        says: "Partition the frontier by host so all URLs for one host go to one worker, which paces itself per host.",
        because: "Politeness is per host, so the constraint is only enforceable if one place owns each host. This turns a coordination problem into a routing decision — the move worth pointing out.",
      },
      {
        title: "Not fetching the same thing twice",
        components: ["cache", "key-value"],
        says: "A Bloom filter for the seen-set, backed by a durable store for the authoritative check.",
        because: "An exact set of a billion URLs is expensive in memory; a Bloom filter answers 'definitely not seen' cheaply. False positives mean skipping a page, which is acceptable here — say so.",
        watchFor: "Canonicalise URLs first, or the same page appears a dozen ways.",
      },
      {
        title: "Storage",
        components: ["object-storage", "key-value"],
        says: "Raw content in object storage keyed by content hash; metadata and crawl state in a key-value store.",
        because: "Content is large and immutable, which is exactly what object storage is for. Hashing by content deduplicates mirrors for free.",
      },
      {
        title: "Surviving a crash",
        components: ["queue"],
        says: "A URL is only removed from the frontier once its content is stored. In-flight work returns after a visibility timeout.",
        because: "A crawl runs for weeks. 'Restarts cleanly' is a requirement, and at-least-once with idempotent storage is how you get it.",
      },
      {
        title: "Recrawling",
        components: ["time-series-db", "batch-pipeline"],
        says: "Track per-URL change frequency and schedule recrawls adaptively — news hourly, a static page monthly.",
        because: "Uniform recrawling wastes most of the budget. Noticing the crawl is never finished, only more or less current, is what distinguishes a considered answer here.",
      },
    ],
    rubric: [
      "Structured it as independently scaling stages",
      "Made politeness a partitioning decision rather than a wish",
      "Chose a deduplication structure and accepted its error mode",
      "Canonicalised URLs",
      "Made crash recovery explicit",
      "Treated recrawl frequency as adaptive",
    ],
  },

  {
    id: "payments",
    name: "Design a payments service",
    difficulty: "Hard",
    tags: ["correctness", "money", "exactly-once", "write-heavy"],
    prompt:
      "Design the service a marketplace uses to charge buyers through an external card processor and pay sellers out, keeping an exact record of every movement of money.",
    requirements: {
      functional: [
        "Charge a buyer for an order through an external processor",
        "Refund all or part of a charge",
        "Show a seller their balance and history",
        "Pay sellers out on a schedule",
      ],
      nonFunctional: [
        "A buyer is never charged twice for one order — not on a retry, not on a double click, not after a crash",
        "Every cent is accounted for: the books balance at every instant, and history is never edited",
        "The processor is slow and sometimes answers nothing at all; the design has to survive not knowing",
        "Reads (dashboards, history) vastly outnumber writes and may be slightly stale; balances used for payouts may not",
      ],
    },
    estimate: {
      assumptions: ["5M orders/day", "~3 ledger entries per order (charge, fee, seller credit)", "Dashboards: 50 reads per write"],
      derive: [
        "Writes: 5M/day ÷ 86,400 ≈ 60 charges/s average, a few hundred at a sale's peak — modest",
        "Ledger rows: 15M/day ≈ 5.5B/year — the size is in history, not throughput",
        "Reads: 50:1 → ~3,000/s against history and balances — the load to move off the primary",
        "The hard number is not a rate: it is zero double charges. Design for that, then check the rates fit",
      ],
    },
    entities: [
      { name: "Payment", fields: "id, orderId, idempotencyKey (unique), amount, currency, state, processorRef?",
        note: "A state machine: created → authorizing → captured | failed | unknown. 'Unknown' is a real state, not an error." },
      { name: "LedgerEntry", fields: "id, paymentId, account, amount (signed), createdAt",
        note: "Double entry and append-only. Every movement is two rows that sum to zero; a correction is a new pair, never an UPDATE." },
      { name: "Account", fields: "id, ownerId, kind (buyer|seller|platform|processor)",
        note: "A balance is the sum of an account's entries, which is why it can be rebuilt and checked at any time." },
      { name: "Payout", fields: "id, sellerId, amount, state, periodEnd",
        note: "Computed from the ledger as of a cut-off, so a payout is reproducible after the fact." },
    ],
    api: [
      { call: "POST /payments", body: "Idempotency-Key header; { orderId, amount, currency, paymentMethod }", returns: "201 { id, state }",
        note: "The key is the client's promise that a retry is the same request. Without it there is no safe retry." },
      { call: "GET /payments/{id}", body: "—", returns: "200 { state, amount, processorRef }",
        note: "How a client that timed out finds out what happened, instead of guessing and paying again." },
      { call: "POST /payments/{id}/refunds", body: "Idempotency-Key header; { amount }", returns: "201 { refundId }",
        note: "Refunds need their own key: two legitimate partial refunds look identical otherwise." },
      { call: "GET /accounts/{id}/entries", body: "?cursor=", returns: "200 { entries, nextCursor }",
        note: "Paginated history, served from a replica." },
    ],
    deepDives: [
      {
        q: "You call the processor to capture $80. The connection drops before any answer. Was the buyer charged?",
        answer: "You do not know, and the design must say so. Mark the payment 'unknown', never 'failed', and never retry with a new request. Ask the processor — by your own reference or their idempotency key — what happened, on a schedule, until it says. Most processors accept an idempotency key of their own; pass yours through so a retry of the capture is the same capture. Only a definite answer moves the state, and the ledger is written once, when it does.",
        watchFor: "Treating a timeout as a failure and charging again, or as a success and shipping the goods.",
      },
      {
        q: "The buyer double-clicks Pay. Two identical requests arrive 40ms apart on two different servers. Walk through it.",
        answer: "Both carry the same idempotency key. The first to insert the key's row wins, enforced by a unique constraint in the same transaction that creates the payment; the second insert fails, and that request waits for the first to finish and returns its stored response. The guarantee comes from the database's uniqueness, not from a check in code, because 'look, then write' has a race between the look and the write.",
        watchFor: "Checking whether the key exists and then inserting. Say what makes it a single atomic step.",
      },
      {
        q: "You hold a lock so only one worker captures a payment. That worker pauses for a 30-second garbage collection, the lock expires, another worker takes over. Now what?",
        answer: "Both may act, which is why a lock with a timeout is not mutual exclusion on its own. Hand out a fencing token — a number that increases with every grant — and have the thing being protected reject a write carrying an older token than one it has seen. Here the payment row is the protected thing: the state transition is a conditional update ('set captured where state = authorizing and token <= mine'), so a stale worker's write simply matches nothing.",
        watchFor: "Believing a distributed lock alone prevents double execution.",
      },
      {
        q: "A seller refreshes their dashboard right after a sale and their balance hasn't moved. Is that a bug?",
        answer: "It is replication lag: history is read from replicas that run a little behind the primary. For a dashboard that is acceptable, and saying so is part of the answer. Where it is not — the seller's own just-completed action, or the balance used to compute a payout — read from the primary, or read from a replica only once it has applied the write's position (read-your-writes by log position).",
        watchFor: "Either sending every read to the primary, or ignoring lag where money is decided.",
      },
      {
        q: "Receipts, fraud scoring, search and the data warehouse all need to know about every payment. Why not have the payment service call each of them?",
        answer: "Because the call and the database write cannot be made atomic: the payment commits and the receipt call fails, or the reverse, and the systems disagree forever. Make the database the single source and stream its committed changes out — change data capture from the ledger's log, or an outbox table written in the same transaction and relayed. Consumers get every committed change, in order, at least once, and are idempotent on the entry id.",
        watchFor: "Dual writes — 'save, then publish' — with no answer for a crash between the two.",
      },
    ],
    walkthrough: [
      {
        title: "The smallest correct thing",
        components: ["app-servers", "relational-db"],
        says: "One service, one relational database. A payment row with a state machine, and a double-entry ledger table that is only ever appended to.",
        because: "Money wants transactions, constraints and an audit trail more than it wants scale — 60 writes a second is nothing. Double entry means the books can be checked at any moment: every movement sums to zero, so an imbalance is a bug you can find.",
      },
      {
        title: "Retries that cannot charge twice",
        components: ["idempotency"],
        says: "Every mutating call carries an idempotency key. Store the key with the request's hash and its response, under a unique constraint, in the same transaction as the payment.",
        because: "Networks drop answers, clients retry, people double-click. The only way a retry is safe is if the server can recognise it as the same request — and the only reliable recognition is a uniqueness constraint the database enforces.",
        watchFor: "Same key, different body: reject it. Otherwise a reused key silently returns someone else's result.",
      },
      {
        title: "One capture in flight per payment",
        components: ["distributed-lock"],
        says: "Workers that talk to the processor take a lease on the payment, with a fencing token, and the state change is a conditional update guarded by that token.",
        because: "Recovery jobs, retries and the original request can all reach for the same payment. The lease keeps the processor from being asked twice in the ordinary case; the fencing token makes the rare case — a paused holder — harmless rather than expensive.",
      },
      {
        title: "Reads off the primary",
        components: ["read-replica", "cache"],
        says: "Dashboards and history read from replicas; balances shown in lists are cached briefly. Payout computation and a user's read of their own fresh write go to the primary.",
        because: "Reads outnumber writes fifty to one, and the primary's job is to commit money correctly. Replication lag is acceptable for a dashboard and not for a payout, so the split is drawn by what the read decides.",
      },
      {
        title: "Everyone else hears about it from the log",
        components: ["cdc", "event-log", "worker-pool"],
        says: "Capture committed ledger changes from the database's log and publish them. Receipts, fraud, search and the warehouse consume from there.",
        because: "A service that writes its database and then calls four others will, eventually, crash in between. Reading the commit log means downstream systems see exactly what was committed, in order, and can replay it after an outage.",
      },
      {
        title: "Services that trust each other on purpose",
        components: ["service-mesh", "api-gateway"],
        says: "Outside traffic enters through the gateway. Between the payment, ledger and fraud services, a mesh provides mutual TLS, per-route timeouts and traffic policy without each service re-implementing it.",
        because: "In a payments system 'which service is allowed to call the ledger' is a security question with an auditor attached. A mesh makes identity and encryption between services uniform and observable.",
        watchFor: "Mesh-level automatic retries on non-idempotent calls. Retries belong only where an idempotency key makes them safe.",
      },
    ],
    rubric: [
      "Made 'never charge twice' the first requirement and designed for it explicitly",
      "Used idempotency keys enforced by a uniqueness constraint, not a read-then-write check",
      "Treated a processor timeout as an unknown outcome and reconciled it",
      "Kept an append-only, double-entry ledger rather than mutable balances",
      "Explained why a lease alone is not mutual exclusion",
      "Avoided dual writes when notifying other systems",
      "Said where replica lag is acceptable and where it is not",
    ],
  },

  {
    id: "monitoring",
    name: "Design a metrics and alerting system",
    difficulty: "Hard",
    tags: ["observability", "write-heavy", "time-series"],
    prompt:
      "Design the system a company's engineers use to collect metrics, logs and traces from thousands of services, look at them on dashboards, and get paged when something is wrong.",
    requirements: {
      functional: [
        "Ingest metrics (counters, gauges, histograms) from every host and service",
        "Query and graph them over time, with aggregation by tag",
        "Define alert rules and notify on-call through chat, email and paging tools",
        "Search logs and follow a single request across services",
      ],
      nonFunctional: [
        "Ingestion never pushes back on the services being measured — monitoring must not cause the outage",
        "Alerts fire within a minute of a condition becoming true, and do not flap",
        "Recent data is queried constantly; old data rarely, and coarsely",
        "It has to keep working, or at least say so loudly, when the infrastructure it watches is failing",
      ],
    },
    estimate: {
      assumptions: ["20,000 hosts", "~500 active series per host", "One sample per series every 10s", "16 bytes per compressed sample"],
      derive: [
        "Series: 20,000 × 500 = 10M active time series",
        "Samples: 10M ÷ 10s = 1M samples/s ingested",
        "Raw storage: 1M × 16B × 86,400 ≈ 1.4TB/day — so retention has to downsample, not just keep",
        "Logs dwarf metrics: at 1KB/line and 100 lines/s/host that is 2GB/s — a separate pipeline with separate economics",
      ],
    },
    entities: [
      { name: "Series", fields: "metric name + tag set (pk), type",
        note: "The identity is the full tag set. Every new tag value is a new series, which is where cost explodes." },
      { name: "Sample", fields: "seriesId, timestamp, value",
        note: "Append-only, arriving roughly in time order — the access pattern a time-series store is built around." },
      { name: "AlertRule", fields: "id, query, condition, forDuration, severity, route",
        note: "'For duration' is what turns a noisy threshold into an alert worth waking someone for." },
      { name: "Span", fields: "traceId, spanId, parentId, service, start, duration, tags",
        note: "One request becomes a tree of spans across services, joined by trace id." },
    ],
    api: [
      { call: "POST /ingest/metrics", body: "batch of { series, timestamp, value }", returns: "202",
        note: "Batched and accepted asynchronously. A 202 is the promise that ingestion never makes the sender wait on storage." },
      { call: "GET /query", body: "?q=sum(rate(http_errors[5m])) by (service)&from=&to=", returns: "200 { series: [...] }",
        note: "The query picks the resolution: last hour at full detail, last month from rollups." },
      { call: "POST /alerts/rules", body: "{ query, condition, for, severity, route }", returns: "201 { id }",
        note: "Rules are evaluated by the system, on its schedule, not by dashboards." },
      { call: "GET /traces/{traceId}", body: "—", returns: "200 { spans }",
        note: "Only sampled traces exist. Saying which ones are kept is part of the design." },
    ],
    deepDives: [
      {
        q: "A developer adds userId as a tag on a request counter. What happens, and how do you stop it?",
        answer: "Every distinct user becomes its own series: millions of series that each hold a handful of points, which blows up memory in the ingesters and index size in storage, and slows every query that touches the metric. Defend at ingestion: per-metric and per-tenant cardinality limits that drop or aggregate new series past a ceiling, and report that they did. High-cardinality detail like a user id belongs in logs or traces, which are built for it.",
        watchFor: "Treating it as a storage-sizing problem rather than a modelling mistake to be caught at the door.",
      },
      {
        q: "The monitoring system runs in the same data centre that just lost power. Who tells you?",
        answer: "Nobody, unless you planned for it. Monitor the monitor from somewhere else: a small, independent watcher in another region or provider that checks the main system is ingesting and evaluating, and alerts through a different channel. Also alert on absence — 'no data from service X for five minutes' — because a dead service sends no errors.",
        watchFor: "An alerting path that depends on the thing it is supposed to report on.",
      },
      {
        q: "An alert on CPU > 90% fires and resolves forty times an hour. Fix it without hiding real problems.",
        answer: "Require the condition to hold for a duration before firing (and a quieter one before resolving), alert on a rate or an average over a window rather than a single sample, and add hysteresis — fire at 90, resolve at 80. Then ask whether CPU is even the right signal: alert on what users feel (error rate, latency against an objective), and let resource metrics explain an incident rather than declare one.",
        watchFor: "Raising the threshold until it goes quiet.",
      },
      {
        q: "Tracing every request costs more than the services being traced. What do you keep?",
        answer: "Sample. Head-based sampling decides at the first service (keep 1%) — cheap and consistent across the trace, but blind to which requests turn out interesting. Tail-based sampling buffers spans briefly and decides once the trace is complete: keep every error and every slow request, and a small share of the rest. That needs a collector that can see a whole trace, which is the cost of keeping the interesting ones.",
        watchFor: "A flat sample rate that throws away exactly the failing requests you needed.",
      },
      {
        q: "Someone asks for p99 latency across all servers for last quarter. You stored p99 per server per minute. Can you answer?",
        answer: "Not correctly: percentiles do not average. The p99 of a fleet is not the mean of each server's p99. Store histograms (bucket counts) or mergeable sketches instead, which can be summed across servers and across time and then read off as any percentile. Rollups for old data should keep those mergeable forms, not precomputed percentiles.",
        watchFor: "Averaging percentiles, which produces a confident, wrong number.",
      },
    ],
    walkthrough: [
      {
        title: "Collect and store",
        components: ["app-servers", "time-series-db"],
        says: "An agent on each host batches samples and pushes them to stateless collectors, which write into a time-series database partitioned by series and time.",
        because: "Samples are small, append-only and time-ordered, and queries are ranges over time — exactly what a time-series store compresses and scans well. Agents batch so the services being measured pay almost nothing.",
      },
      {
        title: "Ingestion that never pushes back",
        components: ["event-log", "sharding"],
        says: "Collectors write to a durable log, partitioned by series, and storage consumes from it. Series are sharded across storage nodes by a hash of their identity.",
        because: "When storage is slow — and during an incident it will be — the log absorbs the backlog instead of collectors refusing data from the services that are struggling. Monitoring that adds load in an outage makes the outage worse.",
      },
      {
        title: "Rules, alerts and on-call",
        components: ["metrics", "serverless"],
        says: "A rule evaluator queries on a schedule and tracks each rule's state (pending, firing, resolved). Notifications fan out through small serverless functions per destination — chat, email, paging.",
        because: "Evaluation belongs in the system, not in somebody's open dashboard. Notification destinations each have their own APIs, quirks and outages; isolated, short-lived functions keep one broken integration from blocking the page that matters.",
        watchFor: "Deduplication and grouping: one network blip should page once, not for two hundred hosts.",
      },
      {
        title: "Logs, as data rather than text",
        components: ["structured-logs", "search-index", "object-storage"],
        says: "Services log structured events — JSON with request id, service, level, fields — shipped through the same log pipeline into a search index for recent days and object storage for the rest.",
        because: "A grep across a thousand hosts is not a query. Structured fields make 'every error for request abc in the last hour' an index lookup, and keeping only recent logs hot keeps the cost proportional to how often old logs are read.",
      },
      {
        title: "Following one request",
        components: ["tracing", "stream-processing"],
        says: "Propagate a trace id through every call. Spans are collected, assembled per trace by a stream processor, and kept by tail-based sampling rules.",
        because: "Metrics say the checkout is slow; logs say what each service did; only a trace says which of the eleven services in the path spent the time. Sampling after the fact keeps every failure and slow request without paying for every success.",
      },
      {
        title: "Old data, cheaply",
        components: ["batch-pipeline"],
        says: "Roll older data up into coarser, mergeable summaries — five-minute histograms after a week, hourly after a month — and drop the raw samples.",
        because: "1.4TB a day of raw samples is affordable for days, not years, and nobody needs ten-second resolution on last quarter. Rollups that stay mergeable keep long-range percentiles honest.",
      },
    ],
    rubric: [
      "Estimated series count and named cardinality as the dominant cost",
      "Kept ingestion from ever blocking or slowing the services being measured",
      "Alerted on symptoms users feel, with durations to stop flapping",
      "Separated metrics, logs and traces by their different economics",
      "Explained a sampling strategy that keeps errors and slow requests",
      "Said who monitors the monitor",
      "Did not average percentiles",
    ],
  },

  {
    id: "live-scores",
    name: "Design live sports scores",
    difficulty: "Medium",
    tags: ["fan-out", "push", "read-heavy"],
    prompt:
      "Design the feature that shows live scores and play-by-play for ongoing games, updating on millions of open phones and browser tabs within a couple of seconds of each play.",
    requirements: {
      functional: [
        "Show the current score and recent events for a game",
        "Push new events to everyone watching that game as they happen",
        "Let a viewer who reconnects catch up on what they missed",
      ],
      nonFunctional: [
        "Updates reach viewers within ~2 seconds",
        "A final with 10M simultaneous viewers on one game must work",
        "Updates flow one way, server to viewer — viewers never send anything back on this channel",
        "Events for a game arrive in order; a viewer never sees the score go backwards",
      ],
    },
    estimate: {
      assumptions: ["10M concurrent viewers of one big game", "~1 event every 10s during play", "~300 bytes per event"],
      derive: [
        "Writes are trivial: a few events a second across all games",
        "Fan-out is everything: 10M viewers × 0.1 events/s = 1M messages/s for one game",
        "Connections: 10M long-lived connections, at ~50k per server ≈ 200 edge servers for one match",
        "Bandwidth: 1M/s × 300B = 300MB/s — spread across edges, fine; through one origin, not",
      ],
    },
    entities: [
      { name: "Game", fields: "id, teams, status, score, lastSeq",
        note: "The current state, small enough to send whole to anyone who arrives." },
      { name: "GameEvent", fields: "gameId, seq, kind, payload, at",
        note: "A per-game sequence number is what makes ordering and catch-up possible." },
    ],
    api: [
      { call: "GET /games/{id}", body: "—", returns: "200 { score, events (latest), lastSeq }",
        note: "The snapshot. Cacheable for a second or two at the edge." },
      { call: "GET /games/{id}/stream", body: "Last-Event-ID header on reconnect", returns: "text/event-stream",
        note: "A server-sent-events stream. The browser reconnects by itself and says where it got to." },
      { call: "POST /internal/games/{id}/events", body: "{ kind, payload }", returns: "201 { seq }",
        note: "From the data feed or the scorers. The one write path." },
    ],
    deepDives: [
      {
        q: "Why server-sent events and not WebSockets?",
        answer: "The traffic is one way. SSE is plain HTTP: it passes through proxies and CDNs that already understand HTTP, the browser reconnects automatically, and the Last-Event-ID header gives resumption for free. WebSockets buy a bidirectional channel this feature never uses, at the cost of custom reconnection, custom resume logic and infrastructure that has to understand an upgraded connection. If the same screen later added live chat, that would be the moment to reconsider.",
        watchFor: "Choosing WebSockets by default without naming what the second direction is for.",
      },
      {
        q: "The final has 10M viewers. Where does a single goal event go, step by step?",
        answer: "Scorer → event store (assigns seq) → publish once to the game's channel → a few regional relays subscribe → each relay fans out to its edge servers → each edge server writes the event to its tens of thousands of open SSE connections. The origin publishes one message; the fan-out multiplies in a tree, so no single node does more than a bounded amount of work.",
        watchFor: "One pub-sub topic with 10M direct subscribers, or the origin writing to every connection.",
      },
      {
        q: "A phone loses signal for 40 seconds in a tunnel. What does it see when it comes back?",
        answer: "It reconnects with Last-Event-ID: 1042. The edge serves events 1043 onward from a short per-game buffer it keeps in memory. If the gap is longer than the buffer holds, it sends the current snapshot instead and continues from there — a viewer who missed ten minutes wants the score, not every throw-in.",
        watchFor: "Either losing the missed events or replaying an unbounded history.",
      },
      {
        q: "Two scorers' updates race and one viewer briefly sees 2–1, then 1–1, then 2–1. How do you rule that out?",
        answer: "Order is decided once, at write time: the event store assigns a per-game sequence number in a single place (one writer per game, or a conditional increment). Every downstream hop preserves it, and clients ignore anything with a sequence number at or below the last one applied. Sending the full score with each event, not just the delta, means an applied event is always a consistent state.",
        watchFor: "Relying on delivery order across a fan-out tree that does not guarantee it.",
      },
    ],
    walkthrough: [
      {
        title: "Polling, and why it is not enough",
        components: ["app-servers", "cache", "relational-db"],
        says: "Store games and events in a database; clients poll GET /games/{id} every few seconds, answered from a cache.",
        because: "It works and it is the honest starting point — but 10M clients polling every 2s is 5M requests a second to say 'nothing changed' most of the time. Naming that waste is what justifies pushing.",
      },
      {
        title: "Push over one-way streams",
        components: ["sse", "load-balancer"],
        says: "Clients open a server-sent-events stream per game. Edge servers hold the connections; the load balancer is configured for long-lived connections and spreads them evenly.",
        because: "Push sends one message per actual event instead of one per poll. SSE is the simplest push that fits: one direction, ordinary HTTP, automatic reconnection with resume.",
        watchFor: "Proxies that buffer responses will hold events back. Disable buffering on the stream route and send periodic comments as heartbeats.",
      },
      {
        title: "One publish, many receivers",
        components: ["pub-sub"],
        says: "New events are published once to a per-game channel. Regional relays subscribe and forward to the edge servers in their region, which hold the viewer connections.",
        because: "The write is one message; the read is ten million. A tree of relays keeps every node's fan-out bounded, so a bigger audience means more edges, not a hotter origin.",
      },
      {
        title: "Arrivals and reconnections are cheap",
        components: ["cdn"],
        says: "The snapshot endpoint is cached at the CDN for a second or two. Edge servers keep a short ring buffer of recent events per game for resumption.",
        because: "At kick-off and after every network wobble, millions of clients ask for the same snapshot at once. A one-second cache turns that stampede into one origin request per edge per second.",
      },
    ],
    rubric: [
      "Did the fan-out arithmetic and found it, not writes, to be the problem",
      "Chose a push transport and justified it against the alternative",
      "Bounded per-node fan-out with a relay tree",
      "Handled reconnection with resume and a snapshot fallback",
      "Guaranteed ordering with sequence numbers rather than hoping",
    ],
  },

  {
    id: "people-you-may-know",
    name: "Design \"people you may know\"",
    difficulty: "Hard",
    tags: ["graph", "recommendations", "precompute"],
    prompt:
      "Design the feature on a social network that suggests people a user might know, mostly from mutual connections, shown on their home page and profile.",
    requirements: {
      functional: [
        "Suggest people a user is not connected to, ranked by how likely they are to know each other",
        "Explain a suggestion ('12 mutual connections')",
        "Let a user dismiss a suggestion so it never returns",
      ],
      nonFunctional: [
        "Suggestions load with the home page — tens of milliseconds",
        "Suggestions may be hours old; a new connection should be reflected within a day",
        "Never suggest someone the user has blocked or who has blocked them",
        "Some accounts have millions of connections, and must not make the system fall over",
      ],
    },
    estimate: {
      assumptions: ["500M users", "~300 connections on average", "Home page views: 2B/day"],
      derive: [
        "Edges: 500M × 300 ÷ 2 ≈ 75B connections",
        "Friends-of-friends for an average user: 300 × 300 = 90,000 paths — per request, too many to compute live",
        "Reads: 2B/day ≈ 23,000/s, each wanting a ready ranked list",
        "So: compute offline, serve from a lookup. The interesting problem is the computation",
      ],
    },
    entities: [
      { name: "User", fields: "id, name, school, employer, location, settings",
        note: "A profile is one self-contained document, read whole far more than it is queried by field." },
      { name: "Connection", fields: "userA, userB, since",
        note: "An edge. The whole feature is a question about the shape of these." },
      { name: "Suggestion", fields: "userId, candidateId, score, mutualCount, computedAt",
        note: "Precomputed, top few hundred per user, replaced wholesale on each run." },
      { name: "Dismissal / Block", fields: "userId, otherId, kind",
        note: "Applied at read time too, because the precomputed list predates it." },
    ],
    api: [
      { call: "GET /users/{id}/suggestions", body: "?limit=20", returns: "200 [{ user, mutualCount, reason }]",
        note: "A read of a precomputed list, filtered against recent dismissals and blocks." },
      { call: "POST /users/{id}/suggestions/{otherId}/dismiss", body: "—", returns: "204",
        note: "Takes effect at once by filtering, and is folded into the next computation." },
    ],
    deepDives: [
      {
        q: "Why not a SQL self-join on the connections table to find friends of friends?",
        answer: "For one user it is a join of 300 rows against 300 × 300, which a relational database can do; for a celebrity with 5M connections it is 5M × average degree, and for 500M users nightly it is a self-join over 75B rows. A graph database stores adjacency directly, so following edges is a pointer walk rather than an index lookup per hop — the right tool for interactive traversal. For the bulk nightly computation, a distributed batch job over an edge list is better still.",
        watchFor: "One tool for both the live traversal and the bulk computation.",
      },
      {
        q: "A celebrity with 20M followers is connected to the user. What does that do to friends-of-friends?",
        answer: "It makes everyone a candidate: 20M 'mutual' paths through one node that says nothing about whether two people know each other. Treat very high-degree nodes as supernodes — skip them during expansion, or weight a path through a node by 1/log(degree) — so that a shared obscure friend counts for far more than a shared famous one. This is both a correctness fix and the thing that keeps the job's cost bounded.",
        watchFor: "Counting all mutual connections equally.",
      },
      {
        q: "A user blocks someone at 9am. The suggestion list was computed at 3am and includes them. What happens at 9:01?",
        answer: "The read path filters the precomputed list against the user's blocks and dismissals — a small set, cheap to check — before returning anything. Blocks are checked in both directions. The next run excludes the pair at the source, but correctness cannot wait for it: a blocked person appearing even once is a safety failure, not a staleness one.",
        watchFor: "Relying on the next batch run for anything privacy- or safety-related.",
      },
      {
        q: "Recomputing everyone nightly is expensive and most users haven't changed. How do you do less?",
        answer: "Recompute only users whose neighbourhood changed — a new connection within two hops — by tracking changed edges since the last run and expanding them outward. Inactive users can be recomputed on their next visit instead. Fresh connections can also contribute immediately: when two people connect, push each to the top of the other's friends' candidate lists incrementally.",
        watchFor: "No notion of which users are worth recomputing.",
      },
    ],
    walkthrough: [
      {
        title: "Profiles and the graph, stored for how they are read",
        components: ["document-db", "graph-db"],
        says: "Profiles live in a document store, fetched whole by id. Connections live in a graph database built for following edges.",
        because: "A profile has no relationships worth joining on and many optional fields; a document is its natural shape. Connections are the opposite — the questions are all traversals — and a graph store answers 'who is two hops from here' without a join per hop.",
      },
      {
        title: "The computation happens offline",
        components: ["batch-pipeline", "object-storage"],
        says: "A nightly distributed job exports the edge list, computes friends-of-friends for each user, scores candidates by weighted mutual count plus shared school, employer and location, and writes the top few hundred per user.",
        because: "90,000 paths per user per page view is too much work at 23,000 requests a second, and suggestions are allowed to be hours old. That combination — expensive and stale-tolerant — is exactly what precomputation is for.",
      },
      {
        title: "Serving is a lookup",
        components: ["key-value", "cache", "app-servers"],
        says: "Results are bulk-loaded into a key-value store keyed by user id. The app servers read the list, filter it against blocks and dismissals, hydrate the top entries' profiles from cache, and return.",
        because: "A precomputed list behind a single key read is how 'tens of milliseconds' is met. All the cleverness lives in the batch job, where it is cheap to be slow.",
      },
      {
        title: "Changes between runs",
        components: ["queue", "worker-pool"],
        says: "New connections, blocks and dismissals are published as events. Workers update the affected users' suggestion lists incrementally and mark their neighbourhoods for the next full run.",
        because: "Waiting a day to stop suggesting the person you just connected with looks broken. Incremental updates handle the visible cases; the batch job remains the source of truth.",
      },
    ],
    rubric: [
      "Did the friends-of-friends arithmetic and concluded it must be precomputed",
      "Chose storage by access pattern: documents for profiles, a graph for traversal",
      "Handled supernodes rather than counting every mutual connection equally",
      "Enforced blocks at read time, not only in the next batch",
      "Recomputed incrementally or selectively rather than everything every night",
    ],
  },
];
