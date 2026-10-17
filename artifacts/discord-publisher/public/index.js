let profiles = [];

let webhooks = [];

let categories = [];

let selectedProfile = null;

let selectedWebhook = null;

let selectedImages = [

    null,

    null,

    null,

    null

];

let discordMessages = [];

// Stockage de la cible de modération sélectionnée

let selectedModerationTargetFolder = null;

let moderationCategoryFilter = "all";

let moderationSearchQuery = "";

const PROFILE_ROLE_LABELS = {

    membre: "Membre",

    modo: "Modo",

    SM: "SM",

    Admin: "Admin"

};

const MODERATION_ROLES = new Set([

    "modo",

    "SM",

    "Admin"

]);

function normalizeProfileRole(role) {

    const normalized = String(role || "")

        .trim()

        .toLowerCase();

    return {

        membre: "membre",

        modo: "modo",

        sm: "SM",

        admin: "Admin"

    }[normalized] || "membre";

}

function profileRoleLabel(role) {

    return PROFILE_ROLE_LABELS[normalizeProfileRole(role)];

}

// ==========================================

// INITIALISATION

// ==========================================

document.addEventListener(

    "DOMContentLoaded",

    async () => {

        await loadProfiles();

        await loadWebhooks();

        await loadCategories();

        setupProfiles();

        setupWebhooks();

        setupImages();

        setupPublish();

        setupModeration();

        renderProfile();

        renderWebhook();

        renderImages();

        // Discord

        setupDiscordMessages();

        await loadDiscordMessages();

        // Actualisation automatique

        setInterval(

            loadDiscordMessages,

            5000

        );

    }

);

// ==========================================

// CHARGEMENT

// ==========================================

async function loadProfiles() {

    try {

        const response = await fetch("/api/profiles");

        if (!response.ok) {

            throw new Error("Impossible de charger les profils.");

        }

        profiles = await response.json();

        if (profiles.length) {

            // Dernier profil utilisé : mémorisé sur cet appareil, il évite de
            // repasser par le sélecteur à chaque ouverture.
            const saved = localStorage.getItem("publisher.lastProfile");

            selectedProfile = profiles.find(profile => profile.folder === saved) || profiles[0];

        }

    } catch (error) {

        console.error("Erreur profils :", error);

    }

}

async function loadWebhooks() {

    try {

        const response = await fetch("/api/webhooks");

        if (!response.ok) {

            throw new Error("Impossible de charger les webhooks.");

        }

        webhooks = await response.json();

        if (webhooks.length) {

            const saved = localStorage.getItem("publisher.lastWebhook");

            selectedWebhook = webhooks.find(webhook => webhook.folder === saved) || webhooks[0];

        }

    } catch (error) {

        console.error("Erreur webhooks :", error);

    }

}

async function loadCategories() {

    try {

        const response = await fetch("/api/categories");

        if (!response.ok) {

            throw new Error("Impossible de charger les catégories.");

        }

        categories = await response.json();

    } catch (error) {

        console.error("Erreur catégories :", error);

    }

}

// ==========================================

// DISCORD — RÉCUPÉRATION DES MESSAGES

// ==========================================

async function loadDiscordMessages() {

    try {

        const response = await fetch("/api/discord/messages?limit=100", {

            cache: "no-store"

        });

        if (!response.ok) {

            throw new Error("Impossible de récupérer les messages Discord.");

        }

        const data = await response.json();

        if (!Array.isArray(data)) {

            return;

        }

        discordMessages = data;

        renderDiscordMessages();

    } catch (error) {

        console.error("Erreur récupération messages Discord :", error);

    }

}

// ==========================================

// INTERFACE MESSAGES DISCORD

// ==========================================

function setupDiscordMessages() {

    const app = document.querySelector(".app");

    if (!app || document.getElementById("discordMessagesSection")) {

        return;

    }

    const section = document.createElement("section");

    section.className = "section";

    section.id = "discordMessagesSection";

    section.innerHTML = `

        <div class="section-header">

            <div>

                <div class="section-title">Messages Discord</div>

                <div class="section-description">Messages récupérés depuis Discord</div>

            </div>

            <button id="refreshDiscordMessages" class="btn btn-secondary" type="button">

                Actualiser

            </button>

        </div>

        <div id="discordMessages" class="discord-messages">

            <div class="discord-loading">Chargement des messages...</div>

        </div>

    `;

    app.appendChild(section);

    document.getElementById("refreshDiscordMessages").onclick = loadDiscordMessages;

}

// ==========================================

// AFFICHAGE DES MESSAGES DISCORD

