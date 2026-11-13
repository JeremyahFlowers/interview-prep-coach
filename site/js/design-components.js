// The answer bank: the design decisions an interview actually turns on.
//
// Where this fits: the system-design half of the app rests on this the way the
// coding half rests on PATTERNS. A coding problem is tagged with the pattern it
// wants; a design problem is tagged with the components its reference answer
// reaches for. Mastery, search, drills and the practice ladder all work the
// same way on both sides because both sides have an atomic unit.
//
// The premise, and the reason this is a library rather than prose per problem:
// there is a finite number of these decisions, and each one has tradeoffs that
// are well understood and barely change. "Why Redis here" has the same answer
// in a rate limiter as in a news feed. Writing it once and referencing it means
// the tenth problem teaches you less new material than the first, which is
// exactly what learning a field is supposed to feel like.
//
// Every entry answers the six questions an interviewer asks after you name a
// component, in the order they ask them:
//
//   useWhen      why this, here
//   tradeoffs    what it buys and what it costs
//   alternatives what else you considered, and when each wins instead
//   limits       what it does badly, and how it fails
//   planFor      what choosing it forces you to design next
//   followUps    what they ask once you have said it
//
// `hook` and `concept` follow the same convention as topics-content.js: a
// concrete image before any jargon, then the same idea stated precisely.

export const CATEGORIES = {
  edge: "Edge & traffic",
  compute: "Compute",
  storage: "Storage",
  scaling: "Scaling data",
  caching: "Caching",
  messaging: "Messaging",
  search: "Search",
  coordination: "Coordination",
  delivery: "Delivery",
  observability: "Observability",
};

