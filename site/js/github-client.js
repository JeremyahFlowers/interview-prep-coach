// Thin wrapper over the GitHub Contents API. This is the entire sync layer —
// every device reads and writes the same JSON file in your own GitHub repo,
// authenticated with a personal access token you paste in once per device.
const API = "https://api.github.com";

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GitHubStore {
  constructor({ owner, repo, branch, token, path }) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch || "main";
    this.token = token;
    this.path = path;
    this.sha = null;
  }

  _headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  _contentsUrl() {
    return this._urlFor(this.path);
  }

  _urlFor(path) {
    return `${API}/repos/${this.owner}/${this.repo}/contents/${path}`;
  }

  async fetchState() {
    const res = await fetch(`${this._contentsUrl()}?ref=${encodeURIComponent(this.branch)}`, {
      headers: this._headers(),
    });
    if (res.status === 404) return { exists: false, state: null };
    if (!res.ok) throw await this._errorFrom(res);
    const json = await res.json();
    this.sha = json.sha;
    return { exists: true, state: JSON.parse(base64ToUtf8(json.content)) };
  }

  async saveState(state, message) {
    const body = {
      message: message || `Ledger update — ${new Date().toISOString()}`,
      content: utf8ToBase64(JSON.stringify(state, null, 2)),
      branch: this.branch,
    };
    if (this.sha) body.sha = this.sha;
    const res = await fetch(this._contentsUrl(), {
      method: "PUT",
      headers: { ...this._headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      const err = new Error("Someone else (probably you, on another device) saved first.");
      err.code = "conflict";
      throw err;
    }
    if (!res.ok) throw await this._errorFrom(res);
    const json = await res.json();
    this.sha = json.content.sha;
    return json;
  }

  /** Reads and JSON-parses any other file in the repo, read-only — used for
   * files this app never writes itself (like the LeetCode sync output a
   * GitHub Action produces). Returns null for a missing file instead of
   * throwing, since "not synced yet" is an expected, normal state. */
  async fetchPublicFile(path) {
    const res = await fetch(`${this._urlFor(path)}?ref=${encodeURIComponent(this.branch)}`, {
      headers: this._headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw await this._errorFrom(res);
    const json = await res.json();
    return JSON.parse(base64ToUtf8(json.content));
  }

  /**
   * Read a JSON file, with the sha needed to write it back.
   *
   * fetchPublicFile already reads one, and deliberately throws its sha away —
   * it is for files a scheduled job writes and the app only ever reads. A file
   * the app updates needs the sha, because without it GitHub refuses the write
   * on anything that already exists.
   */
  async readJsonFile(path) {
    const res = await fetch(`${this._urlFor(path)}?ref=${encodeURIComponent(this.branch)}`, {
      headers: this._headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw await this._errorFrom(res);
    const json = await res.json();
    return { data: JSON.parse(base64ToUtf8(json.content)), sha: json.sha };
  }

  /**
   * Write a JSON file, creating or updating it.
   *
   * `sha` omitted means "this should not exist yet"; passing a stale one is how
   * GitHub tells two writers apart, and the 409 it returns is surfaced as a
   * conflict rather than a generic failure so a caller can re-read and retry.
   */
  async writeJsonFile(path, data, { sha = null, message } = {}) {
    const res = await fetch(this._urlFor(path), {
      method: "PUT",
      headers: { ...this._headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message || `Ledger: update ${path}`,
        content: utf8ToBase64(JSON.stringify(data)),
        branch: this.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (res.status === 409 || res.status === 422) {
      const err = await this._errorFrom(res);
      err.code = "conflict";
      throw err;
    }
    if (!res.ok) throw await this._errorFrom(res);
    return (await res.json()).content?.sha ?? null;
  }

  /** Remove a file. Used when a session ends and its scratch log is no longer
   *  worth keeping — the attempt and the board PNG are the durable record. */
  async deleteFile(path, sha, message) {
    const res = await fetch(this._urlFor(path), {
      method: "DELETE",
      headers: { ...this._headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ message: message || `Ledger: remove ${path}`, sha, branch: this.branch }),
    });
    // Already gone is the outcome we wanted.
    if (!res.ok && res.status !== 404) throw await this._errorFrom(res);
  }

  /**
   * Ask the statements workflow to run now.
   *
   * Statements arrive from a scheduled job that fetches twenty per run, so a
   * problem added today could show its paste box until tomorrow. The workflow
   * already accepts workflow_dispatch; this is the app asking for it rather
   * than the user going to the Actions tab.
   *
   * Needs a token with the `workflow` scope. A 403 here means the token is
   * fine for everything else and just can't do this, which is worth saying
   * exactly rather than reporting as a generic failure.
   */
  async dispatchWorkflow(file, ref = this.branch) {
    const res = await fetch(`${API}/repos/${this.owner}/${this.repo}/actions/workflows/${encodeURIComponent(file)}/dispatches`, {
      method: "POST",
      headers: { ...this._headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ ref }),
    });
    if (res.status === 403) {
      const err = new Error("Your GitHub token can't start workflows — it needs the \"workflow\" scope.");
      err.code = "no_workflow_scope";
      throw err;
    }
    if (res.status === 404) {
      const err = new Error("Couldn't find that workflow in your data repo.");
      err.code = "no_workflow";
      throw err;
    }
    if (!res.ok) throw await this._errorFrom(res);
    return true;
  }

  /** Reads a binary file and returns its raw base64 content (no decoding) —
   * used to display a saved whiteboard PNG as a data: URL on demand. */
  async fetchBinaryFile(path) {
    const res = await fetch(`${this._urlFor(path)}?ref=${encodeURIComponent(this.branch)}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw await this._errorFrom(res);
    const json = await res.json();
    return json.content.replace(/\n/g, "");
  }

  /** Creates a brand-new binary file (base64 content, no leading data-URL
   * prefix) — used for whiteboard PNGs, which are stored as their own files
   * rather than embedded in state.json so the sync document stays small.
   * Assumes the path doesn't already exist (callers use unique ids), so it
   * never needs a sha. */
  async createBinaryFile(path, base64Content, message) {
    const res = await fetch(this._urlFor(path), {
      method: "PUT",
      headers: { ...this._headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message || `Ledger: add ${path}`,
        content: base64Content,
        branch: this.branch,
      }),
    });
    if (!res.ok) throw await this._errorFrom(res);
    return res.json();
  }

  async _errorFrom(res) {
    let detail = "";
    try {
      detail = (await res.json()).message || "";
    } catch (_) {
      /* body wasn't JSON — fall back to statusText below */
    }
    const err = new Error(`GitHub API ${res.status}: ${detail || res.statusText}`);
    err.status = res.status;
    return err;
  }
}
