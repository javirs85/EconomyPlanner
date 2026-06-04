# EconomyPlanner

Personal finance dashboard built with React, Vite and a small JSON-backed API.

## Local development

```bash
npm install
npm run dev
```

The local development server keeps using the Node API in `server/` and the SQLite database in `data/economy-planner.sqlite`.

## Cloudflare Pages

Cloudflare Pages builds the frontend and serves the API through Pages Functions in `functions/`.

Build settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Deploy command: leave empty when deploying from the Cloudflare Pages GitHub integration
- Production branch: `main`

R2 binding:

- Binding name: `ECONOMY_DB`
- Bucket name: set `bucket_name` in `wrangler.toml` to the R2 bucket created in Cloudflare
- Object key used by the app: `economy-planner/data.json`

## Migrating the local database to R2

Export the local SQLite database to the JSON shape used by R2:

```bash
npm run export:r2
```

That writes `data/economy-planner-r2.json`. Upload that file to the R2 bucket as:

```text
economy-planner/data.json
```

If you use Wrangler, the upload command is:

```bash
wrangler r2 object put <bucket-name>/economy-planner/data.json --file data/economy-planner-r2.json
```

For production, protect the Cloudflare Pages app with Cloudflare Access before importing personal financial data.
