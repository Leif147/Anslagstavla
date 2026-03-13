const STORAGE_KEY = "digital-anslagstavla-posts-v1";

// Configure window.APP_CONFIG before this script loads if you want custom settings.
const APP_CONFIG = window.APP_CONFIG ?? {};
const STORAGE_MODE = String(APP_CONFIG.storageMode ?? "backend-api").toLowerCase();
const BACKEND_CONFIG = {
    endpoint: String(APP_CONFIG.backendApi?.endpoint ?? APP_CONFIG.backend?.endpoint ?? "").trim()
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
    const backendApiStorage = createBackendApiStorage();

    if (backendApiStorage) {
        return backendApiStorage;
    }

    if (STORAGE_MODE !== "backend-api" && STORAGE_MODE !== "backend") {
        console.warn(`Okänt storageMode \"${STORAGE_MODE}\". Faller tillbaka till lokal lagring.`);
    }

    return createLocalStorageAdapter(
        "Lagring: Lokalt (Backend API saknar konfiguration).",
        "warning"
    );
}

function createBackendApiStorage() {
    const endpoint = BACKEND_CONFIG.endpoint;

    if (!endpoint) {
        return null;
    }

    return {
        statusText: "Lagring: Backend API (säker skrivning utan PAT i frontend).",
        statusLevel: "success",
        async loadPosts() {
            const response = await fetch(endpoint, {
                method: "GET",
                headers: {
                    Accept: "application/json"
                }
            });

            if (!response.ok) {
                throw await createHttpError(response, "Kunde inte läsa data via Backend API");
            }

            const payload = await response.json();
            const postsData = Array.isArray(payload) ? payload : payload?.posts;
            return Array.isArray(postsData) ? postsData : [];
        },
        async savePosts(nextPosts) {
            const response = await fetch(endpoint, {
                method: "PUT",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ posts: nextPosts })
            });

            if (!response.ok) {
                throw await createHttpError(response, "Kunde inte spara data via Backend API");
            }
        }
    };
}

async function createHttpError(response, fallbackMessage) {
    let details = "";

    try {
        const payload = await response.json();
        details = payload?.message || "";
    } catch {
        details = "";
    }

    if (response.status === 401) {
        const reason = details || "Unauthorized";
        return new Error(
            `${fallbackMessage} [401] (${reason}). Token är ogiltig/återkallad eller felkopierad.`
        );
    }

    if (response.status === 403) {
        const reason = details || "Forbidden";
        return new Error(
            `${fallbackMessage} [403] (${reason}). Kontrollera token-behörighet: Contents = Read and write.`
        );
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