// ==========================================

function renderDiscordMessages() {

    const container = document.getElementById("discordMessages");

    if (!container) return;

    if (!discordMessages.length) {

        container.innerHTML = `

            <div class="discord-empty">

                <div class="discord-empty-icon">#</div>

                <div>Aucun message récupéré.</div>

            </div>

        `;

        return;

    }

    container.innerHTML = "";

    discordMessages.forEach(message => {

        const element = document.createElement("div");

        element.className = "discord-message";

        let avatarHTML = `<div class="discord-avatar"><span>?</span></div>`;

        if (message.authorAvatar) {

            avatarHTML = `

                <div class="discord-avatar">

                    <img src="${escapeAttribute(message.authorAvatar)}" alt="" onerror="this.parentElement.innerHTML='<span>?</span>'">

                </div>

            `;

        }

        let dateText = "";

        if (message.timestamp) {

            const date = new Date(message.timestamp);

            if (!Number.isNaN(date.getTime())) {

                dateText = date.toLocaleString("fr-FR", {

                    day: "2-digit",

                    month: "2-digit",

                    year: "numeric",

                    hour: "2-digit",

                    minute: "2-digit"

                });

            }

        }

        const content = escapeHtml(message.content || "");

        let attachmentsHTML = "";

        if (Array.isArray(message.attachments) && message.attachments.length) {

            attachmentsHTML = `

                <div class="discord-attachments">

                    ${message.attachments.map(attachment => {

                        const url = attachment.url || attachment.proxyURL || "";

                        if (!url) return "";

                        const type = attachment.contentType || "";

                        const isImage = type.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp)$/i.test(url);

                        if (isImage) {

                            return `

                                <a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">

                                    <img class="discord-attachment-image" src="${escapeAttribute(url)}" alt="" loading="lazy">

                                </a>

                            `;

                        }

                        return `

                            <a class="discord-attachment-file" href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">

                                ${escapeHtml(attachment.name || "Fichier")}

                            </a>

                        `;

                    }).join("")}

                </div>

            `;

        }

        let channelHTML = "";

        if (message.channelName) {

            channelHTML = `<span class="discord-channel">#${escapeHtml(message.channelName)}</span>`;

        }

        element.innerHTML = `

            ${avatarHTML}

            <div class="discord-message-body">

                <div class="discord-message-header">

                    <strong class="discord-author">${escapeHtml(message.authorName || "Utilisateur")}</strong>

                    ${channelHTML}

                    <span class="discord-date">${escapeHtml(dateText)}</span>

                </div>

                ${content ? `<div class="discord-content">${content}</div>` : ""}

                ${attachmentsHTML}

            </div>

        `;

        container.appendChild(element);

    });

}

// ==========================================

// PROFILS

// ==========================================

function setupProfiles() {

    const addBtn = document.getElementById("addProfileButton");

    if (addBtn) addBtn.onclick = () => openProfileModal();

    const selector = document.getElementById("profileSelector");

    if (selector) selector.onclick = openProfileSelector;

}

