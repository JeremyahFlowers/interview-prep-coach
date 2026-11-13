// Answers to every component's follow-up questions, and the numbers worth
// carrying into an estimate.
//
// Where it fits: design-components.js teaches each component and ends with
// "what they ask next" — and until this file, only the questions. A follow-up
// you cannot check yourself against is a list of things to feel uneasy about.
// The component page (design-view.js) shows each answer folded under its
// question, so you can try first.
//
// `answers[i]` answers `followUps[i]` of the same component; a test holds the
// two lists to the same length, so a question added there without an answer
// here fails rather than showing a blank.
//
// `numbers` are orders of magnitude, not benchmarks. Their job in an interview
// is to make an estimate land on the right side of "one box is enough" — real
// figures depend on hardware, payload and configuration, and saying so is part
// of using them well.

export const COMPONENT_DEPTH = {
  "load-balancer": {
    answers: [
      "Layer 4 balances TCP connections without reading them: cheap, fast, protocol-agnostic, but it cannot route by path or header. Layer 7 terminates HTTP, so it can route /api and /static differently, retry idempotent requests and add headers, at the cost of CPU and of seeing payloads. Most web designs want L7 at the edge; an L4 tier in front is common at very high volume.",
      "Drain it: stop sending new requests, let in-flight ones finish within a timeout, then remove it. Without draining, requests in progress are cut and clients see errors — and long-lived connections (WebSockets) need either a longer drain or clients that reconnect cleanly.",
      "DNS points the hostname at the balancer's addresses — often several, or an anycast address announced from many locations. The balancer is itself a redundant pair or a managed fleet, so the name never depends on one machine.",
      "Round-robin is fine when requests cost about the same. When they vary widely — a mix of cheap reads and expensive reports, or long-lived connections — least-connections (or least outstanding requests) stops one server collecting all the slow work while others idle.",
    ],
    numbers: [
      ["< 1 ms", "added latency for a balancer hop inside one data centre"],
      ["~100k+", "connections a single software balancer handles; managed ones scale past that transparently"],
    ],
  },

  "api-gateway": {
    answers: [
      "Usually it validates: checks the signature and expiry of a JWT (or calls the auth service for an opaque token) and rejects bad requests at the door, then forwards the caller's identity in a header. Services still authorise — whether this user may touch this resource is domain logic the gateway cannot know.",
      "Network placement: services sit on a private network that only the gateway can reach, and ideally require the gateway's identity (mutual TLS) too. A rule that is only enforced by convention will be bypassed by the first internal caller in a hurry.",
      "In a shared fast store — typically Redis — keyed by client and window, updated atomically (INCR with expiry, or a Lua script for a token bucket). Purely local counters per instance are an approximation: N instances each allowing the limit means N times the limit.",
    ],
    numbers: [
      ["1–5 ms", "typical overhead a gateway adds per request for auth and routing"],
    ],
  },

  cdn: {
    answers: [
      "Prefer not to: version the URL (app.3f9a1c.js) so a new file is a new key and old copies simply stop being requested. When a fixed URL must change, issue a purge to the CDN, which takes seconds to minutes to reach every edge — and say what users see in between.",
      "Origin load is the miss rate times traffic, so a hit rate falling from 98% to 96% doubles origin load — from 2% to 4%. Size the origin for the miss rate you can tolerate on a bad day (a purge, a new release), not for the happy average.",
      "Only responses that are the same for everyone, or that vary on a small, explicit key (Vary headers). Short TTLs (seconds) on popular public API reads can absorb huge spikes. Anything per-user must be marked private or it can be served to the wrong person — the classic CDN incident.",
    ],
    numbers: [
      ["10–50 ms", "round trip to a nearby edge, versus 100–300 ms to a distant origin"],
      ["95–99%", "hit rate a well-configured static asset CDN achieves"],
    ],
  },

  "rate-limiter": {
    answers: [
      "Token bucket allows bursts up to the bucket size while holding the average rate — good for interactive clients that are quiet then busy. A sliding window (or sliding log) is stricter about any rolling period and is easier to explain on a pricing page. Fixed windows are simplest but let twice the limit through at a window boundary.",
      "Keep the counters in one shared store, updated atomically per key, and accept the round trip. To cut that cost, each instance can take small allowances locally and sync periodically — trading a little accuracy for latency, which is usually fine for abuse protection and not fine for billing.",
      "It depends on what the limiter protects. Protecting your own capacity from abuse: fail open, because blocking all traffic when Redis blips is a self-inflicted outage. Enforcing a paid quota or protecting a fragile downstream: fail closed, or fall back to a conservative local limit.",
    ],
    numbers: [
      ["~0.5 ms", "a Redis increment inside the same data centre — the cost each check pays"],
    ],
  },

  "app-servers": {
    answers: [
      "In a shared store — Redis, or the database for durability — or inside a signed token the client carries. If that store is slow, every request is slow, so it needs its own capacity planning and timeouts; a token avoids the store at the price of harder revocation.",
      "With a graceful shutdown it finishes: the instance stops accepting, drains, then exits. Killed abruptly, the request fails mid-way, which is safe only if the client can retry and the operation is idempotent — the reason writes carry idempotency keys.",
      "Usually far fewer than expected: each instance holds a connection pool, and a database handles a few hundred to a few thousand concurrent connections. Twenty instances × 50 connections is already 1,000. Pooling proxies, caching reads and read replicas are what let the app tier keep growing.",
    ],
    numbers: [
      ["1k–10k req/s", "a single stateless app instance for simple requests, depending heavily on work per request"],
    ],
  },

  "worker-pool": {
    answers: [
      "The job stays on the queue (it was never acknowledged) and becomes visible again after a timeout, so another worker picks it up. That means jobs run at least once, so each must be idempotent — or record progress in steps so a retry resumes rather than repeats.",
      "Separate queues per job type with their own workers, or weighted fair scheduling across them. One shared queue lets a flood of slow video encodes sit in front of the password-reset emails.",
      "Polling a status endpoint is simplest and fine for minutes-long jobs. Push (WebSocket/SSE) suits a user watching a progress bar. A webhook suits another system that cannot poll. Whichever, store the job's status somewhere durable that all three can read.",
    ],
    numbers: [
      ["seconds → hours", "the range of work that belongs here rather than on the request path (anything over ~100 ms that the user need not wait for)"],
    ],
  },

  "relational-db": {
    answers: [
      "The key that most queries already filter by — a user id for user data. It makes any query across many users expensive (a scatter to every shard), so name the queries that need it (admin search, analytics) and route them elsewhere: a search index or a warehouse.",
      "Read committed is the common default and allows non-repeatable reads; repeatable read stops those but can still allow write skew; serializable prevents all of them at a cost in retries and throughput. Name the anomaly the business can tolerate — for money, use serializable or explicit row locks on the rows that matter.",
      "Online: add the column as nullable with no default rewrite (instant in modern Postgres/MySQL), backfill in small batches, then add constraints. For changes that rewrite the table, use an online schema-change tool that copies to a shadow table and swaps. Deploy code that tolerates both shapes first.",
    ],
    numbers: [
      ["~1–10k writes/s", "one well-tuned primary on good hardware, simple rows"],
      ["~10 TB", "where a single relational node starts to be uncomfortable"],
      ["~1 ms", "a primary-key lookup with a warm cache"],
    ],
  },

  "key-value": {
    answers: [
      "You do not, directly. Either maintain a second table keyed by the other attribute (written with the first, accepting they can drift) or stream changes into a search index. If many such queries appear, the access pattern was not key-value after all.",
      "Spread it: replicate the hot value to several keys (key#1…key#N) and read one at random, put a local in-process cache in front, or cache it at the edge. Adding nodes does not help — one key lives on one partition.",
      "Depends on the store and its settings: many are eventually consistent across replicas, so a read right after a write can miss it. If the feature needs read-your-writes, read from the leader, use strongly consistent reads, or route the user to the replica that took the write.",
    ],
    numbers: [
      ["< 1 ms", "single-key get at the median"],
      ["~10k+ ops/s", "per partition; total throughput scales with partitions"],
    ],
  },

  "document-db": {
    answers: [
      "Put together what is read together and bounded in size — a profile with its settings. Give its own collection to anything that grows without bound (comments, events) or is shared by many parents and updated independently.",
      "That is the price of duplication: a background job that walks every affected document, or accept staleness and fix on read. If it happens often, the field should be referenced, not copied.",
      "Hard limits exist (MongoDB: 16 MB), but performance degrades far earlier, since every read and update moves the whole document. Keep documents in the kilobytes; an array that grows forever inside one is the usual mistake.",
    ],
    numbers: [
      ["KBs", "the healthy size of a document"],
      ["16 MB", "MongoDB's hard ceiling per document"],
    ],
  },

  "object-storage": {
    answers: [
      "In a database row keyed by the object's key, holding owner, size, content type and status. Write the object first, then the row (or mark the row 'pending' and confirm after upload); a periodic sweep removes objects with no row and rows whose object never arrived.",
      "Hand the client a pre-signed upload URL (or a multipart upload) scoped to one key and a short expiry. The file goes straight to storage, and your API only sees the small 'upload finished' callback.",
      "Something like {tenant}/{yyyy}/{mm}/{uuid}. Modern stores (S3) scale per prefix automatically, so hot prefixes matter less than they did, but sequential keys under one prefix at very high write rates can still throttle — a random component early in the key spreads load.",
    ],
    numbers: [
      ["11 nines", "S3's designed durability — losing an object is not the realistic risk; deleting it by mistake is"],
      ["~3,500 PUT / 5,500 GET per s", "S3 per prefix before you should spread keys"],
    ],
  },

  cache: {
    answers: [
      "Cache-aside (read through the app, populate on miss, delete on write) is the default: simple, and the cache can be lost. Write-through keeps the cache warm for data read right after it is written. Write-behind buffers writes in the cache for speed, and risks losing them — only for data you can afford to lose.",
      "Every read becomes a database read at once. If the database was sized assuming a 95% hit rate, it now sees twenty times its load and falls over. Plan for it: rate-limit misses, serve stale data, warm the cache before taking traffic, and size the database to survive at least a partial loss.",
      "Ask the product question: a like count can be a minute stale; an account balance cannot. The answer sets the TTL, and for data that must be fresh, invalidate on write rather than waiting for expiry.",
      "Redis brings data structures (sorted sets for leaderboards, counters, streams), persistence options and replication. Memcached is a simpler multi-threaded string cache and scales up on one box well. If all you store is serialised blobs, either works; most designs reach for Redis because of the structures.",
    ],
    numbers: [
      ["~0.1–0.5 ms", "a Redis get inside the data centre"],
      ["~100k ops/s", "one Redis node, single-threaded command execution"],
    ],
  },

  "read-replica": {
    answers: [
      "Possibly the old value, if the replica has not applied the write yet. Fix it where it matters: read the user's own recent writes from the primary for a short window, or wait until the replica has reached the write's log position before reading.",
      "Usually milliseconds, spiking to seconds under heavy writes or long transactions. Decide per read: a feed tolerates seconds; checking whether a username is taken tolerates none. Alert on lag, and stop routing reads to a replica that falls too far behind.",
      "Synchronous: the write waits for a replica, so no acknowledged write is lost on failover — at the cost of write latency and of writes stalling if the replica stalls. Asynchronous: fast writes, but a failover can lose the last moments of acknowledged writes. Many systems use one synchronous replica and the rest asynchronous.",
    ],
    numbers: [
      ["ms–s", "typical replication lag under normal to heavy load"],
    ],
  },

  sharding: {
    answers: [
      "The key in almost every request — a user or tenant id. It makes queries that span keys expensive: global sorts, cross-user joins, 'top N across everyone'. Those go to a secondary system (search index, warehouse) built for them.",
      "It is a hot shard: either one huge tenant or one hot key. Split it further (sub-shard that tenant by a second key), move it to dedicated hardware, or cache its reads. Hash-based sharding spreads ordinary load but cannot split a single hot key.",
      "Add the new shard, copy the moving key range while still serving from the old one, stream the changes made during the copy, then flip routing for that range and stop writes to the old copy. Many shards per node from the start (virtual shards) turn resharding into moving whole shards, which is far easier.",
    ],
    numbers: [
      ["~1–10 TB", "per shard, as a rule of thumb that keeps backups and rebuilds manageable"],
    ],
  },

  "wide-column": {
    answers: [
      "The key you read by — conversation id for messages, user id for a timeline — often with a time bucket (user_id, month) so no partition grows without limit. Keep partitions under roughly a hundred megabytes.",
      "Write another table that is laid out for it, and keep the two in sync from the application or from change data capture. Wide-column stores answer the queries they were modelled for and almost nothing else.",
      "Write and read at QUORUM (W + R > N) and a read sees the latest write; at ONE both are faster and more available, but a read can return stale data. Choose per query: a chat history read at ONE is fine; a unique-username check is not.",
    ],
    numbers: [
      ["~100 MB", "comfortable upper size for one Cassandra partition"],
      ["~10k writes/s", "per node, scaling roughly linearly with nodes"],
    ],
  },

  queue: {
    answers: [
      "Most queues deliver at least once, so it will happen. Make the consumer idempotent: deduplicate on a message id, or make the effect naturally repeatable (set a value rather than increment it).",
      "After a few retries with backoff, move it to a dead-letter queue and alert. A poison message retried forever blocks its partition and burns capacity; parked, it can be inspected, fixed and replayed.",
      "Usually ordering matters per entity — per user, per order — not globally. Partition by that key so each entity's messages are processed in order by one consumer. Global ordering forces a single consumer and caps throughput.",
    ],
    numbers: [
      ["~ms", "end-to-end latency for a message on a healthy queue"],
      ["thousands–100k/s", "messages per second for managed queues; more with partitions"],
    ],
  },

  "pub-sub": {
    answers: [
      "Depends on the system: in fire-and-forget pub/sub it misses everything; with durable subscriptions (or a log underneath) it catches up from where it left off, as long as retention covers the gap. Choose by whether missing an event is acceptable.",
      "Add fields as optional, never remove or repurpose existing ones, and have consumers ignore fields they do not know. A schema registry can enforce compatibility so a breaking change is rejected at publish time.",
      "The producing team: they own the meaning of 'order placed'. Consumers depend on a published contract, versioned like an API — which is exactly what it is.",
    ],
    numbers: [
      ["fan-out", "one publish, N deliveries — cost scales with subscribers, not publishers"],
    ],
  },

  "event-log": {
    answers: [
      "The entity whose events must stay in order — account id, order id. All events for one key land in one partition, in order; there is no ordering across partitions.",
      "It resumes from its last committed offset — provided retention is longer than two days. If retention was shorter, the events are gone and it needs a snapshot to restart from. Set retention from the longest outage you want to survive.",
      "Reset the consumer's offset a week back and make processing idempotent — write results keyed by event id, or rebuild the output in a fresh table and swap it in. Re-reading is easy; double effects are what you have to design away.",
    ],
    numbers: [
      ["~10–100 MB/s", "throughput per Kafka partition, roughly"],
      ["days–forever", "retention, a configuration choice rather than a limit"],
    ],
  },

  "stream-processing": {
    answers: [
      "The window is the period aggregated over (each minute, a sliding five minutes). Late events are handled with watermarks — how long you wait for stragglers — and an allowed-lateness policy: update the window's result, send a correction, or drop and count them.",
      "Processors checkpoint their state and input offsets together, periodically, to durable storage. After a crash they reload the last checkpoint and replay input from those offsets, which is how exactly-once results are possible on at-least-once input.",
      "Event time (when it happened) gives correct answers when events arrive late or out of order — needed for billing or anything per-minute. Processing time (when it arrived) is simpler and fine for operational dashboards where 'roughly now' is enough.",
    ],
    numbers: [
      ["seconds", "typical end-to-end latency, versus hours for batch"],
    ],
  },

  "search-index": {
    answers: [
      "By streaming changes into it — change data capture or events from the application — rather than writing to both in the request. The database stays the source of truth; the index is rebuildable from it.",
      "Seconds, typically: the index refreshes periodically (Elasticsearch defaults to once a second), plus whatever delay the change stream adds. Say so in the product — a just-posted item may not appear in search immediately.",
      "Build a new index alongside the old one from a snapshot plus the change stream, verify it, then switch an alias to point at the new one. Reads never see a half-built index.",
    ],
    numbers: [
      ["~1 s", "default refresh interval before new documents are searchable in Elasticsearch"],
      ["10–50 GB", "a common target size per shard"],
    ],
  },

  "consistent-hashing": {
    answers: [
      "With mod N, changing N remaps almost every key — adding one cache node empties nearly the whole cache. Consistent hashing moves only about 1/N of the keys when a node joins or leaves.",
      "It still lands on one node; consistent hashing spreads keys, not load per key. Replicate the hot key to several nodes, or add a local cache in front of it.",
      "Through a membership service (ZooKeeper, etcd, or a gossip protocol) that publishes the node list; clients rebuild the same ring from it. Virtual nodes — many points per server — keep the load even as membership changes.",
    ],
    numbers: [
      ["~1/N", "share of keys that move when one of N nodes joins or leaves"],
      ["100–200", "virtual nodes per server, a common setting for even spread"],
    ],
  },

  "distributed-lock": {
    answers: [
      "Two holders can act at once — the first resumes after a pause, not knowing it lost the lock. Use fencing tokens: an increasing number issued with each grant, which the protected resource checks so a stale holder's writes are rejected. Renew the lease while working, too.",
      "Either nobody can take the lock (the protected work stops — fail safe) or, if the code ignores the failure, everyone proceeds unsafely. Decide which the work can tolerate, and make the lock store itself replicated (etcd, ZooKeeper) rather than a single node.",
      "Often, yes, and it is better: if doing the work twice is harmless — conditional writes, unique constraints, idempotency keys — no lock is needed, and nothing can expire at the wrong moment.",
    ],
    numbers: [
      ["~ms", "to acquire a lock in a replicated store in the same region"],
    ],
  },

  idempotency: {
    answers: [
      "Exactly what the first one returned — the stored status code and body — without doing the work again. If the first is still in progress, it either waits or returns 409 'in progress' for the client to retry.",
      "Long enough to cover every retry a client might reasonably make — commonly 24 hours to a few days. After that a reused key is treated as new, which is why clients generate a fresh key per operation, not per retry.",
      "A unique constraint on the key makes one insert win; the other sees the conflict and waits for, then returns, the winner's stored result. Also store a hash of the request body: same key with a different body is an error, not a replay.",
    ],
    numbers: [
      ["24 h", "a common key retention window (Stripe keeps keys about this long)"],
    ],
  },

  serverless: {
    answers: [
      "Tens of milliseconds for small functions in fast runtimes, up to seconds for large ones or heavy runtimes — paid by whichever request arrives when no warm instance exists. Fine for background work; a problem on a latency-sensitive path unless instances are kept warm (provisioned).",
      "Each instance opens its own connection, so a spike of hundreds of instances exhausts the database. Put a connection pooler or a managed proxy between them, or use a database with an HTTP API built for this.",
      "When traffic is steady and high — busy most of the time — a reserved server is cheaper per request. Serverless wins on spiky, low or unpredictable traffic, where idle servers would otherwise be paid for.",
    ],
    numbers: [
      ["~10 ms – few s", "cold start range, depending on runtime and package size"],
      ["15 min", "AWS Lambda's maximum run time per invocation"],
    ],
  },

  "load-shedding": {
    answers: [
      "The least valuable work: background and best-effort requests before interactive ones, anonymous before signed-in, reads that can be served stale before writes. Mark priority on requests at the edge so the decision is cheap under load.",
      "Tell them: return 429 or 503 with Retry-After, and have clients back off exponentially with jitter. Cap retries, and use a retry budget so retries can never be more than a small fraction of traffic.",
      "Watch the leading signals — queue depth, concurrency in flight, latency percentiles rising — rather than CPU alone, and shed when they cross a threshold, before timeouts begin. Latency climbing at steady traffic is the earliest sign.",
    ],
    numbers: [
      ["p99", "the latency percentile that rises first as a service saturates"],
    ],
  },

  "service-mesh": {
    answers: [
      "For a few services in one language, often yes — a shared client library gives retries, timeouts and tracing at no extra hop. A mesh earns its keep with many services in many languages, and for uniform mutual TLS and traffic policy that teams cannot skip.",
      "Traffic through that pod fails even though the service itself is fine — the sidecar is now part of the request path. It needs health checks and resource limits like the service, and the mesh's control plane must not be a single point of failure.",
      "Retry only idempotent calls, only a small number of times, with backoff, and at one layer — not in the client, the mesh and the server at once, which multiplies traffic. Retry budgets and circuit breakers stop a struggling service being hammered harder.",
    ],
    numbers: [
      ["~1 ms", "latency a sidecar proxy adds per hop, roughly"],
    ],
  },

  "batch-pipeline": {
    answers: [
      "Make each step write its output to a new location and only publish (swap a pointer, or rename) when it completes, so a failed run leaves the previous result intact. Re-running is then safe: steps are idempotent and the run starts from its last finished step.",
      "Ask what decision uses it. A daily report needs daily; fraud detection does not belong in batch at all. Freshness is cost — moving from daily to hourly to streaming multiplies the work and complexity.",
      "Re-run the corrected job over partitioned historical inputs, date by date, writing to a new output and swapping it in. Keeping raw inputs immutable and partitioned by date is what makes a backfill possible at all.",
    ],
    numbers: [
      ["hours", "the typical freshness of batch output"],
    ],
  },

  websockets: {
    answers: [
      "A routing layer knows which server holds each user's connection — a registry in Redis — or every server subscribes to a pub/sub channel per user. The sender's server publishes to that user, and only the server holding the connection delivers it.",
      "They are stored (an inbox or the message log) and the client asks for everything after its last-seen id when it reconnects. The socket is a delivery fast path; durability lives elsewhere.",
      "Tens of thousands to a few hundred thousand idle connections per node, limited by memory per connection and file descriptors rather than CPU. Busy connections reduce that sharply. Plan nodes from peak concurrent users, not requests per second.",
    ],
    numbers: [
      ["~50k–500k", "mostly idle connections one tuned node can hold"],
      ["~10–50 KB", "memory per connection, the usual limit"],
    ],
  },

  sse: {
    answers: [
      "The data only flows server to client, so SSE's plain HTTP, automatic reconnection and Last-Event-ID resume cover everything needed with less machinery. WebSockets pay for a second direction that would go unused.",
      "The browser reconnects automatically after the server-suggested retry delay, sending the Last-Event-ID header; the server resumes from the next event, or sends a snapshot if the gap is too old.",
      "Disable response buffering for the stream route at every proxy (nginx: X-Accel-Buffering: no), set Cache-Control: no-cache, and send a comment line every ~15 seconds so idle connections are not closed as dead.",
    ],
    numbers: [
      ["6", "HTTP/1.1 connections per domain a browser allows — SSE over HTTP/2 avoids the limit"],
    ],
  },

  cdc: {
    answers: [
      "Publishing from the application is a dual write — the database commit and the publish can disagree after a crash. CDC reads the database's own log, so every committed change is published, in commit order, and nothing uncommitted is. (An outbox table is the application-level alternative with the same guarantee.)",
      "Take a consistent snapshot of the existing table, recording the log position it corresponds to, load the snapshot, then stream changes from that position. Most CDC tools (Debezium) do this as an initial snapshot step.",
      "Consumers that read the old column name break, because CDC publishes the table's physical shape. Treat the change stream as a public contract: add before removing, publish a stable logical event shape, or put a translation step in between.",
    ],
    numbers: [
      ["~ms–s", "lag from commit to published change on a healthy pipeline"],
    ],
  },

  metrics: {
    answers: [
      "Symptoms users feel, measured against an objective: error rate above, say, 1% for five minutes, or p99 latency above the target. Page on fast, large burns of the error budget; send slower burns and resource warnings to a ticket, not a phone.",
      "p99 for anything interactive — the slowest 1% of requests is where users notice, and at high fan-out most page loads include one slow call. p50 hides it. Track p50 too, for typical cost.",
      "You usually cannot: putting customer id on a metric creates a series per customer. Tag metrics by bounded dimensions (region, endpoint, plan) to narrow it down, then pivot to logs or traces, which carry the customer id.",
    ],
    numbers: [
      ["1 min", "a common alert evaluation interval"],
      ["99.9%", "an availability target that allows ~43 minutes of downtime a month"],
    ],
  },

  tracing: {
    answers: [
      "The trace context (trace id and parent span id) is put in the message's headers by the producer and extracted by the consumer, which starts a span linked to it. Without that the trace ends at the queue.",
      "Tail-based sampling: buffer spans until the trace completes, then keep it if it errored or was slow, plus a small share of the rest. Head-based sampling decides at the start and cannot know which traces will turn out interesting.",
      "Write the trace id into every log line (structured logging makes it a field), and link from the trace view to a log search on that id.",
    ],
    numbers: [
      ["1–10%", "a typical head-sampling rate for high-traffic services"],
    ],
  },

  "structured-logs": {
    answers: [
      "Every line carries a request id (or trace id) as a field, set at the edge and passed through every call; searching on that one field returns the whole request's story.",
      "Logging fields through an allow-list or a redaction layer — never logging whole request bodies or headers — plus scanning for secret patterns at ingestion. Once a password is in a log it is in every copy and backup of that log.",
      "Driven by use and law: hot and searchable for days to a couple of weeks (debugging), archived cheaply for longer if audit or regulation requires it, and deleted after. Logs containing personal data have a retention limit, not just a cost.",
    ],
    numbers: [
      ["~1 KB", "a typical structured log line"],
      ["7–30 days", "common hot retention before archiving"],
    ],
  },

  "time-series-db": {
    answers: [
      "Cardinality is the number of distinct series — every combination of tag values. If it doubles, memory and index size double, and an accidental high-cardinality tag (user id) can multiply it a thousandfold. Limit it at ingestion.",
      "Raw resolution for days to weeks — the window you debug in — then downsampled rollups (one-minute, then one-hour) for months or years.",
      "Usually by joining in the application or exporting both to a warehouse. Time-series databases are not built for relational joins; put the business dimensions you need as (bounded) tags, or correlate by time in a dashboard.",
    ],
    numbers: [
      ["~1–2 bytes/sample", "after compression in modern time-series stores"],
      ["millions of samples/s", "ingestion per cluster"],
    ],
  },

  "graph-db": {
    answers: [
      "For one or two hops, often yes: an indexed adjacency table and a join, or a precomputed list in a key-value store, answers 'friends' and 'friends of friends' well. A graph database earns its place when queries go deeper or vary in shape — paths, multi-hop traversals the schema cannot anticipate.",
      "A supernode: any traversal that touches it explodes. Skip or sample very high-degree nodes, cap fan-out per hop, or treat them as a special case — and weight paths through them down, since a link to a celebrity says little.",
      "From the system of record, by streaming changes (CDC or events) into the graph, rather than writing to both. If the graph is used only for offline computation, a periodic bulk export is enough.",
    ],
    numbers: [
      ["~3", "hops after which a traversal touches most of a social graph — keep queries shallow"],
    ],
  },
};
