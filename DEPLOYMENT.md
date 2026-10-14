# Deploying ScriptureAI (Vercel + Render)

**Status: prepared and tested locally. NOT deployed.** Nothing below has been done yet: no commit, push, repository,
token, hosting service or upload exists. Every step is yours to approve and perform.

```
Visitor's browser ─► Vercel (web/, static site, no secrets) ─► Render (api.py) ─► Google Gemini
                                                                 │ GEMINI_API_KEY, ACCESS_CODE (env vars)
                                                                 └ search index rebuilt at build time from a
                                                                   PRIVATE GitHub data repo (read-only token)
```

Two repositories:

| Repository | Visibility | Contains |
|---|---|---|
| `zygarde07/ScriptureAI` (exists) | public | code only |
| a new data repo, e.g. `zygarde07/scripture-data` | **private** | the exported index (book text + vectors, ~5 MB) |

---

## 1. Safety net for the public code repo

`.gitignore` blocks: `.env` / `.env.*`, `pdfs/`, `scriptures/`, `db/`, `data/`, `models/`, venvs, `node_modules/`,
`web/dist/`, and by file type `*.pdf *.sqlite3 *.onnx *.npy *.jsonl.gz *.zip *.tar.gz *.7z *.pem *.key`.
A dry run of `git add -A` listed only source files. Before every commit run `git status` and read the list.
Never use `git add -f`.

## 2. Create the PRIVATE data repository (you do this on github.com)

The data folder is already prepared at `data/scripture-index/` (inside this project, git-ignored):
`chunks.jsonl.gz`, `embeddings.npy`, `manifest.json` (checksums). **Check the folder is exactly those 3 files.**

1. GitHub → **New repository** → name `scripture-data` → **Private** → do not add README/license → Create.
2. Upload the 3 files. Easiest: open the new repo page → **uploading an existing file** → drag the 3 files → Commit.
   (Or from a terminal: `cd data/scripture-index`, `git init`, `git add .`, `git commit`, add the private repo as
   `origin`, `git push`. Do it in that folder, **not** in the project root.)
3. Confirm it shows a padlock "Private" and the 3 files.

## 3. Create a read-only token for Render (you do this on github.com)

1. GitHub → profile picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name `render-scripture-data-read`. Expiration: the longest you are comfortable with (the build needs it on every deploy;
   put a reminder in your calendar to renew it).
3. **Repository access → Only select repositories →** choose `scripture-data` and nothing else.
4. **Permissions → Repository permissions → Contents: Read-only.** Leave everything else "No access" (Metadata read-only is added automatically).
5. Generate, copy the token **once**, and paste it straight into Render (section 5). Do not put it in a file, chat or the code repo.
   If it leaks: GitHub → delete the token, create a new one, update Render.

## 4. Google AI Studio (Gemini key)

1. https://aistudio.google.com/apikey → create a **new key just for production** (not the one in your local `.env`).
2. The free tier has low limits (the old key ran out during testing). For a shared site consider enabling billing,
   and then set a budget alert in Google Cloud. Keep `DAILY_ANSWER_CAP` low either way.
3. Free-tier prompts may be used by Google to improve products; paid usage is treated differently. Check Google's current terms.
4. Paste the key only into Render (next section).

## 5. Render (backend)

Create: **New → Web Service →** connect `zygarde07/ScriptureAI` (public) → branch `main`.

| Setting | Value |
|---|---|
| Language / runtime | Python 3 |
| Root directory | leave empty |
| **Build Command** | `bash scripts/render_build.sh` |
| **Start Command** | `uvicorn api:app --host 0.0.0.0 --port $PORT --no-proxy-headers` |
| Instance type | Free to start (see risks) |
| Health Check Path | `/api/health` |
| Auto-Deploy | Off at first (deploy by hand until it works) |

Python version: the repo's `.python-version` file says `3.11`. **This matters:** Render's default is newer (3.14) and the
pinned libraries only have complete Linux builds for 3.11 (3.12 lacks a `chroma-hnswlib` wheel, 3.13 cannot use
`numpy 1.26.4`). If Render ignores the file, add env var `PYTHON_VERSION` = `3.11.9` (a full version is required there).

**Environment variables** (Render → service → Environment; they are stored on Render only):

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | the production key from section 4 |
| `ACCESS_CODE` | a long random code (16+ characters), chosen by you |
| `ENVIRONMENT` | `production` |
| `EMBEDDING_BACKEND` | `onnx` |
| `ALLOWED_ORIGINS` | your Vercel address, e.g. `https://scripture-ai.vercel.app` (see order below) |
| `DATA_REPO` | `zygarde07/scripture-data` (or your chosen name) |
| `DATA_REPO_TOKEN` | the read-only token from section 3 |
| `RATE_PER_MINUTE` | `10` |
| `RATE_PER_DAY` | `300` |
| `DAILY_ANSWER_CAP` | `300` (or lower) |

Never put `GEMINI_API_KEY`, `ACCESS_CODE` or `DATA_REPO_TOKEN` in a `VITE_` variable, in Vercel, or in any file in either repo.
To change the access code later, edit `ACCESS_CODE` on Render (the service restarts and everyone must enter the new code).

What the build does (`scripts/render_build.sh`, prints no secrets): installs `requirements-api.txt`; clones the private data
repo using the token in a request header; verifies the checksums; **rebuilds the search index natively on the server**
(so no Windows-made database files need to load on Linux); deletes the clone; downloads and checksum-verifies the public
ONNX model; confirms the index is ready.