function openProfileSelector() {

    const modal = document.createElement("div");

    modal.className = "modal";

    modal.innerHTML = `

        <div class="modal-content profile-modal">

            <div class="modal-header">

                <div>

                    <div class="modal-title">Choisir un profil</div>

                    <div class="modal-description">Sélectionne l'identité à utiliser</div>

                </div>

                <button class="modal-close" id="closeProfiles" type="button">×</button>

            </div>

            <div class="profile-modal-toolbar">

                <div class="category-tabs" id="profileCategoryTabs">

                    <button class="category-tab active" data-category="all" type="button">Tous</button>

                </div>

                <div class="profile-toolbar-actions">

                    <button id="newCategoryFromSelector" class="btn btn-secondary" type="button">+ Catégorie</button>

                    <button id="newProfileFromSelector" class="btn btn-primary" type="button">+ Profil</button>

                </div>

            </div>

            <div id="profilesGrid" class="profiles-grid"></div>

        </div>

    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector("#closeProfiles");

    if (closeBtn) closeBtn.onclick = () => modal.remove();

    const newProfileBtn = modal.querySelector("#newProfileFromSelector");

    if (newProfileBtn) {

        newProfileBtn.onclick = () => {

            modal.remove();

            openProfileModal();

        };

    }

    const newCategoryBtn = modal.querySelector("#newCategoryFromSelector");

    if (newCategoryBtn) {

        newCategoryBtn.onclick = async () => {

            const name = prompt("Nom de la nouvelle catégorie :");

            if (name === null) return;

            const categoryName = name.trim();

            if (!categoryName) {

                alert("Le nom de la catégorie est obligatoire.");

                return;

            }

            try {

                const response = await fetch("/api/categories", {

                    method: "POST",

                    headers: { "Content-Type": "application/json" },

                    body: JSON.stringify({ name: categoryName })

                });

                const data = await response.json();

                if (!response.ok) {

                    throw new Error(data.error || "Impossible de créer la catégorie.");

                }

                categories.push(data.category);

                rebuildCategoryTabs(modal);

                const tabs = modal.querySelector(".category-tabs");

                tabs.querySelectorAll(".category-tab").forEach(tab => tab.classList.remove("active"));

                const newTab = tabs.querySelector(`[data-category="${CSS.escape(data.category.name)}"]`);

                if (newTab) newTab.classList.add("active");

                renderProfilesGrid(modal, data.category.name);

            } catch (error) {

                console.error("Erreur création catégorie :", error);

                alert(error.message);

            }

        };

    }

    rebuildCategoryTabs(modal);

    renderProfilesGrid(modal, "all");

}

function rebuildCategoryTabs(modal) {

    const tabs = modal.querySelector(".category-tabs");

    if (!tabs) return;

    tabs.innerHTML = `<button class="category-tab active" data-category="all" type="button">Tous</button>`;

    categories.forEach(category => {

        const button = document.createElement("button");

        button.className = "category-tab";

        button.type = "button";

        button.dataset.category = category.name;

        button.textContent = category.name;

        button.onclick = () => {

            tabs.querySelectorAll(".category-tab").forEach(tab => tab.classList.remove("active"));

            button.classList.add("active");

            renderProfilesGrid(modal, category.name);

        };

        tabs.appendChild(button);

    });

    const allButton = tabs.querySelector('[data-category="all"]');

    if (allButton) {

        allButton.onclick = () => {

            tabs.querySelectorAll(".category-tab").forEach(tab => tab.classList.remove("active"));

            allButton.classList.add("active");

            renderProfilesGrid(modal, "all");

        };

    }

}

function renderProfilesGrid(modal, category) {

    const grid = modal.querySelector("#profilesGrid");

    if (!grid) return;

    grid.innerHTML = "";

    let filtered = profiles;

    if (category !== "all") {

        filtered = profiles.filter(profile => profile.category === category);

    }

    if (!filtered.length) {

        grid.innerHTML = `<div class="empty-profiles">

            <strong>${category === "all" ? "Aucun profil pour l'instant." : "Aucun profil dans cette catégorie."}</strong>

            <span>Importe data.zip depuis « Santé des données », ou crée une identité.</span>

            <button type="button" class="link-button" id="emptyCreateProfile">Créer un profil</button>

        </div>`;

        grid.querySelector("#emptyCreateProfile").onclick = () => {

            modal.remove();

            openProfileModal();

        };

        return;

    }

    filtered.forEach(profile => {

        const card = document.createElement("div");

        card.className = "profile-card";

        card.dataset.folder = profile.folder;

        card.dataset.search = [

            profile.name,

            profile.category,

            profile.folder,

            profileRoleLabel(profile.role),

            profile.verified ? "vérifié" : ""

        ].join(" ");

        card.innerHTML = `

            <div class="profile-card-avatar">

                ${

                    profile.avatar

                        ? `<img src="${profile.avatar}?v=${encodeURIComponent(profile.avatarUpdatedAt || "")}" alt="" loading="lazy" data-name="${escapeAttribute(profile.name)}">`

                        : `<span>${escapeHtml(profile.name.charAt(0).toUpperCase())}</span>`

                }

            </div>

            <div class="profile-card-name">

                ${escapeHtml(profile.name)}

                ${profile.verified ? `<span class="verified-badge">✓</span>` : ""}

            </div>

            ${

                profile.category

                    ? `<div class="profile-card-category">${escapeHtml(profile.category)}</div>`

                    : `<div class="profile-card-category empty">Sans catégorie</div>`

            }

            ${profile.avatar ? "" : `<div class="profile-card-warning">Photo manquante — Discord affichera le nom seul</div>`}

            <span class="profile-role-badge role-${normalizeProfileRole(profile.role)}">

                ${escapeHtml(profileRoleLabel(profile.role))}

            </span>

            <div class="profile-card-actions">

                <button class="profile-select-button" type="button">Sélectionner</button>

                <button class="profile-edit-button" type="button">Modifier</button>

            </div>

        `;

        card.querySelector(".profile-select-button").onclick = () => {

            selectedProfile = profile;

            renderProfile();

            renderModerationPanel();

            modal.remove();

        };

        card.querySelector(".profile-edit-button").onclick = () => {

            modal.remove();

            openProfileModal(profile);

        };

        grid.appendChild(card);

    });

}

// ==========================================

// CRÉATION / MODIFICATION PROFIL

// ==========================================

function openProfileModal(profile = null) {

    const editing = Boolean(profile);

    const modal = document.createElement("div");

    modal.className = "modal";

    modal.innerHTML = `

        <div class="modal-content">

            <div class="modal-header">

                <div>

                    <div class="modal-title">${editing ? "Modifier le profil" : "Nouveau profil"}</div>

                    <div class="modal-description">${editing ? "Modifie les informations du profil" : "Crée une nouvelle identité"}</div>

                </div>

                <button class="modal-close" id="closeProfileModal" type="button">×</button>

            </div>

            <label class="form-label">Nom du profil</label>

            <input id="profileNameInput" class="form-input" type="text" maxlength="50" placeholder="Ex : Astan News" value="${editing ? escapeAttribute(profile.name) : ""}">

            

            <label class="form-label">Photo de profil</label>

            <div id="avatarUpload" class="avatar-upload">

                <div id="avatarPreview" class="avatar large-avatar">

                    ${editing && profile.avatar ? `<img src="${profile.avatar}?v=${Date.now()}">` : "+"}

                </div>

                <div>

                    <strong>Choisir une image</strong>

                    <small>Laisser vide pour conserver l'image actuelle</small>

                </div>

                <input id="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" hidden>

            </div>

            <label class="form-label">Catégorie</label>

            <select id="profileCategory" class="form-input">

                <option value="">Sans catégorie</option>

                ${categories.map(category => `

                    <option value="${escapeAttribute(category.name)}" ${editing && profile.category === category.name ? "selected" : ""}>

                        ${escapeHtml(category.name)}

                    </option>

                `).join("")}

            </select>

            <label class="form-label">Rôle RP</label>

            <select id="profileRole" class="form-input">

                ${Object.entries(PROFILE_ROLE_LABELS).map(([value, label]) => `

                    <option value="${value}" ${normalizeProfileRole(editing ? profile.role : "membre") === value ? "selected" : ""}>

                        ${label}

                    </option>

                `).join("")}

            </select>

            <label class="verified-option">

                <input id="profileVerified" type="checkbox" ${editing && profile.verified ? "checked" : ""}>

                <span class="checkmark"></span>

                <span>Profil vérifié</span>

                <span class="verified-badge">✓</span>

            </label>

            <div class="modal-actions">

                <button id="cancelProfile" class="btn btn-secondary" type="button">Annuler</button>

                <button id="saveProfile" class="btn btn-primary" type="button">${editing ? "Enregistrer" : "Créer le profil"}</button>

            </div>

        </div>

    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();

    document.getElementById("closeProfileModal").onclick = close;

    document.getElementById("cancelProfile").onclick = close;

    const avatarInput = document.getElementById("avatarInput");

    const avatarPreview = document.getElementById("avatarPreview");

    document.getElementById("avatarUpload").onclick = () => avatarInput.click();

    avatarInput.onchange = () => {

        const file = avatarInput.files[0];

        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {

            avatarPreview.innerHTML = `<img src="${reader.result}">`;

        };

        reader.readAsDataURL(file);

    };

    document.getElementById("saveProfile").onclick = async () => {

        const name = document.getElementById("profileNameInput").value.trim();

        const category = document.getElementById("profileCategory").value;

        const verified = document.getElementById("profileVerified").checked;

        const role = document.getElementById("profileRole").value;

        if (!name) {

            alert("Entre un nom.");

            return;

        }

        const formData = new FormData();

        formData.append("name", name);

        formData.append("category", category);

        formData.append("verified", verified);

        formData.append("role", role);

        if (avatarInput.files[0]) {

            formData.append("avatar", avatarInput.files[0]);

        }

        let url = "/api/profiles";

        let method = "POST";

        if (editing) {

            url = `/api/profiles/${encodeURIComponent(profile.folder)}`;

            method = "PUT";

        }

        const response = await fetch(url, { method, body: formData });

        const data = await response.json();

        if (!response.ok) {

            alert(data.error || "Une erreur est survenue.");

            return;

        }

        if (editing) {

            const index = profiles.findIndex(p => p.folder === profile.folder);

            if (index !== -1) profiles[index] = data.profile;

            if (selectedProfile && selectedProfile.id === profile.id) selectedProfile = data.profile;

        } else {

            profiles.push(data.profile);

            selectedProfile = data.profile;

        }

        renderProfile();

        renderModerationPanel();

        modal.remove();

    };

}

