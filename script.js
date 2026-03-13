const STORAGE_KEY = "digital-anslagstavla-posts-v1";

// Configure window.APP_CONFIG before this script loads if you want custom settings.
const APP_CONFIG = window.APP_CONFIG ?? {};
const STORAGE_MODE = String(APP_CONFIG.storageMode ?? "gitrows").toLowerCase();
const GITROWS_CONFIG = {
    path: APP_CONFIG.gitrows?.path ?? "",
    method: APP_CONFIG.gitrows?.method ?? "pull",
    user: APP_CONFIG.gitrows?.user ?? "",
    token: APP_CONFIG.gitrows?.token ?? ""
};

const postForm = document.getElementById("post-form");
const formTitle = document.getElementById("form-title");
const editingIdInput = document.getElementById("editing-id");
const titleInput = document.getElementById("title");
const descriptionInput = document.getElementById("description");
const categoryInput = document.getElementById("category");
const priorityInput = document.getElementById("priority");
const initialsInput = document.getElementById("initials");
const saveButton = document.getElementById("save-button");
const cancelEditButton = document.getElementById("cancel-edit");
const postList = document.getElementById("post-list");
const postCount = document.getElementById("post-count");
const filterCategoryInput = document.getElementById("filter-category");
const filterPriorityInput = document.getElementById("filter-priority");
const resetFiltersButton = document.getElementById("reset-filters");
const filterStatus = document.getElementById("filter-status");
const storageStatus = document.getElementById("storage-status");

let posts = [];
let storage = null;

postForm.addEventListener("submit", onSubmitPost);
cancelEditButton.addEventListener("click", resetFormMode);
filterCategoryInput.addEventListener("change", renderPosts);
filterPriorityInput.addEventListener("change", renderPosts);
resetFiltersButton.addEventListener("click", resetFilters);

init();

async function init() {
    storage = await createStorageAdapter();
    setStorageStatus(storage.statusText, storage.statusLevel);

    try {
        posts = await storage.loadPosts();
    } catch (error) {
        console.error(error);
        posts = [];
        setStorageStatus("Lagring: Fel vid inläsning av data.", "warning");
        window.alert("Kunde inte läsa in poster från valt lagringsläge.");
    }

    renderPosts();
}

async function onSubmitPost(event) {
    event.preventDefault();

    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();
    const category = categoryInput.value.trim();
    const priority = priorityInput.value;
    const initials = sanitizeInitials(initialsInput.value);

    if (!title || !description || !category) {
        window.alert("Fyll i rubrik, beskrivning och kategori.");
        return;
    }

    if (!initials) {
        window.alert("Ange giltiga initialer.");
        return;
    }

    const editingId = editingIdInput.value;
    let nextPosts = [];

    if (editingId) {
        nextPosts = posts.map((post) => {
            if (post.id !== editingId) {
                return post;
            }

            return {
                ...post,
                title,
                description,
                category,
                priority,
                updatedBy: initials,
                updatedAt: Date.now()
            };
        });
    } else {
        nextPosts = [
            {
            id: createId(),
            title,
            description,
            category,
            priority,
            createdBy: initials,
            createdAt: Date.now(),
            updatedBy: "",
            updatedAt: null,
            completed: false,
            completedBy: "",
            completedAt: null
            },
            ...posts
        ];
    }

    const wasSaved = await persistPosts(nextPosts);

    if (!wasSaved) {
        return;
    }

    renderPosts();
    postForm.reset();
    resetFormMode();
}

