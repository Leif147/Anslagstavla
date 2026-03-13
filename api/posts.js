const { kv } = require("@vercel/kv");
const DEFAULT_KV_KEY = "anslagstavla:posts";

module.exports = async function handler(req, res) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
    setCorsHeaders(res, allowedOrigin);

    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }

    let config;

    try {
        config = readServerConfig();
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
        return;
    }

    try {
        if (req.method === "PUT" && !isOriginAllowed(req, allowedOrigin)) {
            res.status(403).json({
                error: "Origin not allowed for write operation."
            });
            return;
        }

        if (req.method === "GET") {
            const posts = await readPosts(config);
            res.status(200).json({ posts });
            return;
        }

        if (req.method === "PUT") {
            const payload = parseBody(req.body);

            if (!Array.isArray(payload.posts)) {
                res.status(400).json({
                    error: "Request body must contain posts as an array."
                });
                return;
            }

            await writePosts(config, payload.posts);
            res.status(200).json({ ok: true, count: payload.posts.length });
            return;
        }

        res.setHeader("Allow", "GET,PUT,OPTIONS");
        res.status(405).json({ error: "Method not allowed." });
    } catch (error) {
        const status = Number.isInteger(error.status) ? error.status : 500;
        const message = error.message || "Unexpected server error.";

        res.status(status).json({
            error: message
        });
    }
};

function setCorsHeaders(res, origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isOriginAllowed(req, allowedOrigin) {
    if (!allowedOrigin || allowedOrigin === "*") {
        return true;
    }

    const requestOrigin = String(req.headers.origin || "").trim();
    return requestOrigin === allowedOrigin;
}

function readServerConfig() {
    const kvUrl = String(process.env.KV_REST_API_URL || "").trim();
    const kvToken = String(process.env.KV_REST_API_TOKEN || "").trim();
    const kvKey = String(process.env.KV_POSTS_KEY || DEFAULT_KV_KEY).trim();

    if (!kvUrl || !kvToken || !kvKey) {
        throw new Error(
            "Missing server environment variables. Required: KV_REST_API_URL, KV_REST_API_TOKEN. Optional: KV_POSTS_KEY."
        );
    }

    return {
        kvKey
    };
}

function parseBody(body) {
    if (!body) {
        return {};
    }

    if (typeof body === "string") {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
    }

    return body;
}

async function readPosts(config) {
    const stored = await kv.get(config.kvKey);

    if (stored === null || stored === undefined) {
        return [];
    }

    if (Array.isArray(stored)) {
        return stored;
    }

    try {
        const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function writePosts(config, posts) {
    await kv.set(config.kvKey, posts);
}

async function toHttpError(response, fallbackMessage) {
    let details = "";

    try {
        const payload = await response.json();
        details = payload?.message || "";
    } catch {
        details = "";
    }

    const message = details
        ? `${fallbackMessage} [${response.status}] (${details})`
        : `${fallbackMessage} [${response.status}]`;

    const error = new Error(message);
    error.status = response.status;
    return error;
}