// ==========================================

// PROFIL SÉLECTIONNÉ

// ==========================================

function renderProfile() {

    const name = document.getElementById("profileName");

    const status = document.getElementById("profileStatus");

    const avatar = document.getElementById("profileAvatar");

    if (!name || !status || !avatar) return;

    if (!selectedProfile) {

        name.textContent = "Aucun profil";

        status.textContent = "Sélectionner un profil";

        avatar.innerHTML = "<span>?</span>";

        return;

    }

    name.innerHTML = escapeHtml(selectedProfile.name) + (selectedProfile.verified ? `<span class="verified-badge">✓</span>` : "");

    status.textContent = `${profileRoleLabel(selectedProfile.role)} · ${selectedProfile.category || "Sans catégorie"}`;

    if (selectedProfile.avatar) {

        avatar.innerHTML = `<img src="${escapeAttribute(selectedProfile.avatar)}?v=${encodeURIComponent(selectedProfile.avatarUpdatedAt || "")}" alt="" data-name="${escapeAttribute(selectedProfile.name)}">`;

    } else {

        avatar.innerHTML = `<span>${escapeHtml(selectedProfile.name.charAt(0).toUpperCase())}</span>`;

    }

}

// ==========================================

// WEBHOOKS

// ==========================================

function setupWebhooks() {

    const addBtn = document.getElementById("addWebhookButton");

    if (addBtn) addBtn.onclick = openWebhookModal;

    const selector = document.getElementById("webhookSelector");

    if (selector) selector.onclick = openWebhookSelector;

}