## 6. Vercel (frontend)

**Add New → Project →** import `zygarde07/ScriptureAI`.

| Setting | Value |
|---|---|
| Root Directory | `web` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment variable `VITE_API_BASE_URL` | the Render address, e.g. `https://scripture-ai-api.onrender.com` (no trailing slash) |

`VITE_API_BASE_URL` is baked into the site at build time and is public; if you change it, redeploy. `web/vercel.json`
adds security headers. Only your production Vercel address is allowed by CORS; preview-deployment addresses are not.

## 7. Order of operations

1. Review `git status` / diff, then **approve a commit and push** of the code repo (separate approval).
2. Create the private data repo and token (sections 2, 3). Upload the 3 files.
3. Create the Google AI Studio key (section 4).
4. Create the Render service with the settings above (for now set `ALLOWED_ORIGINS` to a placeholder such as `https://example.com`;
   you replace it in step 6). Deploy. A good build log ends with `embedding model ready` and `index ready`. Then open
   `https://<service>.onrender.com/api/health` in a browser; it should show `"ready":true,"accessRequired":true`.
   If the build fails, the log names the missing setting (for example `DATA_REPO_TOKEN`); fix it and use **Manual Deploy → Deploy latest commit**.
5. Create the Vercel project with `VITE_API_BASE_URL`. Deploy. Copy its address.
6. Put that address into Render's `ALLOWED_ORIGINS`; Render restarts.
7. Test on your phone: gate screen, wrong code, right code, a real question, a source question (confidential reply).
8. Share the link and the access code privately.

## 8. Updating or switching it off later

- **Change the books:** on your PC put the PDFs in `pdfs/`, run `python ingest.py`, then `python index_data.py export data/scripture-index`,
  upload the 3 changed files to the private data repo, then in Render use **Manual Deploy → Clear build cache & deploy**
  (the index is only rebuilt during a build).
- **Change the code:** commit and push to the public repo; deploy by hand on Render (auto-deploy is off) and let Vercel rebuild.
- **Change the access code or Gemini key:** edit the value in Render → Environment; Render restarts the service by itself.
- **Switch it off quickly:** Render → the service → **Suspend**. To also cut the data access, delete the GitHub token (section 3).
- **Token expiry:** if a build fails with an authentication error, your read-only token has expired; make a new one and update `DATA_REPO_TOKEN`.

## 9. How the protections work (all tested locally)

- **Access code:** the browser sends it in an `X-Access-Code` header; the server compares it in constant time. It is stored only
  in Render's environment. Production refuses all questions if it is unset.
  The code is kept in the visitor's browser storage, so it is a convenience gate for a few invited people, not user accounts.
- **Rate limits** (per minute, per day, and a daily cap for everybody) plus a lockout after 8 wrong codes in 10 minutes.
  Because visitors' addresses cannot be trusted behind Render's proxy (the `X-Forwarded-For` header can be faked), the limits
  are **shared by all visitors**: one person's spam, or a code-guessing attack, can briefly block everyone (for up to 10 minutes).
  That is the safe trade-off. The daily cap bounds your Gemini spend whatever anyone does. All counters live in memory and
  reset when the server restarts.
- **Validation and errors:** question length 1–1000 characters, control characters removed, request body limited to 16 KB.
  Every error is a short generic JSON message; no stack traces, file names, keys or passages are ever returned. API docs pages are off.
- **CORS:** only the addresses in `ALLOWED_ORIGINS` (never `*` in production).
- **Answers contain only text:** nothing about which documents were used is sent to the browser.

## 10. Remaining risks

- **Source text exposure.** The sources panel is hidden and the server returns only the answer text, but this does not guarantee
  confidentiality. The prompt rules are requests to the model: answers can quote or closely paraphrase retrieved text, and
  prompt-injection or persistent probing can extract parts of the library. The text also sits on Render and in the private data repo,
  and passages go to Google with every question. You have confirmed you may host and process all 7 books.
- **Access-code limits.** One shared code; anyone who has it can pass it on; rotate it by changing `ACCESS_CODE`. Keep it long
  and random. Use a different code for each group if you want to be able to cut one off.
- **Render Free memory (512 MB).** About 280 MB measured on Windows with the ONNX backend, never measured on Linux/Render.
  If it runs out, Render restarts the service; the fallback is a paid instance.
- **Cold starts.** The free service sleeps after about 15 minutes idle; the first visit takes 30 to 60 s or more
  (the site shows "Waking up the server…"). Build files are kept, but the filesystem is otherwise ephemeral.
- **Linux not tested here.** This PC has no Linux (no WSL distribution, no Docker), so the Render build has only been
  tested on Windows with Python 3.11. Linux wheels for every pinned library were checked to exist for Python 3.11 (not for 3.12/3.13).
  The first Render build is the real Linux test. Because the index is rebuilt on the server from plain files, a Windows-built
  database does not need to load on Linux.
- **Gemini quota and cost.** Free quota is small. Visitors see a friendly "busy" message when Gemini refuses.
- **Search quality.** Chroma's approximate search finds roughly 80–85% of the truly nearest passages and varies slightly between restarts
  (same as before deployment); answers to one question can differ a little. Not changed here to keep RAG behavior as it was.
- **Security notes.** `chromadb 0.4.24` has two published advisories that concern Chroma's multi-user HTTP server, which this
  app does not run (it uses the embedded client). No fix version exists. No other known vulnerabilities in the pinned backend
  or the frontend (`npm audit`: 0).