function renderPosts() {
    postList.innerHTML = "";

    refreshCategoryFilterOptions();

    const categoryFilter = filterCategoryInput.value;
    const priorityFilter = filterPriorityInput.value;
    updateResetFiltersState(categoryFilter, priorityFilter);

    const filteredPosts = posts.filter((post) => {
        const categoryMatch = !categoryFilter || post.category === categoryFilter;
        const priorityMatch = !priorityFilter || post.priority === priorityFilter;
        return categoryMatch && priorityMatch;
    });

    const sortedPosts = [...filteredPosts].sort((a, b) => {
        if (a.completed !== b.completed) {
            return Number(a.completed) - Number(b.completed);
        }

        return b.createdAt - a.createdAt;
    });

    if (!sortedPosts.length) {
        const emptyState = document.createElement("p");
        emptyState.className = "empty-state";
        emptyState.textContent = posts.length
            ? "Inga poster matchar valt filter."
            : "Inga poster ännu. Lägg till den första posten ovan.";
        postList.appendChild(emptyState);
        updatePostCount(sortedPosts);
        return;
    }

    for (const post of sortedPosts) {
        const card = document.createElement("article");
        card.className = `post-card${post.completed ? " completed" : ""}`;

        const topRow = document.createElement("div");
        topRow.className = "post-top-row";

        const title = document.createElement("h3");
        title.className = "post-title";
        title.textContent = post.title;

        const statusBadge = document.createElement("span");
        statusBadge.className = `badge ${post.completed ? "status-done" : "status-open"}`;
        statusBadge.textContent = post.completed ? "Avbockad" : "Öppen";

        topRow.append(title, statusBadge);

        const description = document.createElement("p");
        description.className = "post-description";
        description.textContent = post.description;

        const tags = document.createElement("div");
        tags.className = "tag-row";

        const categoryTag = document.createElement("span");
        categoryTag.className = "badge tag";
        categoryTag.textContent = `Kategori: ${post.category}`;

        const priorityTag = document.createElement("span");
        const priorityClass = post.priority.toLowerCase();
        priorityTag.className = `badge priority-${priorityClass}`;
        priorityTag.textContent = post.priority;

        tags.append(categoryTag, priorityTag);

        const signatureList = document.createElement("ul");
        signatureList.className = "signature-list";

        addSignatureLine(
            signatureList,
            `Skapad av ${post.createdBy} (${formatTimestamp(post.createdAt)})`
        );

        if (post.updatedBy && post.updatedAt) {
            addSignatureLine(
                signatureList,
                `Senast redigerad av ${post.updatedBy} (${formatTimestamp(post.updatedAt)})`
            );
        }

        if (post.completedBy && post.completedAt) {
            addSignatureLine(
                signatureList,
                `Avbockad av ${post.completedBy} (${formatTimestamp(post.completedAt)})`
            );
        }

        const actions = document.createElement("div");
        actions.className = "post-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "ghost";
        editButton.textContent = "Redigera";
        editButton.addEventListener("click", () => setEditMode(post.id));

        const completeButton = document.createElement("button");
        completeButton.type = "button";

        if (post.completed) {
            completeButton.textContent = "Klar";
            completeButton.className = "done-button";
            completeButton.disabled = true;
        } else {
            completeButton.textContent = "Bocka av";
            completeButton.className = "complete-button";
            completeButton.addEventListener("click", () => markPostAsComplete(post.id));
        }

        actions.append(editButton, completeButton);

        if (post.completed) {
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "delete-button";
            deleteButton.textContent = "Ta bort";
            deleteButton.addEventListener("click", () => deletePost(post.id));
            actions.appendChild(deleteButton);
        }

        card.append(topRow, description, tags, signatureList, actions);
        postList.appendChild(card);
    }

    updatePostCount(sortedPosts);
}

function setEditMode(postId) {
    const post = posts.find((item) => item.id === postId);

    if (!post) {
        return;
    }

    editingIdInput.value = post.id;
    titleInput.value = post.title;
    descriptionInput.value = post.description;
    categoryInput.value = post.category;
    priorityInput.value = post.priority;
    initialsInput.value = "";

    formTitle.textContent = "Redigera post";
    saveButton.textContent = "Spara ändring";
    cancelEditButton.classList.remove("hidden");

    titleInput.focus();
}

function resetFormMode() {
    editingIdInput.value = "";
    formTitle.textContent = "Ny post";
    saveButton.textContent = "Lägg till post";
    cancelEditButton.classList.add("hidden");
}

async function markPostAsComplete(postId) {
    const initialsPrompt = window.prompt("Ange dina initialer för att bocka av posten:", "");

    if (initialsPrompt === null) {
        return;
    }

    const initials = sanitizeInitials(initialsPrompt);

    if (!initials) {
        window.alert("Ange giltiga initialer.");
        return;
    }

    const nextPosts = posts.map((post) => {
        if (post.id !== postId) {
            return post;
        }

        return {
            ...post,
            completed: true,
            completedBy: initials,
            completedAt: Date.now()
        };
    });

    const wasSaved = await persistPosts(nextPosts);

    if (!wasSaved) {
        return;
    }

    renderPosts();
}

async function deletePost(postId) {
    const post = posts.find((item) => item.id === postId);

    if (!post) {
        return;
    }

    if (!post.completed) {
        window.alert("Du kan bara ta bort poster som är avbockade.");
        return;
    }

    const shouldDelete = window.confirm(`Ta bort posten \"${post.title}\" permanent?`);

    if (!shouldDelete) {
        return;
    }

    const nextPosts = posts.filter((item) => item.id !== postId);
    const wasSaved = await persistPosts(nextPosts);

    if (!wasSaved) {
        return;
    }

    if (editingIdInput.value === postId) {
        postForm.reset();
        resetFormMode();
    }

    renderPosts();
}

async function persistPosts(nextPosts) {
    try {
        await storage.savePosts(nextPosts);
        posts = nextPosts;
        return true;
    } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Okänt fel.";
        window.alert(`Kunde inte spara ändringen. ${message}`);
        return false;
    }
}