function renderWebhook() {

    const name = document.getElementById("webhookName");

    const status = document.getElementById("webhookStatus");

    if (!name || !status) return;

    if (!selectedWebhook) {

        name.textContent = "Aucun webhook";

        status.textContent = "Sélectionner un salon";

        return;

    }

    name.textContent = selectedWebhook.name;

    status.textContent = "Webhook sélectionné";

}

function openWebhookSelector() {

    if (!webhooks.length) {

        openWebhookModal();

        return;

    }

    const modal = document.createElement("div");

    modal.className = "modal";

    modal.innerHTML = `

        <div class="modal-content">

            <div class="modal-header">

                <div>

                    <div class="modal-title">Choisir un webhook</div>

                </div>

                <button class="modal-close" id="closeWebhooks" type="button">×</button>

            </div>

            <div class="profiles-list">

                ${webhooks.map(webhook => `

                    <div class="profile-option webhook-option" data-folder="${escapeAttribute(webhook.folder)}">

                        <div class="webhook-icon">#</div>

                        <div class="profile-info">

                            <div class="profile-name">${escapeHtml(webhook.name)}</div>

                            <div class="profile-status">Webhook Discord</div>

                        </div>

                    </div>

                `).join("")}

            </div>

        </div>

    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById("closeWebhooks");

    if (closeBtn) closeBtn.onclick = () => modal.remove();

    modal.querySelectorAll(".webhook-option").forEach(option => {

        option.onclick = () => {

            selectedWebhook = webhooks.find(webhook => webhook.folder === option.dataset.folder);

            renderWebhook();

            modal.remove();

        };

    });

}

function openWebhookModal() {

    const modal = document.createElement("div");

    modal.className = "modal";

    modal.innerHTML = `

        <div class="modal-content">

            <div class="modal-header">

                <div>

                    <div class="modal-title">Nouveau webhook</div>

                </div>

                <button class="modal-close" id="closeWebhook" type="button">×</button>

            </div>

            <label class="form-label">Nom</label>

            <input id="webhookNameInput" class="form-input" placeholder="Ex : Astan News">

            

            <label class="form-label">URL du webhook</label>

            <input id="webhookUrlInput" class="form-input" type="password" placeholder="https://discord.com/api/webhooks/...">

            

            <div class="modal-actions">

                <button id="cancelWebhook" class="btn btn-secondary" type="button">Annuler</button>

                <button id="saveWebhook" class="btn btn-primary" type="button">Enregistrer</button>

            </div>

        </div>

    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();

    document.getElementById("closeWebhook").onclick = close;

    document.getElementById("cancelWebhook").onclick = close;

    document.getElementById("saveWebhook").onclick = async () => {

        const name = document.getElementById("webhookNameInput").value.trim();

        const url = document.getElementById("webhookUrlInput").value.trim();

        if (!name || !url) {

            alert("Remplis tous les champs.");

            return;

        }

        const response = await fetch("/api/webhooks", {

            method: "POST",

            headers: { "Content-Type": "application/json" },

            body: JSON.stringify({ name, url })

        });

        const data = await response.json();

        if (!response.ok) {

            alert(data.error || "Erreur.");

            return;

        }

        webhooks.push(data.webhook);

        selectedWebhook = data.webhook;

        renderWebhook();

        modal.remove();

    };

}

