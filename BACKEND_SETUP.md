# Backend Setup (Vercel KV)

## 1. Deploy project to Vercel

1. Go to `https://vercel.com/new`.
2. Import your repository.
3. Deploy the project.

Vercel exposes `api/posts.js` as:

`https://<your-vercel-project>.vercel.app/api/posts`

## 2. Create and attach Vercel KV

1. Open your Vercel project.
2. Go to **Storage** -> **Create Database** -> **KV**.
3. Attach the KV database to this project.

When attached, Vercel adds environment variables automatically:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Optional custom key for post data:

- `KV_POSTS_KEY` (default: `anslagstavla:posts`)

## 3. Add CORS origin

In Vercel Project -> Settings -> Environment Variables, set:

- `ALLOWED_ORIGIN` = your frontend URL (example: `https://leif147.github.io`)

## 4. Configure frontend endpoint

In `index.html`, set backend URL:

```html
window.APP_CONFIG = {
  storageMode: "backend-api",
  backendApi: {
    endpoint: "https://<your-vercel-project>.vercel.app/api/posts"
  }
};
```

## 5. Publish frontend

Publish static files as usual (for example GitHub Pages).
All persistent data is now stored in Vercel KV through the backend API.