function updatePostCount(visiblePosts = posts) {
    const openPosts = visiblePosts.filter((post) => !post.completed).length;

    if (visiblePosts.length === posts.length) {
        postCount.textContent = `${posts.length} poster (${openPosts} öppna)`;
        return;
    }

    postCount.textContent = `${visiblePosts.length} av ${posts.length} poster (${openPosts} öppna)`;
}

function refreshCategoryFilterOptions() {
    const categories = [...new Set(posts.map((post) => post.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "sv")
    );
    const previousValue = filterCategoryInput.value;

    filterCategoryInput.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Alla kategorier";
    filterCategoryInput.appendChild(allOption);

    for (const category of categories) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        filterCategoryInput.appendChild(option);
    }

    filterCategoryInput.value = categories.includes(previousValue) ? previousValue : "";
}

function resetFilters() {
    filterCategoryInput.value = "";
    filterPriorityInput.value = "";
    renderPosts();
}

function updateResetFiltersState(categoryFilter, priorityFilter) {
    const hasActiveFilters = Boolean(categoryFilter || priorityFilter);
    resetFiltersButton.disabled = !hasActiveFilters;

    if (hasActiveFilters) {
        const activeFilters = [];

        if (categoryFilter) {
            activeFilters.push(`Kategori: ${categoryFilter}`);
        }

        if (priorityFilter) {
            activeFilters.push(`Prioritet: ${priorityFilter}`);
        }

        filterStatus.textContent = `Aktiva filter: ${activeFilters.join(", ")}`;
        filterStatus.classList.add("active");
        return;
    }

    filterStatus.textContent = "";
    filterStatus.classList.remove("active");
}

function addSignatureLine(parent, text) {
    const item = document.createElement("li");
    item.textContent = text;
    parent.appendChild(item);
}

function sanitizeInitials(value) {
    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-ZÅÄÖ0-9]/g, "")
        .slice(0, 6);
}

function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString("sv-SE", {
        dateStyle: "short",
        timeStyle: "short"
    });
}

async function createStorageAdapter() {
    if (STORAGE_MODE === "gitrows") {
        try {
            const gitrowsStorage = await createGitrowsStorage();

            if (gitrowsStorage) {
                return gitrowsStorage;
            }
        } catch (error) {
            console.warn("GitRows init misslyckades.", error);
        }

        const githubApiStorage = createGithubApiStorage();

        if (githubApiStorage) {
            return githubApiStorage;
        }

        return createLocalStorageAdapter(
            "Lagring: Lokalt (varken GitRows eller GitHub API kunde initieras).",
            "warning"
        );
    }

    return createLocalStorageAdapter("Lagring: Lokalt i webbläsaren.", "neutral");
}

async function createGitrowsStorage() {
    const GitrowsConstructor = await ensureGitrowsLibrary();

    if (!GitrowsConstructor) {
        console.warn("GitRows-biblioteket kunde inte laddas från CDN.");
        return null;
    }

    if (!GITROWS_CONFIG.path) {
        console.warn("GitRows path saknas. Ange APP_CONFIG.gitrows.path.");
        return null;
    }

    const client = new GitrowsConstructor();
    const options = {};

    if (GITROWS_CONFIG.user) {
        options.user = GITROWS_CONFIG.user;
    }

    if (GITROWS_CONFIG.token) {
        options.token = GITROWS_CONFIG.token;
    }

    client.options(options);

    return {
        statusText: "Lagring: GitRows (synkat mot GitHub).",
        statusLevel: "success",
        async loadPosts() {
            const data = await client.get(
                GITROWS_CONFIG.path,
                undefined,
                GITROWS_CONFIG.method
            );
            return Array.isArray(data) ? data : [];
        },
        async savePosts(nextPosts) {
            if (!GITROWS_CONFIG.user || !GITROWS_CONFIG.token) {
                throw new Error(
                    "GitRows kräver user och token för skrivning. Uppdatera APP_CONFIG.gitrows."
                );
            }

            await client.replace(GITROWS_CONFIG.path, nextPosts);
        }
    };
}