// ==========================================

// IMAGES

// ==========================================

function setupImages() {

    document.querySelectorAll(".image-slot").forEach((slot, index) => {

        slot.onclick = () => {

            const input = document.createElement("input");

            input.type = "file";

            input.accept = "image/*";

            input.onchange = () => {

                const file = input.files[0];

                if (!file) return;

                selectedImages[index] = file;

                renderImages();

            };

            input.click();

        };

    });

}

function renderImages() {

    document.querySelectorAll(".image-slot").forEach((slot, index) => {

        const file = selectedImages[index];

        if (!file) {

            slot.innerHTML = "+";

            return;

        }

        const url = URL.createObjectURL(file);

        slot.innerHTML = `<img src="${url}">`;

    });

}

// ==========================================

// MODÉRATION RP

// ==========================================

function setupModeration() {

    const pubTab = document.getElementById("publishingTab");

    const modTab = document.getElementById("moderationTab");

    const muteBtn = document.getElementById("muteProfileButton");

    const banBtn = document.getElementById("banProfileButton");

    if (pubTab) pubTab.onclick = () => activateWorkspace("publishing");

    if (modTab) modTab.onclick = () => activateWorkspace("moderation");

    if (muteBtn) muteBtn.onclick = () => submitModeration("mute");

    if (banBtn) banBtn.onclick = () => submitModeration("ban");

    // Fermeture du menu déroulant au clic à l'extérieur

    document.addEventListener("click", (e) => {

        const dropdown = document.querySelector(".custom-dropdown");

        const menu = document.getElementById("moderationDropdownMenu");

        if (dropdown && menu && !dropdown.contains(e.target)) {

            menu.hidden = true;

        }

    });

}

function activateWorkspace(workspace) {

    const isModeration = workspace === "moderation";

    const pubWs = document.getElementById("publishingWorkspace");

    const modWs = document.getElementById("moderationWorkspace");

    if (pubWs) pubWs.hidden = isModeration;

    if (modWs) modWs.hidden = !isModeration;

    const publishingTab = document.getElementById("publishingTab");

    const moderationTab = document.getElementById("moderationTab");

    if (publishingTab) {

        publishingTab.classList.toggle("is-active", !isModeration);

        publishingTab.setAttribute("aria-selected", String(!isModeration));

    }

    if (moderationTab) {

        moderationTab.classList.toggle("is-active", isModeration);

        moderationTab.setAttribute("aria-selected", String(isModeration));

    }

    if (isModeration) {

        renderModerationPanel();

    }

}