export const COMPONENTS = [
  {
    id: "load-balancer",
    name: "Load balancer",
    category: "edge",
    hook: "A host at the door of a restaurant, sending each new party to whichever table is free.",
    concept:
      "A layer that spreads incoming requests across a pool of interchangeable servers, removes unhealthy ones from rotation, and gives clients one stable address regardless of how many machines are behind it.",
    useWhen: [
      "more than one server serves the same traffic",
      "you need to deploy or lose a machine without dropping requests",
      "the first box in almost any diagram that says 'scale horizontally'",
    ],
    tradeoffs: {
      gains: [
        "Horizontal scale: capacity becomes a number you raise, not a rewrite.",
        "Health checks turn a dead server into a routing decision instead of an outage.",
        "A natural place for TLS termination, so app servers stop doing crypto.",
      ],
      costs: [
        "One more hop of latency, and one more thing that can be misconfigured.",
        "It is a single point of failure unless it is itself redundant.",
        "Layer 7 routing costs more CPU than layer 4 and sees your payloads.",
      ],
    },
    alternatives: [
      { id: "api-gateway", insteadWhen: "you also need auth, rate limiting and per-route policy, not just spreading load" },
      { id: "cdn", insteadWhen: "the traffic is static assets that never needed to reach your servers at all" },
    ],
    limits: [
      "Cannot fix a slow backend — it distributes load, it does not create capacity.",
      "Sticky sessions undo most of its value and quietly make servers stateful.",
      "A health check that only pings a port will happily route to a process that is up and broken.",
    ],
    planFor: [
      "Sessions must live outside the app server, or a user's next request lands somewhere that has never heard of them.",
      "Deploys become rolling, so two versions of your code run at once and must tolerate each other.",
      "Client IP arrives in a header now, which matters for rate limiting and for logs.",
    ],
    followUps: [
      "Layer 4 or layer 7, and why?",
      "What happens to in-flight requests when you remove a server?",
      "How does a client find the load balancer itself?",
      "Round-robin or least-connections here — does it matter for this workload?",
    ],
  },

  {
    id: "api-gateway",
    name: "API gateway",
    category: "edge",
    hook: "A receptionist who checks your appointment, your ID, and how often you've been here today — before you get near anyone who can help you.",
    concept:
      "A single entry point that authenticates, authorises, rate limits, routes and often reshapes requests before they reach internal services, so every service does not implement those concerns itself.",
    useWhen: [
      "several services are exposed to the outside world",
      "auth, quotas or API keys are cross-cutting concerns",
      "clients are third parties rather than your own front end",
    ],
    tradeoffs: {
      gains: [
        "One place to enforce auth and quotas, instead of one per service and one of them wrong.",
        "Internal service boundaries can change without breaking public URLs.",
        "A natural seam for request logging and per-client metering.",
      ],
      costs: [
        "A busy gateway becomes a bottleneck and a deploy chokepoint for every team.",
        "Business logic creeps into it, and then it is a distributed monolith's front door.",
        "Another hop, and another place a request can die with an unhelpful message.",
      ],
    },
    alternatives: [
      { id: "load-balancer", insteadWhen: "there is one service and no policy to enforce — a gateway is overkill" },
      { id: "service-mesh", insteadWhen: "the concern is service-to-service traffic inside the cluster rather than traffic from outside" },
    ],
    limits: [
      "Cannot enforce anything about traffic that does not pass through it, which includes anything internal.",
      "Per-request policy lookups make it only as available as whatever store holds them.",
      "Response aggregation across services turns one slow dependency into one slow API.",
    ],
    planFor: [
      "Where auth tokens are validated — at the gateway, downstream, or both, and what downstream trusts.",
      "How a service is reached during an incident when the gateway is the thing that is broken.",
      "Versioning, because the gateway is now the contract clients depend on.",
    ],
    followUps: [
      "Does the gateway validate the token or just pass it through?",
      "What stops a client bypassing it and calling a service directly?",
      "Where does rate-limit state live, given there are several gateway instances?",
    ],
  },

  {
    id: "cdn",
    name: "CDN",
    category: "edge",
    hook: "Copies of the same book in every local library, so nobody has to travel to the capital to read it.",
    concept:
      "A globally distributed cache of your static content, served from a point of presence near the user, so bytes travel tens of milliseconds instead of hundreds and your origin never sees most of the traffic.",
    useWhen: [
      "images, video, JS, CSS — anything the same for every user",
      "users are geographically spread",
      "origin bandwidth or egress cost is a real constraint",
    ],
    tradeoffs: {
      gains: [
        "Latency falls to the speed of light to the nearest city rather than to your region.",
        "Origin load drops by whatever your hit rate is, which for static assets is most of it.",
        "Absorbs traffic spikes and a good deal of volumetric attack.",
      ],
      costs: [
        "Cache invalidation becomes a distributed problem with no clean answer.",
        "Stale content is served confidently and looks like a bug in your app.",
        "Per-GB cost, and a vendor in the path of every page load.",
      ],
    },
    alternatives: [
      { id: "object-storage", insteadWhen: "the content is large and rarely read, where edge caching buys little" },
      { id: "cache", insteadWhen: "the thing being cached is per-user or changes per request — an edge cache cannot help" },
    ],
    limits: [
      "Personalised responses cache badly or not at all without splitting the cache key per user.",
      "A short TTL gives freshness and gives back the origin load you were avoiding.",
      "Purges are eventually consistent; 'we invalidated it' and 'nobody is serving it' are different moments.",
    ],
    planFor: [
      "Content-addressed asset URLs, so a new version is a new URL and invalidation never has to work.",
      "What the cache key is: path alone, or path plus device, plus language, plus auth state.",
      "What users see while the origin is down and the edge has a stale copy.",
    ],
    followUps: [
      "How do you invalidate a file that is already cached at every edge?",
      "What is your cache hit rate, and what happens to origin load if it halves?",
      "Would you cache API responses here too? What changes?",
    ],
  },

  {
    id: "rate-limiter",
    name: "Rate limiter",
    category: "edge",
    hook: "A turnstile that only lets so many people through per minute, however hard the crowd pushes.",
    concept:
      "A counter per client, per window, checked before work is done, that rejects or delays requests above an agreed rate — protecting capacity and making one customer's bad day not everybody's.",
    useWhen: [
      "any public API",
      "an expensive endpoint that a loop can trivially overwhelm",
      "fairness between tenants matters",
    ],
    tradeoffs: {
      gains: [
        "Turns an overload into a clear 429 rather than a slow cascade into failure.",
        "Bounds the cost of abuse and of somebody's runaway retry loop.",
        "Makes capacity planning possible, because demand now has a ceiling.",
      ],
      costs: [
        "State per client per window, read and written on every single request.",
        "Distributed counters are either approximate or slow — you pick.",
        "Legitimate bursts get punished unless the algorithm allows for them.",
      ],
    },
    alternatives: [
      { id: "queue", insteadWhen: "the work can be delayed rather than refused, which is friendlier when it fits" },
      { id: "load-shedding", insteadWhen: "you need to protect the system as a whole rather than be fair between clients" },
    ],
    limits: [
      "A fixed window lets through double the limit across a boundary; sliding windows cost more to compute.",
      "Per-instance counters mean the real limit is your limit times the number of instances.",
      "Identifying the client is the hard part — IPs are shared, and keys get leaked.",
    ],
    planFor: [
      "Where the counter lives, and what happens to requests when that store is unreachable.",
      "Telling clients the limit and the reset time, or they will retry immediately and make it worse.",
      "A way to raise a specific customer's limit without a deploy.",
    ],
    followUps: [
      "Token bucket or sliding window, and why for this traffic?",
      "How do you keep the count consistent across ten gateway instances?",
      "Fail open or fail closed when the counter store is down?",
    ],
  },

  {
    id: "app-servers",
    name: "Stateless app servers",
    category: "compute",
    hook: "Interchangeable staff at a counter: any of them can serve you, because none of them is the only one who knows your order.",
    concept:
      "Application instances that hold no request-spanning state locally, so any instance can serve any request and the pool can be grown, shrunk or replaced without coordination.",
    useWhen: [
      "essentially always for the request-serving tier",
      "you want horizontal scale or zero-downtime deploys",
    ],
    tradeoffs: {
      gains: [
        "Scaling becomes arithmetic instead of architecture.",
        "A crashed instance is a routing change, not an incident.",
        "Deploys, autoscaling and spot instances all become safe.",
      ],
      costs: [
        "Every piece of state moves somewhere else, and that somewhere is now hot.",
        "Cross-request work — sessions, uploads, in-memory caches — needs a real home.",
        "More network hops for things that used to be a local variable.",
      ],
    },
    alternatives: [
      { id: "serverless", insteadWhen: "traffic is spiky or occasional and you would rather not run idle capacity" },
      { id: "worker-pool", insteadWhen: "the work is long-running and does not belong in a request at all" },
    ],
    limits: [
      "Statelessness is a property you maintain, not one you declare — an in-memory cache is state.",
      "Cold starts and connection pools bite when instances churn.",
      "Long-lived connections (websockets) are stateful by nature and need separate thinking.",
    ],
    planFor: [
      "Session storage outside the process, and a token scheme that survives a server disappearing.",
      "Database connection limits, since every new instance opens its own pool.",
      "Graceful shutdown, so a terminating instance finishes what it started.",
    ],
    followUps: [
      "Where do sessions live, and what breaks if that store is slow?",
      "What happens to an in-flight request when the instance is killed?",
      "How many instances before the database becomes the bottleneck?",
    ],
  },

  {
    id: "worker-pool",
    name: "Background workers",
    category: "compute",
    hook: "A back room where the slow jobs get done, so the person at the counter can keep serving the queue.",
    concept:
      "A pool of processes that consume work from a queue and do it outside the request path — the pairing that turns a slow synchronous API into a fast one that promises to finish later.",
    useWhen: [
      "the work is slow, bursty, or allowed to fail and be retried",
      "thumbnails, emails, exports, indexing, fan-out writes",
      "a request would otherwise block on something it does not need to wait for",
    ],
    tradeoffs: {
      gains: [
        "Request latency stops depending on how long the work takes.",
        "Retries become natural, and a failure stops being a user-visible error.",
        "Worker capacity scales separately from web capacity, which is usually what you want.",
      ],
      costs: [
        "The user's mental model is now eventual: 'done' and 'accepted' are different states you must show.",
        "Two systems to deploy, monitor and reason about instead of one.",
        "Failure moves somewhere nobody is looking unless you make it visible.",
      ],
    },
    alternatives: [
      { id: "stream-processing", insteadWhen: "the work is a continuous flow rather than discrete jobs" },
      { id: "serverless", insteadWhen: "job volume is low and spiky enough that a standing pool is waste" },
    ],
    limits: [
      "At-least-once delivery means a job can run twice; your handler must not mind.",
      "A poison message can wedge a worker forever without a dead-letter path.",
      "Queue depth is a lagging indicator — by the time it is deep, users noticed.",
    ],
    planFor: [
      "Idempotent handlers, because the same job will be delivered twice eventually.",
      "A dead-letter queue and somebody who looks at it.",
      "How the user learns the work finished, and what they see meanwhile.",
    ],
    followUps: [
      "What happens if a worker dies halfway through a job?",
      "How do you stop one slow job type starving the others?",
      "How does the client know it is done — polling, push, or webhook?",
    ],
  },

  {
    id: "relational-db",
    name: "Relational database",
    category: "storage",
    hook: "A filing system where the rules about what may be filed are enforced by the cabinet itself.",
    concept:
      "Tables with a declared schema, foreign keys and ACID transactions — the default store for data whose shape you know and whose correctness you cannot negotiate.",
    useWhen: [
      "the data is relational and the relationships matter",
      "you need transactions across more than one row",
      "you will query it in ways you have not thought of yet",
    ],
    tradeoffs: {
      gains: [
        "Transactions make whole classes of bug impossible rather than unlikely.",
        "Ad-hoc queries are free — you do not have to know the access pattern up front.",
        "Constraints keep bad data out at the door rather than in a code review.",
      ],
      costs: [
        "Scaling writes past one machine is genuinely hard and usually means sharding.",
        "Schema changes on a large hot table are an operation, not a commit.",
        "Joins across huge tables are where latency goes to hide.",
      ],
    },
    alternatives: [
      { id: "key-value", insteadWhen: "access is always by a single key and the value is opaque" },
      { id: "document-db", insteadWhen: "documents are read and written whole and the shape varies" },
      { id: "wide-column", insteadWhen: "write volume is enormous and queries are known in advance" },
    ],
    limits: [
      "One primary takes all the writes until you shard, and then transactions get complicated.",
      "Connection counts are a real ceiling — a few hundred, not a few thousand.",
      "An unindexed query on a big table is a full scan and a pager at 3am.",
    ],
    planFor: [
      "Read replicas before you need them, and the replication lag they introduce.",
      "Which column you would shard on, long before you have to.",
      "Online schema migration, because the table will be too big to lock.",
    ],
    followUps: [
      "What is your shard key, and what query does it make expensive?",
      "Which isolation level, and what anomaly are you accepting?",
      "How do you add a column to a billion-row table without downtime?",
    ],
  },

  {
    id: "key-value",
    name: "Key-value store",
    category: "storage",
    hook: "A cloakroom: you hand over a ticket, you get back exactly what the ticket points at, and the attendant never asks what is in the bag.",
    concept:
      "A store that maps a key to an opaque value with O(1) access and near-linear horizontal scale, giving up joins, secondary queries and usually transactions in exchange.",
    useWhen: [
      "every access is by a single known key",
      "the value is read and written whole",
      "scale and predictable latency matter more than query flexibility",
    ],
    tradeoffs: {
      gains: [
        "Scales by adding nodes, more or less indefinitely.",
        "Latency is flat and predictable because there is nothing clever happening.",
        "Simple enough that its failure modes are simple.",
      ],
      costs: [
        "No querying by anything except the key — a second access pattern means a second copy.",
        "Application code owns consistency, because the store will not enforce it.",
        "Denormalised data drifts, and nothing tells you when it has.",
      ],
    },
    alternatives: [
      { id: "relational-db", insteadWhen: "you need to query by more than one thing, or need transactions" },
      { id: "cache", insteadWhen: "the data has an authoritative home elsewhere and this is just a fast copy" },
    ],
    limits: [
      "Large values make hot keys and uneven shards.",
      "Range scans are either unsupported or a full-cluster operation.",
      "'Eventually consistent' is a real thing your users will notice at the wrong moment.",
    ],
    planFor: [
      "A key naming scheme you can still reason about in a year.",
      "Every secondary access pattern as a separate written copy, and how those stay in step.",
      "What a read returns immediately after a write, and whether your product can live with it.",
    ],
    followUps: [
      "How would you query this by something other than the key?",
      "What is your hot key strategy?",
      "Is a read-after-write guaranteed here? Does the feature need it to be?",
    ],
  },

  {
    id: "document-db",
    name: "Document store",
    category: "storage",
    hook: "A drawer of folders: each folder holds everything about one thing, and no two folders have to be arranged the same way.",
    concept:
      "Stores semi-structured documents keyed by id, with secondary indexes and flexible per-document shape — a middle ground between the rigidity of tables and the bluntness of key-value.",
    useWhen: [
      "the entity is read and written as a whole",
      "the shape varies by record or changes often",
      "you want some query flexibility without committing to a schema",
    ],
    tradeoffs: {
      gains: [
        "No migration to add a field, which matters when the product is still moving.",
        "One read returns the whole object — no joins to assemble it.",
        "Sharding is built in and usually less painful than bolting it onto SQL.",
      ],
      costs: [
        "Nothing stops two documents disagreeing about what a field means.",
        "Data that is genuinely relational becomes duplicated, and duplicates diverge.",
        "Cross-document transactions are limited or expensive.",
      ],
    },
    alternatives: [
      { id: "relational-db", insteadWhen: "the relationships are the point and you need to join on them" },
      { id: "key-value", insteadWhen: "you never query by anything but the id" },
    ],
    limits: [
      "Unbounded arrays inside a document are a classic way to build a time bomb.",
      "Secondary indexes cost writes and are often eventually consistent.",
      "Aggregations across many documents are slower than the SQL equivalent.",
    ],
    planFor: [
      "Document size limits, and what happens to the record that outgrows one.",
      "A schema-in-the-application discipline, since the store will not enforce one.",
      "Which fields get indexed, decided by the queries you actually run.",
    ],
    followUps: [
      "What goes in the document and what gets its own collection?",
      "How do you update a field that is duplicated across a million documents?",
      "What is the largest this document can get?",
    ],
  },

  {
    id: "object-storage",
    name: "Object storage",
    category: "storage",
    hook: "A warehouse for crates. Cheap, effectively endless, and you fetch a whole crate or none of it.",
    concept:
      "Durable, cheap, near-infinite storage for immutable blobs addressed by key — images, video, backups, logs — with HTTP access and no notion of partial update.",
    useWhen: [
      "files, media, backups, anything large and whole",
      "durability matters more than latency",
      "the data would be absurd to put in a database",
    ],
    tradeoffs: {
      gains: [
        "Effectively unlimited capacity at a cost per GB nothing else matches.",
        "Extremely high durability without you doing anything.",
        "Pairs naturally with a CDN and with presigned direct uploads.",
      ],
      costs: [
        "Latency is tens of milliseconds, not sub-millisecond.",
        "No partial writes: changing one byte means rewriting the object.",
        "Listing and per-request costs are easy to forget until the bill arrives.",
      ],
    },
    alternatives: [
      { id: "cdn", insteadWhen: "the same objects are read repeatedly by many users — put one in front of this" },
      { id: "relational-db", insteadWhen: "the thing is small, structured and queried, not fetched whole" },
    ],
    limits: [
      "Eventual consistency on overwrite in some systems — a re-read can be stale.",
      "No transactions across objects, so metadata and blob can disagree.",
      "Hot prefixes throttle, which surprises people who key by timestamp.",
    ],
    planFor: [
      "Metadata in a real database, with the object key as a pointer.",
      "Presigned URLs, so uploads and downloads never pass through your servers.",
      "Lifecycle rules, or you will pay forever for data nobody reads.",
    ],
    followUps: [
      "Where does the metadata live, and how do the two stay in step?",
      "How does a client upload a 2GB file without going through your API?",
      "What is your key scheme, and does it create a hot prefix?",
    ],
  },

  {
    id: "cache",
    name: "In-memory cache",
    category: "caching",
    hook: "A note stuck to your monitor with the answer on it, so you stop walking to the filing cabinet for the same thing.",
    concept:
      "A fast in-memory store — Redis or Memcached — holding a copy of data whose authoritative home is elsewhere, trading freshness for a hundredfold cut in read latency and backend load.",
    useWhen: [
      "the same data is read far more often than it changes",
      "a database read is the thing making the endpoint slow",
      "you need a shared home for sessions, counters, locks or rate limits",
    ],
    tradeoffs: {
      gains: [
        "Sub-millisecond reads, and a database that stops being the bottleneck.",
        "Absorbs read spikes that would otherwise take the primary down.",
        "Useful for far more than caching: counters, leaderboards, locks, queues.",
      ],
      costs: [
        "Two copies of the truth, and they will disagree.",
        "A cache that goes cold hands its entire load to the database at once.",
        "Memory is expensive per byte, so it holds a working set, not the dataset.",
      ],
    },
    alternatives: [
      { id: "cdn", insteadWhen: "the content is static and the same for everyone — cache it nearer the user" },
      { id: "read-replica", insteadWhen: "you need full query flexibility on fresh-ish data rather than fast lookups" },
      { id: "key-value", insteadWhen: "this is the authoritative copy and must not be evicted" },
    ],
    limits: [
      "Invalidation is genuinely hard, and TTLs are how most teams decide to stop thinking about it.",
      "A hot key can exceed what one node can serve, however many nodes you have.",
      "Restarting an empty cache is a self-inflicted thundering herd.",
    ],
    planFor: [
      "A stated invalidation strategy: TTL, write-through, or explicit delete on write.",
      "What happens on a cold start or a cache outage — can the database survive 100% of reads?",
      "Stampede protection, so one expired hot key does not become a thousand identical queries.",
    ],
    followUps: [
      "Cache-aside, write-through or write-behind, and why?",
      "What happens when the cache goes down entirely?",
      "How stale can this data be before a user notices or cares?",
      "Why Redis rather than Memcached here?",
    ],
    depth: [
      { level: "fundamentals", kind: "article", label: "Caching strategies and their failure modes",
        url: "https://aws.amazon.com/builders-library/caching-challenges-and-strategies/" },
      { level: "deeper", kind: "docs", label: "Redis: eviction policies",
        url: "https://redis.io/docs/latest/develop/reference/eviction/" },
      { level: "deeper", kind: "docs", label: "Redis persistence — what survives a restart",
        url: "https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/" },
    ],
  }
,
  {
    id: "read-replica",
    name: "Read replicas",
    category: "scaling",
    hook: "Photocopies of the ledger for everyone who only needs to look at it, so the original stays free for the people writing in it.",
    concept:
      "Copies of the primary database that accept reads and not writes, letting read capacity grow without touching the write path — at the cost of being a little behind.",
    useWhen: ["reads outnumber writes, which is most systems", "the primary is CPU-bound on reads", "analytics queries are hurting production"],
    tradeoffs: {
      gains: ["Read capacity becomes a number you raise.", "Heavy or risky queries move off the primary.", "A replica is most of a disaster recovery plan already."],
      costs: ["Replication lag is real and visible at exactly the wrong moment.", "Write capacity is unchanged — this solves half the problem.", "More machines to run, patch and pay for."],
    },
    alternatives: [
      { id: "cache", insteadWhen: "the same few queries dominate and can tolerate a TTL" },
      { id: "sharding", insteadWhen: "writes are the bottleneck, which replicas do nothing for" },
    ],
    limits: [
      "Read-after-write breaks: a user updates their profile and sees the old one.",
      "Lag grows under write load, which is exactly when you needed the replica.",
      "Failover promotes a replica that may be missing the last few transactions.",
    ],
    planFor: [
      "Which reads must go to the primary — usually anything right after a write by the same user.",
      "A lag metric and a threshold at which you stop serving from a replica.",
      "What a failover loses, and whether the product can accept it.",
    ],
    followUps: ["What does a user see right after they write, if the read goes to a replica?", "How much lag is acceptable here?", "Synchronous or asynchronous replication, and what does each cost you?"],
  },

  {
    id: "sharding",
    name: "Sharding",
    category: "scaling",
    hook: "Splitting one enormous filing room into many rooms, each holding a known slice — and remembering the rule for which room anything is in.",
    concept:
      "Partitioning data horizontally across independent databases by a shard key, so write throughput and dataset size scale past what one machine can hold.",
    useWhen: ["writes exceed one primary", "the dataset is too big for one machine", "you can name a key that almost every query already carries"],
    tradeoffs: {
      gains: ["Write throughput and storage both scale roughly linearly.", "Blast radius shrinks: one shard down is not everything down.", "Per-shard data can live in the region its users are in."],
      costs: ["Cross-shard queries and transactions become hard or impossible.", "The shard key is close to irreversible once there is data.", "Rebalancing is an operational project, not a config change."],
    },
    alternatives: [
      { id: "read-replica", insteadWhen: "reads are the problem — this is far simpler" },
      { id: "wide-column", insteadWhen: "you would rather adopt a store that shards natively than shard one yourself" },
    ],
    limits: [
      "A badly chosen key gives you a hot shard and no way back.",
      "Joins across shards move into the application, badly.",
      "Auto-increment ids stop working; you need a distributed id scheme.",
    ],
    planFor: [
      "The shard key, chosen from the query you run most, not the one that is prettiest.",
      "How a shard is split when it grows too big, while serving traffic.",
      "Queries that cannot carry the key — scatter-gather, or a second index shard.",
    ],
    followUps: ["What is the shard key and what query does it make expensive?", "What happens when one shard gets ten times the traffic?", "How do you resplit a shard without downtime?"],
  },

  {
    id: "wide-column",
    name: "Wide-column store",
    category: "storage",
    hook: "A ledger designed for writing, where you decide the shape of every page before the first entry and never reorganise.",
    concept:
      "A distributed store (Cassandra, HBase, DynamoDB) partitioned by key with sorted clustering columns — enormous write throughput and predictable reads, provided you knew the queries before you designed the table.",
    useWhen: ["write volume is very large", "queries are known and fixed", "time-series, feeds, event history, messages"],
    tradeoffs: {
      gains: ["Writes scale nearly linearly with nodes.", "No single primary, so no single write bottleneck.", "Multi-region replication is a first-class feature."],
      costs: ["You model per query — a new access pattern is a new table.", "No joins, limited aggregation, weak or no transactions.", "Tuning consistency per query is power you now have to use correctly."],
    },
    alternatives: [
      { id: "relational-db", insteadWhen: "the query set is unknown or the correctness rules are strict" },
      { id: "key-value", insteadWhen: "you never need range scans within a partition" },
    ],
    limits: [
      "An unbounded partition becomes a hot, slow, unsplittable row.",
      "Deletes are tombstones, and tombstones have their own failure modes.",
      "Read-before-write patterns undo most of the write advantage.",
    ],
    planFor: [
      "A partition key that bounds partition size — usually by adding time.",
      "One table per access pattern, and how they are kept in step.",
      "The consistency level for each query, stated deliberately.",
    ],
    followUps: ["What is your partition key, and how large can one partition get?", "How do you support a query you did not model?", "Quorum or one — what are you trading?"],
  },

  {
    id: "queue",
    name: "Message queue",
    category: "messaging",
    hook: "A ticket spike by the kitchen door. Orders go on it, cooks take them off, and the waiter never waits for the cooking.",
    concept:
      "A durable buffer between a producer and a consumer, where each message is delivered to exactly one worker — the seam that lets two systems run at different speeds without either knowing.",
    useWhen: ["work can be done after the response", "producer and consumer scale differently", "a spike must be absorbed rather than refused"],
    tradeoffs: {
      gains: ["Absorbs bursts that would otherwise be dropped or time out.", "Decouples deploys and failures: the consumer can be down without the producer caring.", "Retries and backoff become infrastructure, not code."],
      costs: ["Eventual consistency becomes a product decision you must surface.", "Queue depth is a new thing to watch and alert on.", "Ordering and exactly-once are much weaker than people assume."],
    },
    alternatives: [
      { id: "pub-sub", insteadWhen: "several independent consumers each need every message" },
      { id: "event-log", insteadWhen: "consumers need to replay history rather than consume and forget" },
    ],
    limits: [
      "At-least-once is the norm: handlers must be idempotent.",
      "Strict global ordering costs throughput and usually is not what you needed.",
      "An unbounded queue turns a throughput problem into a latency problem and hides it.",
    ],
    planFor: ["Idempotent consumers, keyed on something stable.", "A dead-letter queue and an owner for it.", "Visible progress for the user, since 'accepted' is not 'done'."],
    followUps: ["What happens if the same message is delivered twice?", "How do you handle a message that always fails?", "Does ordering matter here, and per what — globally, or per user?"],
  },

  {
    id: "pub-sub",
    name: "Pub/sub",
    category: "messaging",
    hook: "A noticeboard. One person pins a notice; everyone who cares about that board reads it, and the pinner never learns who did.",
    concept:
      "One-to-many messaging where publishers emit events to a topic and any number of independent subscribers each receive a copy — the mechanism behind fan-out without coupling.",
    useWhen: ["one event has several unrelated consequences", "teams want to react to events without the producer knowing", "notifications, feed fan-out, search indexing, audit"],
    tradeoffs: {
      gains: ["Adding a consumer requires no change to the producer.", "Slow consumers do not slow the producer.", "One event, many independently scaled reactions."],
      costs: ["Nobody can say what happens when an event fires without reading every subscriber.", "Debugging spans systems that do not know about each other.", "A schema change can break consumers silently."],
    },
    alternatives: [
      { id: "queue", insteadWhen: "exactly one worker should handle each message" },
      { id: "event-log", insteadWhen: "subscribers need to rewind and reprocess" },
    ],
    limits: [
      "Delivery is per-subscriber: one failing subscriber does not stop the others, which is a feature until it is a data gap.",
      "No natural backpressure onto the publisher.",
      "Ordering across topics is not a thing.",
    ],
    planFor: ["An event schema and how it is versioned.", "Per-subscriber retry and dead-lettering.", "A way to answer 'what happens when this event fires' without reading six repos."],
    followUps: ["What if one subscriber is down for an hour?", "How do you add a field to an event safely?", "Who owns the event schema?"],
  },

  {
    id: "event-log",
    name: "Event log",
    category: "messaging",
    hook: "A tape that is only ever appended to. Everyone reading it keeps their own bookmark, and anyone can rewind.",
    concept:
      "An ordered, durable, replayable log partitioned by key (Kafka and relatives), where consumers track their own offset — a queue that remembers, and therefore doubles as a source of truth.",
    useWhen: ["several consumers at different speeds", "reprocessing history is a requirement", "very high throughput streams, CDC, analytics"],
    tradeoffs: {
      gains: ["Replay: a bug fixed today can be applied to last month's events.", "Per-partition ordering with real throughput.", "One pipeline feeds streaming, batch and search at once."],
      costs: ["Substantial operational weight — this is a system you now run.", "Consumers own their offsets, and an offset bug is a data bug.", "Retention is a cost and a compliance decision."],
    },
    alternatives: [
      { id: "queue", insteadWhen: "the work is jobs to be done once and forgotten" },
      { id: "pub-sub", insteadWhen: "fan-out is all you need and replay is not" },
    ],
    limits: [
      "Ordering is per partition only; choosing the partition key is choosing your ordering guarantee.",
      "A slow consumer falls behind until retention deletes what it had not read.",
      "Exactly-once is achievable and is harder than the marketing suggests.",
    ],
    planFor: ["The partition key, which decides both ordering and hot spots.", "Retention, and what a consumer that was down for longer than that does.", "Schema evolution, with a registry or an equivalent discipline."],
    followUps: ["What is the partition key and what ordering does that give you?", "What happens to a consumer that is down for two days?", "How do you reprocess a week of events without double-counting?"],
  },

  {
    id: "stream-processing",
    name: "Stream processing",
    category: "messaging",
    hook: "A conveyor belt with someone standing beside it, sorting and tallying as things go past rather than at the end of the day.",
    concept:
      "Continuous computation over an event stream — windowed aggregates, joins and enrichment applied as data arrives, producing results that are always current instead of current as of last night.",
    useWhen: ["counts, rankings or aggregates that must be near-real-time", "fraud and anomaly detection", "feeding a cache or a materialised view from a log"],
    tradeoffs: {
      gains: ["Results in seconds rather than after a nightly batch.", "Naturally incremental: no recomputing the world.", "One definition of a metric, applied continuously."],
      costs: ["Time is now your hardest problem: event time, processing time, late arrivals.", "Stateful operators need checkpointing and recovery.", "Debugging a wrong number means replaying a stream."],
    },
    alternatives: [
      { id: "batch-pipeline", insteadWhen: "daily freshness is fine — batch is far simpler and cheaper" },
      { id: "worker-pool", insteadWhen: "the work is discrete jobs rather than a continuous flow" },
    ],
    limits: [
      "Late and out-of-order events force a choice between correctness and latency.",
      "Exactly-once across a stream and an external write is a genuine research-grade problem.",
      "State can grow without bound if windows are not closed.",
    ],
    planFor: ["A watermark policy: how long you wait for stragglers.", "Checkpointing, and what a restart reprocesses.", "A batch job that can correct what the stream got wrong."],
    followUps: ["What is your window, and what happens to an event that arrives after it closes?", "How do you recover state after a crash?", "Event time or processing time, and why?"],
  },

  {
    id: "search-index",
    name: "Search index",
    category: "search",
    hook: "The index at the back of a book — built once, so you never read the whole book to find a word.",
    concept:
      "An inverted index mapping terms to documents, with ranking, analysis and faceting — the thing that makes text search fast and makes `LIKE '%term%'` unnecessary.",
    useWhen: ["free-text search over a large corpus", "relevance ranking, typo tolerance, facets", "filtering by many optional attributes at once"],
    tradeoffs: {
      gains: ["Text queries in milliseconds over millions of documents.", "Relevance, fuzziness and facets come as features rather than projects.", "Takes a punishing query pattern off the primary database."],
      costs: ["A second copy of the data that must be kept in step.", "Indexing lag: a write is searchable slightly later.", "Operationally substantial, and memory-hungry."],
    },
    alternatives: [
      { id: "relational-db", insteadWhen: "the corpus is small enough for a database index to do the job" },
      { id: "cache", insteadWhen: "the same few searches repeat and precomputing them is enough" },
    ],
    limits: [
      "Not a system of record — treat it as derived and rebuildable.",
      "Deep pagination is expensive in a distributed index.",
      "Relevance tuning is endless and subjective.",
    ],
    planFor: ["How documents get in: dual write, CDC, or a consumer of the event log.", "A full rebuild path, because you will need one.", "What a user sees for a document indexed three seconds ago."],
    followUps: ["How does the index stay in step with the database?", "How long after a write is a document findable?", "How do you rebuild the index without downtime?"],
  },

  {
    id: "consistent-hashing",
    name: "Consistent hashing",
    category: "coordination",
    hook: "Seating a party around a circular table so that adding one more chair moves one person, not everybody.",
    concept:
      "Mapping keys and nodes onto the same ring so that adding or removing a node relocates roughly 1/N of keys instead of remapping all of them — the standard answer to partitioning with a changing node count.",
    useWhen: ["distributing keys across a changing set of caches or shards", "any time 'hash mod N' would be the naive answer", "sticky routing without a central directory"],
    tradeoffs: {
      gains: ["A node join or leave disturbs a small slice, not the whole keyspace.", "No central coordinator needed to find a key's home.", "Virtual nodes smooth out the uneven distribution."],
      costs: ["More complex than modulo, and easy to implement subtly wrong.", "Still gives hot spots when individual keys are hot.", "Rebalancing during a failure is exactly when the extra load lands."],
    },
    alternatives: [
      { id: "sharding", insteadWhen: "the shard map is small, explicit and rarely changes — a lookup table is simpler and clearer" },
    ],
    limits: [
      "Solves key distribution, not key popularity: one celebrity key still lands on one node.",
      "Without virtual nodes, distribution is noticeably lumpy.",
      "Every client must agree on the ring, so ring state is itself a consistency problem.",
    ],
    planFor: ["Virtual nodes, and how many.", "How clients learn the ring changed.", "A hot-key escape hatch: replicate the key, or shard it by suffix."],
    followUps: ["Why not just hash mod N?", "What happens to a hot key?", "How do all the clients agree on the ring?"],
  },

  {
    id: "distributed-lock",
    name: "Distributed lock",
    category: "coordination",
    hook: "One key to the stockroom, and a rule that you must be holding it to go in.",
    concept:
      "A mutual-exclusion primitive across machines — usually a lease with a TTL in Redis or a real consensus store — so that exactly one worker performs an action at a time.",
    useWhen: ["a scheduled job must not run twice", "leader election for a singleton process", "guarding a non-idempotent external side effect"],
    tradeoffs: {
      gains: ["Turns a class of race condition into an explicit, visible mechanism.", "Cheap to add and easy to explain.", "A TTL means a dead holder does not wedge the system forever."],
      costs: ["It is a correctness mechanism built on a timeout, which is a compromise.", "Lock contention becomes a throughput ceiling.", "Availability of the lock store becomes availability of the feature."],
    },
    alternatives: [
      { id: "idempotency", insteadWhen: "you can make the operation safe to repeat — always prefer this" },
      { id: "queue", insteadWhen: "serialising by partition key gets you exclusivity without a lock" },
    ],
    limits: [
      "A lease can expire while the holder is still working, so two workers believe they hold it.",
      "Redis-based locks are not safe under partition without fencing tokens.",
      "Locks held across network calls are how systems deadlock.",
    ],
    planFor: ["A fencing token, so a stale holder's writes are rejected.", "What happens when the TTL expires mid-work.", "Whether the operation can just be made idempotent instead."],
    followUps: ["What if the lock expires while the job is still running?", "What happens when the lock store is unavailable?", "Could you avoid the lock by making the work idempotent?"],
  },

  {
    id: "idempotency",
    name: "Idempotency keys",
    category: "coordination",
    hook: "A cloakroom ticket for an action: hand in the same ticket twice and you still only get one coat.",
    concept:
      "A client-supplied key recorded with the result of an operation, so a retry of the same request returns the original outcome instead of performing it again — the practical answer to at-least-once everything.",
    useWhen: ["payments, orders, anything with an external side effect", "any consumer of an at-least-once queue", "any endpoint a client will retry, which is all of them"],
    tradeoffs: {
      gains: ["Retries stop being dangerous, which makes everything else simpler.", "Network ambiguity — did it work? — stops being a data problem.", "Enables aggressive client retry policies."],
      costs: ["A key store with its own TTL and size.", "The client has to generate and reuse the key correctly.", "Atomically recording key and effect together is the fiddly part."],
    },
    alternatives: [
      { id: "distributed-lock", insteadWhen: "the operation genuinely cannot be made repeatable" },
    ],
    limits: [
      "Only as good as the key: a client that regenerates it per attempt has no protection.",
      "Storing the key and doing the work must be one atomic step, or the gap is the bug.",
      "Keys expire, and a retry after expiry duplicates.",
    ],
    planFor: ["Key lifetime, and what a retry after it looks like.", "Returning the original response on replay, not just skipping.", "The concurrent case: two identical requests in flight at once."],
    followUps: ["What does the second identical request return?", "How long do you keep keys, and what happens after?", "What if two requests with the same key arrive simultaneously?"],
  }
,
  {
    id: "serverless",
    name: "Serverless functions",
    category: "compute",
    hook: "Hiring a taxi instead of owning a car: perfect if you travel rarely, ruinous if you commute in one every day.",
    concept:
      "Code run per invocation on infrastructure you do not manage, scaled to zero when idle and to hundreds instantly under load, billed per millisecond.",
    useWhen: ["spiky or infrequent traffic", "glue between managed services", "a job nobody wants to own a server for"],
    tradeoffs: {
      gains: ["No idle cost and no capacity planning.", "Scales out faster than you could provision.", "Operational surface is genuinely small."],
      costs: ["Cold starts add latency exactly when traffic arrives.", "Execution time and memory are capped.", "Per-invocation pricing is far more expensive at steady high volume."],
    },
    alternatives: [
      { id: "app-servers", insteadWhen: "traffic is steady — a standing pool is cheaper and faster" },
      { id: "worker-pool", insteadWhen: "jobs are long-running or need to hold connections" },
    ],
    limits: [
      "Database connections are a poor fit — hundreds of instances exhaust a pool instantly.",
      "Cold starts on a VPC or a large runtime are measured in seconds.",
      "Local state between invocations is possible and never guaranteed.",
    ],
    planFor: ["A connection proxy or a serverless-friendly data store.", "What a cold start does to your p99.", "The cost curve if this succeeds and runs constantly."],
    followUps: ["What does a cold start cost you here?", "How do these talk to a relational database without exhausting connections?", "At what traffic level would a server be cheaper?"],
  },

  {
    id: "load-shedding",
    name: "Load shedding",
    category: "edge",
    hook: "A lifeboat with a stated capacity. Past that, the honest answer is no — given immediately rather than by sinking.",
    concept:
      "Deliberately rejecting a fraction of work when the system is beyond capacity, so the requests that are accepted still complete — the difference between a degraded service and a collapsed one.",
    useWhen: ["overload is possible and queuing would only add latency", "some requests matter more than others", "any system whose failure mode is a cascade"],
    tradeoffs: {
      gains: ["Prevents the death spiral where every request times out and is retried.", "Keeps latency bounded for the traffic you do serve.", "Lets you protect paying or critical traffic first."],
      costs: ["Somebody is being refused, and they will notice.", "Choosing what to shed requires knowing what matters.", "Badly tuned shedding refuses work you had capacity for."],
    },
    alternatives: [
      { id: "rate-limiter", insteadWhen: "the goal is fairness per client rather than survival under overload" },
      { id: "queue", insteadWhen: "the work can wait — delaying is kinder than refusing" },
    ],
    limits: [
      "It protects the server, not the user, whose request still failed.",
      "Clients that retry aggressively convert shedding into more load.",
      "Requires a reliable signal of overload, which is harder than it sounds.",
    ],
    planFor: ["A priority scheme: what gets shed first.", "Retry-After headers and client backoff, or shedding amplifies the problem.", "The overload signal — queue depth, latency, or concurrency."],
    followUps: ["What do you shed first, and how do you know?", "What stops clients retrying straight into the same wall?", "How do you detect overload before users do?"],
  },

  {
    id: "service-mesh",
    name: "Service mesh",
    category: "coordination",
    hook: "Giving every department its own switchboard operator, all following the same rules, so nobody has to learn how to place a call.",
    concept:
      "A sidecar proxy beside every service instance handling retries, timeouts, mTLS, traffic shifting and telemetry, so those concerns are configuration rather than library code in each language.",
    useWhen: ["many services in several languages", "uniform mTLS or traffic policy is required", "you want canary and traffic shifting without app changes"],
    tradeoffs: {
      gains: ["Retries, timeouts and mTLS applied uniformly, including to services nobody maintains.", "Consistent telemetry across every hop for free.", "Traffic shifting and canaries become a control-plane setting."],
      costs: ["Substantial operational complexity for a small number of services.", "A proxy hop on every call, and a new failure mode in the middle of every call.", "Debugging now involves the mesh as well as the app."],
    },
    alternatives: [
      { id: "api-gateway", insteadWhen: "the concern is north-south traffic from outside rather than service-to-service" },
      { id: "app-servers", insteadWhen: "there are three services and a shared client library is plenty" },
    ],
    limits: [
      "Does not make a distributed system simple; it makes its policy uniform.",
      "Mesh retries stacked on app retries multiply load during an incident.",
      "Resource overhead per pod is real at scale.",
    ],
    planFor: ["Retry budgets, so mesh and app do not compound.", "What happens to traffic when the control plane is down.", "Whether the number of services justifies it at all."],
    followUps: ["Would a shared library do this instead?", "What happens when the sidecar is unhealthy?", "How do you stop retries amplifying an outage?"],
  },

  {
    id: "batch-pipeline",
    name: "Batch pipeline",
    category: "messaging",
    hook: "Doing the accounts at the end of the month rather than after every transaction — slower to answer, much harder to get wrong.",
    concept:
      "Scheduled jobs that process a bounded set of data — nightly aggregation, reports, backfills, model training — where completeness matters more than freshness.",
    useWhen: ["daily or hourly freshness is acceptable", "the computation needs the whole dataset", "backfills and corrections"],
    tradeoffs: {
      gains: ["Far simpler than streaming, and simpler to make correct.", "A rerun fixes a bad day, which streaming cannot easily offer.", "Cheap: it uses resources only while it runs."],
      costs: ["Results are as old as the last run.", "A failed run delays everything downstream.", "Runtime grows with the data until one night it does not finish."],
    },
    alternatives: [
      { id: "stream-processing", insteadWhen: "seconds of freshness is a requirement rather than a preference" },
    ],
    limits: [
      "Cannot answer questions about the last five minutes.",
      "Reprocessing everything nightly stops scaling at some size.",
      "Job dependencies become a graph that needs an orchestrator.",
    ],
    planFor: ["Idempotent, rerunnable jobs.", "Late-arriving data, and how a rerun corrects yesterday.", "An alert for a job that did not run at all — the silent failure."],
    followUps: ["What happens if a run fails halfway?", "How fresh does this actually need to be?", "How do you backfill a bug fix over six months of data?"],
  },

  {
    id: "websockets",
    name: "WebSockets / long-lived connections",
    category: "delivery",
    hook: "Leaving the phone line open rather than calling back every ten seconds to ask if anything happened.",
    concept:
      "A persistent bidirectional connection between client and server, so the server can push the moment something changes instead of waiting to be asked.",
    useWhen: ["chat, presence, live collaboration, notifications", "polling would be wasteful or too slow", "the server has news the client did not ask for"],
    tradeoffs: {
      gains: ["Push latency in milliseconds with no polling overhead.", "Bidirectional, so the client can stream too.", "Far less wasted traffic than short polling at scale."],
      costs: ["Connections are state, which makes the tier stateful.", "Memory and file descriptors per connection bound one machine.", "Reconnection, backoff and missed-message recovery are all yours to write."],
    },
    alternatives: [
      { id: "sse", insteadWhen: "the flow is server-to-client only — SSE is plain HTTP and survives more proxies" },
      { id: "queue", insteadWhen: "the client does not need it immediately and can poll or be emailed" },
    ],
    limits: [
      "Load balancers must support and be configured for upgrades and long idle times.",
      "A deploy disconnects everyone at once unless it is handled deliberately.",
      "Fan-out to many connections needs a pub/sub layer behind it — the socket tier cannot be the router.",
    ],
    planFor: ["Which server holds which connection, and how a message finds it — usually pub/sub.", "Reconnect with a cursor, so nothing is missed in the gap.", "Connection count per node, and what that means for capacity."],
    followUps: ["How does a message reach the right server for that user?", "What happens to messages sent while a client is reconnecting?", "How many connections per node, and what is the limit?"],
  },

  {
    id: "sse",
    name: "Server-sent events",
    category: "delivery",
    hook: "A ticker tape: it only runs one way, and that turns out to be all most things need.",
    concept:
      "A long-lived HTTP response streaming events server-to-client, with automatic reconnection and event ids — one-way push without the weight or the proxy trouble of a socket upgrade.",
    useWhen: ["the client only needs to receive", "live feeds, progress, notifications", "you want push without a new protocol in the stack"],
    tradeoffs: {
      gains: ["Plain HTTP: it survives proxies that quietly drop WebSocket upgrades.", "Reconnection and last-event-id are in the browser already.", "Nothing new to run, and trivially load-balanced."],
      costs: ["One direction only; a client write needs an ordinary request.", "Browsers cap connections per origin over HTTP/1.1.", "Buffering proxies can turn a stream into a batch delivered at the end."],
    },
    alternatives: [
      { id: "websockets", insteadWhen: "the client needs to stream too, or the message rate is very high" },
    ],
    limits: [
      "Still a connection held open, so the same per-node connection limits apply.",
      "Text only; binary needs encoding.",
      "Needs explicit anti-buffering configuration on some proxies.",
    ],
    planFor: ["Heartbeats, so idle connections are not dropped.", "What a reconnecting client missed, and how it catches up.", "The separate write path for anything the client sends."],
    followUps: ["Why not WebSockets here?", "What does a client do after a dropped connection?", "How do you stop a proxy buffering the stream?"],
  },

  {
    id: "cdc",
    name: "Change data capture",
    category: "messaging",
    hook: "Reading the shop's own till roll rather than asking every clerk what they sold.",
    concept:
      "Streaming a database's commit log as events, so derived systems — search, cache, analytics, another service — update from the source of truth without the application dual-writing.",
    useWhen: ["a search index or cache must track a database", "you want events without changing application code", "migrating or replicating between stores"],
    tradeoffs: {
      gains: ["No dual writes, so no partial failure where one side updated and the other did not.", "Captures every change, including ones made outside your application.", "Ordered and replayable, being the commit log."],
      costs: ["Derived systems are coupled to the database schema.", "Operationally non-trivial: connectors, offsets, snapshots.", "An initial snapshot of a large table is its own project."],
    },
    alternatives: [
      { id: "pub-sub", insteadWhen: "the application can publish a proper domain event, which is usually cleaner" },
      { id: "batch-pipeline", insteadWhen: "nightly freshness is enough" },
    ],
    limits: [
      "Emits row changes, not intent — 'status became 3' rather than 'order was cancelled'.",
      "A schema migration can break every consumer at once.",
      "Lag during heavy writes is exactly when consumers most need to be current.",
    ],
    planFor: ["Translating row changes into domain events somewhere.", "The initial snapshot and how it hands over to the stream.", "What consumers do when the schema changes."],
    followUps: ["Why CDC rather than publishing an event from the application?", "How do you bootstrap a new consumer over existing data?", "What breaks when someone renames a column?"],
  },

  {
    id: "metrics",
    name: "Metrics & alerting",
    category: "observability",
    hook: "The dials on a dashboard. They will not tell you why the engine is rough, but they tell you it is, before the passengers do.",
    concept:
      "Numeric time series — rate, errors, duration, saturation — scraped and stored, with alerts on the ones that mean a human should act.",
    useWhen: ["always, before the first incident rather than after", "capacity planning", "anything with a latency or availability target"],
    tradeoffs: {
      gains: ["Cheap to store and fast to query over long windows.", "Turns 'it feels slow' into a number with a history.", "Alerting on symptoms catches causes you did not anticipate."],
      costs: ["High-cardinality labels explode cost and query time.", "Aggregates hide the individual bad request.", "Alert fatigue is a real failure mode with real consequences."],
    },
    alternatives: [
      { id: "tracing", insteadWhen: "the question is where the time went in one request" },
      { id: "structured-logs", insteadWhen: "the question is what happened to one specific user" },
    ],
    limits: [
      "Averages hide tail latency — p99 or nothing.",
      "Cardinality: one label per user id will take the metrics system down.",
      "Tells you what changed, rarely why.",
    ],
    planFor: ["Which few alerts justify waking someone, and what each one means they should do.", "An SLO, so 'slow' has a definition.", "A cardinality budget before somebody labels by request id."],
    followUps: ["What would page you here, and at what threshold?", "p50 or p99 — which are you optimising and why?", "How do you find which customer is affected from a metric?"],
  },

  {
    id: "tracing",
    name: "Distributed tracing",
    category: "observability",
    hook: "A luggage tag that gets scanned at every belt, so when a bag is late you can see exactly where it sat.",
    concept:
      "A trace id propagated across every service in a request, with spans recording where time went — the only practical way to answer 'which of these nine hops is slow'.",
    useWhen: ["more than a couple of services in a request path", "latency is unevenly distributed and nobody knows where", "debugging across team boundaries"],
    tradeoffs: {
      gains: ["Shows the whole request path, including the hop nobody suspected.", "Makes dependencies visible, including accidental ones.", "Turns cross-team latency arguments into a picture."],
      costs: ["Every service must propagate context or the trace breaks at that hop.", "Sampling means the interesting request is often not captured.", "Storage grows quickly at useful sampling rates."],
    },
    alternatives: [
      { id: "metrics", insteadWhen: "you need aggregate trends rather than one request's story" },
      { id: "structured-logs", insteadWhen: "one service is clearly the problem and you need detail inside it" },
    ],
    limits: [
      "One service that drops the header blinds everything downstream of it.",
      "Head sampling decides before knowing whether the request was interesting.",
      "Shows where time went, not why that code was slow.",
    ],
    planFor: ["Context propagation through every client, queue and worker.", "A sampling strategy that keeps errors and slow requests.", "Trace ids in logs, so the two are joinable."],
    followUps: ["What happens to a trace that crosses a queue?", "How do you make sure slow requests are the ones sampled?", "How do you correlate a trace with a log line?"],
  },

  {
    id: "structured-logs",
    name: "Structured logs",
    category: "observability",
    hook: "A diary written in a consistent format, so you can search it — rather than prose you have to read.",
    concept:
      "Log lines emitted as key-value records with request and trace ids attached, centrally collected, so a specific event can be found rather than grepped for across machines.",
    useWhen: ["always", "debugging one user's specific problem", "audit trails and post-incident reconstruction"],
    tradeoffs: {
      gains: ["Answers questions about one request that aggregates cannot.", "Queryable by field rather than by regex over prose.", "Doubles as an audit record when it matters."],
      costs: ["Volume and cost grow with traffic, fast.", "Sensitive data leaks into logs unless actively prevented.", "Writing a log line is not free in a hot path."],
    },
    alternatives: [
      { id: "metrics", insteadWhen: "the question is about rates and trends over time" },
      { id: "tracing", insteadWhen: "the question is which service in the path was slow" },
    ],
    limits: [
      "Retention is a cost decision, and the incident is often older than it.",
      "High-volume debug logging is itself a performance problem.",
      "Unstructured text sneaks back in the moment nobody is looking.",
    ],
    planFor: ["Request and trace id on every line, or correlation is impossible.", "Redaction of credentials and personal data at the emitter.", "Retention and sampling, decided by cost and by compliance."],
    followUps: ["How do you find every log line for one user's request?", "What stops a password ending up in a log?", "How long do you keep these, and why that long?"],
  },

  {
    id: "time-series-db",
    name: "Time-series database",
    category: "storage",
    hook: "A logbook where every entry is stamped with the minute, and almost every question starts with 'between when and when'.",
    concept:
      "A store specialised for timestamped measurements — heavy append, time-ordered reads, automatic downsampling and retention — for metrics, telemetry and anything sampled on a clock.",
    useWhen: ["metrics, IoT readings, financial ticks", "queries are almost always over a time range", "old data can be aggregated away"],
    tradeoffs: {
      gains: ["Compression ratios general stores cannot approach.", "Range and rollup queries are the fast path, not the slow one.", "Retention and downsampling are built in."],
      costs: ["Poor at anything that is not a time range.", "High cardinality in tags degrades it sharply.", "Another specialised store to operate."],
    },
    alternatives: [
      { id: "wide-column", insteadWhen: "you want one store for time-ordered data and other patterns too" },
      { id: "relational-db", insteadWhen: "volume is modest — a table with a timestamp index is plenty" },
    ],
    limits: [
      "Updates and deletes of individual points are awkward by design.",
      "Cardinality explosions are the classic outage here.",
      "Joins to dimensional data usually happen in the application.",
    ],
    planFor: ["A tag scheme with bounded cardinality.", "Downsampling and retention, decided up front.", "Where the non-time-series attributes live."],
    followUps: ["What is your tag cardinality, and what happens if it doubles?", "How long do you keep raw resolution?", "How do you query this alongside data in the main database?"],
  },

  {
    id: "graph-db",
    name: "Graph database",
    category: "storage",
    hook: "A map of who knows whom, where the interesting question is always how many handshakes away something is.",
    concept:
      "A store whose primitive is the relationship, making multi-hop traversal cheap — friends-of-friends, permission inheritance, fraud rings, recommendations.",
    useWhen: ["queries are about paths and depth, not rows", "relationships are as important as entities", "the SQL for it needs recursive CTEs and still is slow"],
    tradeoffs: {
      gains: ["Multi-hop traversal stays fast where joins degrade exponentially.", "The model matches the domain when the domain is a network.", "Query languages express reachability naturally."],
      costs: ["A specialised store most teams have no experience operating.", "Sharding a graph is genuinely hard — edges cross partitions.", "Poor fit for the bulk, non-graph parts of the same product."],
    },
    alternatives: [
      { id: "relational-db", insteadWhen: "traversals are one or two hops — a join is fine and far simpler" },
      { id: "wide-column", insteadWhen: "you can precompute adjacency lists for the queries you need" },
    ],
    limits: [
      "Unbounded traversals can touch the whole graph.",
      "Supernodes — the account with ten million followers — break the model's assumptions.",
      "Rarely the primary store; usually a second copy that must be kept in step.",
    ],
    planFor: ["How the graph stays in step with the system of record.", "Depth limits on traversal.", "Supernodes, explicitly, because your product will have some."],
    followUps: ["Could a join or a precomputed adjacency list do this?", "What happens when one node has ten million edges?", "How does the graph stay current?"],
  },
];