function createGithubApiStorage() {
    const parsedPath = parseGitrowsPath(GITROWS_CONFIG.path);

    if (!parsedPath) {
        console.warn("Kunde inte tolka path för GitHub API fallback.");
        return null;
    }

    const { owner, repo, branch, filePath } = parsedPath;
    const encodedPath = encodeRepoPath(filePath);
    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
    const baseHeaders = {
        Accept: "application/vnd.github+json"
    };

    if (GITROWS_CONFIG.token) {
        baseHeaders.Authorization = `Bearer ${GITROWS_CONFIG.token}`;
    }

    return {
        statusText: "Lagring: GitHub API (fallback utan GitRows).",
        statusLevel: "success",
        async loadPosts() {
            const response = await fetch(`${fileUrl}?ref=${encodeURIComponent(branch)}`, {
                headers: baseHeaders
            });

            if (response.status === 404) {
                return [];
            }

            if (!response.ok) {
                throw await createHttpError(
                    response,
                    "Kunde inte läsa data via GitHub API"
                );
            }

            const payload = await response.json();

            if (!payload.content) {
                return [];
            }

            const decoded = decodeBase64Utf8(payload.content);
            const parsed = JSON.parse(decoded);
            return Array.isArray(parsed) ? parsed : [];
        },
        async savePosts(nextPosts) {
            if (!GITROWS_CONFIG.token) {
                throw new Error("Token saknas för skrivning via GitHub API.");
            }

            let currentSha = undefined;
            const readResponse = await fetch(`${fileUrl}?ref=${encodeURIComponent(branch)}`, {
                headers: baseHeaders
            });

            if (readResponse.ok) {
                const existing = await readResponse.json();
                currentSha = existing.sha;
            } else if (readResponse.status !== 404) {
                throw await createHttpError(
                    readResponse,
                    "Kunde inte verifiera befintlig data via GitHub API"
                );
            }

            const body = {
                message: `Update posts ${new Date().toISOString()}`,
                content: encodeBase64Utf8(JSON.stringify(nextPosts, null, 2)),
                branch
            };

            if (currentSha) {
                body.sha = currentSha;
            }

            const writeResponse = await fetch(fileUrl, {
                method: "PUT",
                headers: {
                    ...baseHeaders,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });

            if (!writeResponse.ok) {
                throw await createHttpError(
                    writeResponse,
                    "Kunde inte spara data via GitHub API"
                );
            }
        }
    };
}

function parseGitrowsPath(path) {
    if (!path || typeof path !== "string") {
        return null;
    }

    const match = path
        .trim()
        .match(/^@?github\/([^\/]+)\/([^:\/]+)(?::([^\/]+))?\/(.+)$/i);

    if (!match) {
        return null;
    }

    return {
        owner: match[1],
        repo: match[2],
        branch: match[3] || "main",
        filePath: match[4].replace(/^\/+/, "")
    };
}

function encodeRepoPath(path) {
    return path
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/");
}

function encodeBase64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

function decodeBase64Utf8(base64) {
    const normalized = String(base64).replace(/\s+/g, "");
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

async function createHttpError(response, fallbackMessage) {
    let details = "";

    try {
        const payload = await response.json();
        details = payload?.message || "";
    } catch {
        details = "";
    }

    return new Error(
        details
            ? `${fallbackMessage} [${response.status}] (${details})`
            : `${fallbackMessage} [${response.status}]`
    );
}

function createLocalStorageAdapter(statusText, statusLevel) {
    return {
        statusText,
        statusLevel,
        async loadPosts() {
            try {
                const rawPosts = localStorage.getItem(STORAGE_KEY);

                if (!rawPosts) {
                    return [];
                }

                const parsedPosts = JSON.parse(rawPosts);
                return Array.isArray(parsedPosts) ? parsedPosts : [];
            } catch {
                return [];
            }
        },
        async savePosts(nextPosts) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPosts));
        }
    };
}

function setStorageStatus(text, level) {
    if (!storageStatus) {
        return;
    }

    storageStatus.textContent = text;
    storageStatus.classList.remove("success", "warning");

    if (level === "success" || level === "warning") {
        storageStatus.classList.add(level);
    }
}

async function ensureGitrowsLibrary() {
    const existingConstructor = resolveGitrowsConstructor();

    if (existingConstructor) {
        return existingConstructor;
    }

    const sources = [
        "https://cdn.jsdelivr.net/npm/gitrows@0.9.0/dist/gitrows.min.js",
        "https://unpkg.com/gitrows@0.9.0/dist/gitrows.min.js"
    ];

    for (const source of sources) {
        try {
            await loadScript(source);

            const loadedConstructor = resolveGitrowsConstructor();

            if (loadedConstructor) {
                return loadedConstructor;
            }
        } catch (error) {
            console.warn(`Kunde inte ladda GitRows från ${source}.`, error);
        }
    }

    return null;
}

function resolveGitrowsConstructor() {
    if (typeof window.Gitrows === "function") {
        return window.Gitrows;
    }

    if (typeof globalThis.Gitrows === "function") {
        return globalThis.Gitrows;
    }

    if (typeof Gitrows === "function") {
        return Gitrows;
    }

    return null;
}

function loadScript(source) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = source;
        script.async = true;
        script.addEventListener("load", () => resolve(), { once: true });
        script.addEventListener(
            "error",
            () => reject(new Error(`Kunde inte ladda script: ${source}`)),
            { once: true }
        );

        document.head.appendChild(script);
    });
}