function renderModerationPanel() {

    const locked = document.getElementById("moderationLocked");

    const panel = document.getElementById("moderationPanel");

    if (!locked || !panel) return;

    const canModerate = selectedProfile && MODERATION_ROLES.has(normalizeProfileRole(selectedProfile.role));

    locked.hidden = Boolean(canModerate);

    panel.hidden = !canModerate;

    if (!canModerate) return;

    // Informations du modérateur

    const actor = document.getElementById("moderationActor");

    const actorRole = document.getElementById("moderationActorRole");

    const actorAvatar = document.getElementById("moderationActorAvatar");

    if (actor) actor.textContent = selectedProfile.name;

    if (actorRole) actorRole.textContent = profileRoleLabel(selectedProfile.role);

    if (actorAvatar) {

        actorAvatar.innerHTML = selectedProfile.avatar

            ? `<img src="${escapeAttribute(selectedProfile.avatar)}?v=${Date.now()}" alt="">`

            : escapeHtml(selectedProfile.name.charAt(0).toUpperCase());

    }

    const targetContainer = document.getElementById("moderationTarget");

    if (!targetContainer) return;

    // HTML de la grille déroulante (Custom Dropdown)

    targetContainer.innerHTML = `

        <div class="custom-dropdown">

            <button id="moderationDropdownTrigger" class="dropdown-trigger" type="button">

                <span id="moderationSelectedTargetText">Sélectionner un profil...</span>

                <span class="dropdown-arrow">▼</span>

            </button>

            <div id="moderationDropdownMenu" class="dropdown-menu" hidden>

                <div class="dropdown-search-wrapper">

                    <input 

                        type="text" 

                        id="moderationSearchInput" 

                        class="form-input" 

                        placeholder="Rechercher..." 

                        value="${escapeAttribute(moderationSearchQuery)}"

                    >

                </div>

                <div class="category-tabs" id="moderationCategoryTabs">

                    <button class="category-tab ${moderationCategoryFilter === 'all' ? 'active' : ''}" data-category="all" type="button">Tous</button>

                    ${categories.map(cat => `

                        <button class="category-tab ${moderationCategoryFilter === cat.name ? 'active' : ''}" data-category="${escapeAttribute(cat.name)}" type="button">

                            ${escapeHtml(cat.name)}

                        </button>

                    `).join('')}

                </div>

                <div id="moderationTargetsGrid" class="dropdown-grid"></div>

            </div>

        </div>

    `;

    const trigger = document.getElementById("moderationDropdownTrigger");

    const menu = document.getElementById("moderationDropdownMenu");

    if (trigger && menu) {

        trigger.onclick = (e) => {

            e.stopPropagation();

            menu.hidden = !menu.hidden;

        };

    }

    // Recherche

    const searchInput = targetContainer.querySelector("#moderationSearchInput");

    if (searchInput) {

        searchInput.oninput = (e) => {

            moderationSearchQuery = e.target.value.toLowerCase().trim();

            updateModerationGrid();

        };

        searchInput.onclick = (e) => e.stopPropagation();

    }

    // Onglets de catégories

    const catTabs = targetContainer.querySelectorAll("#moderationCategoryTabs .category-tab");

    catTabs.forEach(tab => {

        tab.onclick = (e) => {

            e.stopPropagation();

            catTabs.forEach(t => t.classList.remove("active"));

            tab.classList.add("active");

            moderationCategoryFilter = tab.dataset.category;

            updateModerationGrid();

        };

    });

    updateModerationGrid();

}

function updateModerationGrid() {

    const grid = document.getElementById("moderationTargetsGrid");

    const selectedText = document.getElementById("moderationSelectedTargetText");

    const menu = document.getElementById("moderationDropdownMenu");

    if (!grid) return;

    let availableTargets = profiles.filter(p => p.folder !== selectedProfile.folder);

    if (moderationCategoryFilter !== "all") {

        availableTargets = availableTargets.filter(p => p.category === moderationCategoryFilter);

    }

    if (moderationSearchQuery) {

        availableTargets = availableTargets.filter(p => p.name.toLowerCase().includes(moderationSearchQuery));

    }

    if (!availableTargets.length) {

        grid.innerHTML = `<div class="dropdown-empty" style="grid-column: 1 / -1; text-align: center; padding: 12px;">Aucun profil trouvé.</div>`;

        if (selectedText) selectedText.textContent = "Aucun profil disponible";

        selectedModerationTargetFolder = null;

        return;

    }

    if (!selectedModerationTargetFolder || !availableTargets.some(p => p.folder === selectedModerationTargetFolder)) {

        selectedModerationTargetFolder = availableTargets[0].folder;

    }

    grid.innerHTML = "";

    availableTargets.forEach(profile => {

        const isSelected = profile.folder === selectedModerationTargetFolder;

        const card = document.createElement("div");

        card.className = `dropdown-card ${isSelected ? 'selected' : ''}`;

        card.innerHTML = `

            <div class="dropdown-card-avatar">

                ${

                    profile.avatar

                        ? `<img src="${escapeAttribute(profile.avatar)}?v=${Date.now()}">`

                        : `<span>${escapeHtml(profile.name.charAt(0).toUpperCase())}</span>`

                }

            </div>

            <div class="dropdown-card-name">

                ${escapeHtml(profile.name)} ${profile.verified ? '✓' : ''}

            </div>

            <span class="dropdown-card-role">${escapeHtml(profileRoleLabel(profile.role))}</span>

        `;

        card.onclick = (e) => {

            e.stopPropagation();

            selectedModerationTargetFolder = profile.folder;

            if (selectedText) {

                selectedText.textContent = profile.name;

            }

            if (menu) menu.hidden = true;

            updateModerationGrid();

        };

        grid.appendChild(card);

    });

    const currentSelected = profiles.find(p => p.folder === selectedModerationTargetFolder);

    if (currentSelected && selectedText) {

        selectedText.textContent = currentSelected.name;

    }

}

async function submitModeration(action) {

    if (!selectedProfile || !MODERATION_ROLES.has(normalizeProfileRole(selectedProfile.role))) {

        alert("Les membres ne peuvent pas utiliser la modération RP.");

        return;

    }

    if (!selectedWebhook) {

        alert("Sélectionne un webhook dans l'espace Publication avant d'envoyer l'action.");

        return;

    }

    if (!selectedModerationTargetFolder) {

        alert("Sélectionne un profil à modérer.");

        return;

    }

    const muteBtn = document.getElementById("muteProfileButton");

    const banBtn = document.getElementById("banProfileButton");

    const buttons = [muteBtn, banBtn].filter(Boolean);

    buttons.forEach(button => { button.disabled = true; });

    try {

        const reasonInput = document.getElementById("moderationReason");

        const reason = reasonInput ? reasonInput.value.trim() : "";

        const response = await fetch("/api/moderation", {

            method: "POST",

            headers: { "Content-Type": "application/json" },

            body: JSON.stringify({

                action,

                webhookFolder: selectedWebhook.folder,

                moderatorFolder: selectedProfile.folder,

                publicBase: window.location.origin,

                targetProfileFolder: selectedModerationTargetFolder,

                reason

            })

        });

        const data = await response.json();

        if (!response.ok) {

            throw new Error(data.error || "Impossible d'envoyer l'action de modération.");

        }

        if (reasonInput) reasonInput.value = "";

        alert(`✓ ${data.message}`);

        await loadDiscordMessages();

    } catch (error) {

        alert(error.message);

    } finally {

        buttons.forEach(button => { button.disabled = false; });

    }

}

// ==========================================

// PUBLICATION

// ==========================================

function setupPublish() {

    const btn = document.getElementById("publishButton");

    if (btn) btn.onclick = publish;

}

async function publish() {

    if (!selectedWebhook) {

        alert("Sélectionne un webhook.");

        return;

    }

    if (!selectedProfile) {

        alert("Sélectionne un profil.");

        return;

    }

    const msgInput = document.getElementById("messageInput");

    const message = msgInput ? msgInput.value.trim() : "";

    if (!message && !selectedImages.some(Boolean)) {

        alert("Ajoute un message ou une image.");

        return;

    }

    const button = document.getElementById("publishButton");

    if (button) {

        // Le libellé contient une flèche stylée : réécrire `textContent` la
        // détruisait définitivement. On ne touche qu'à l'état visuel.
        button.disabled = true;

        button.classList.add("is-busy");

    }

    const notify = (text, tone) =>

        typeof window.publisherToast === "function" ? window.publisherToast(text, tone) : alert(text);

    try {

        const formData = new FormData();

        formData.append("webhookFolder", selectedWebhook.folder);

        formData.append("profileFolder", selectedProfile.folder);

        formData.append("message", message);

        // Origine réelle de la page : Discord doit pouvoir télécharger la photo

        // de profil depuis cette adresse (HTTP/HTTPS et nom d'hôte exacts).

        formData.append("publicBase", window.location.origin);

        selectedImages.filter(Boolean).forEach(file => formData.append("images", file));

        const response = await fetch("/api/publish", {

            method: "POST",

            body: formData

        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {

            throw new Error(data.error || "Erreur de publication.");

        }

        notify("Publication envoyée sur Discord.", "success");

        // La photo n'est pas toujours livrable (pas d'adresse publique) :

        // le message part quand même, mais on dit pourquoi l'avatar manque.

        if (data.avatarWarning) notify(data.avatarWarning, "warning");

        // Photo réellement transmise à Discord : vérifiable dans « Santé des données ».

        if (data.avatarUrl) window.publisherAvatarPreview?.(data.avatarUrl);

        if (msgInput) msgInput.value = "";

        localStorage.removeItem("publisher.messageDraft");

        const length = document.getElementById("messageLength");

        if (length) length.textContent = "0";

        const draftStatus = document.getElementById("draftStatus");

        if (draftStatus) draftStatus.textContent = "Nouveau brouillon";

        selectedImages = [null, null, null, null];

        renderImages();

        await loadDiscordMessages();

    } catch (error) {

        notify(error.message || "Publication impossible.", "error");

    } finally {

        if (button) {

            button.disabled = false;

            button.classList.remove("is-busy");

        }

    }

}

// ==========================================

// OUTILS

// ==========================================

/** Sélection courante, pour les outils de l'interface (test de réglage). */

function currentPublisherState() {

    return { profile: selectedProfile, webhook: selectedWebhook };

}

function escapeHtml(text) {

    const div = document.createElement("div");

    div.textContent = text ?? "";

    return div.innerHTML;

}

function escapeAttribute(text) {

    return String(text ?? "")

        .replace(/&/g, "&amp;")

        .replace(/"/g, "&quot;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;");

}

