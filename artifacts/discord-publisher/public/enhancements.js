(() => {
    "use strict";

    const PROFILE_KEY = "publisher.lastProfile";
    const CATEGORY_KEY = "publisher.lastCategory";
    const WEBHOOK_KEY = "publisher.lastWebhook";
    const DRAFT_KEY = "publisher.messageDraft";
    let libraryProfiles = [];
    let libraryCategories = [];
    let activeCategory = "all";
    let health = null;

    const byId = id => document.getElementById(id);

    /**
     * Normalisation de recherche : minuscules, sans accents, espaces réduits.
     * « Adém » doit trouver « Adem », « {SM} » doit trouver « sm ».
     */
    const fold = value =>
        String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("fr")
            .replace(/[{}_[\]()]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    const escapeHtml = value => {
        const element = document.createElement("span");
        element.textContent = value ?? "";
        return element.innerHTML;
    };

    const escapeAttribute = value =>
        String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

    function init() {
        installFeedback();
        bindShortcuts();
        bindComposer();
        bindNavigation();
        bindSearch();
        installPublishTools();
        installDiagnostics();
        observeDynamicModals();
        observeBrokenImages();
        loadLibrary();
        loadMessageMetric();
        restoreDraft();
        syncComposerChannel();
        observeFeed();
    }

    // ==========================================
    // RETOURS D'ERREUR
    // ==========================================

    function installFeedback() {
        const region = byId("toastRegion");
        if (!region) return;
        window.publisherToast = (message, tone = "default") => {
            const toast = document.createElement("div");
            toast.className = `toast toast-${tone}`;
            toast.setAttribute("role", "status");
            toast.innerHTML = `<span class="toast-mark" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
            region.appendChild(toast);
            window.setTimeout(() => {
                toast.classList.add("is-leaving");
                window.setTimeout(() => toast.remove(), 220);
            }, tone === "warning" ? 7000 : 3400);
        };
        const nativeAlert = window.alert.bind(window);
        window.alert = message => {
            if (window.publisherToast) window.publisherToast(message, "error");
            else nativeAlert(message);
        };
        byId("publishButton")?.addEventListener("click", () => {
            const button = byId("publishButton");
            if (button && !button.disabled) {
                button.classList.add("is-pressing");
                window.setTimeout(() => button.classList.remove("is-pressing"), 420);
            }
        });
    }

    /** Une photo absente ne doit pas laisser une image cassée dans la grille. */
    function observeBrokenImages() {
        document.addEventListener(
            "error",
            event => {
                const image = event.target;
                if (!(image instanceof HTMLImageElement)) return;
                if (!image.closest(".quick-profile-avatar, .profile-card-avatar, .avatar, .dropdown-card-avatar")) return;
                const name = image.dataset.name || image.alt || "";
                image.replaceWith(initialBadge(name));
            },
            true,
        );
    }

    function initialBadge(name) {
        const span = document.createElement("span");
        span.className = "avatar-fallback";
        span.textContent = (String(name).trim().charAt(0) || "?").toUpperCase();
        return span;
    }

    // ==========================================
    // NAVIGATION ET RACCOURCIS
    // ==========================================

    function bindNavigation() {
        const goToComposer = () => {
            const composer = byId("messageInput");
            composer?.scrollIntoView({ behavior: "smooth", block: "center" });
            window.setTimeout(() => composer?.focus(), 350);
        };
        byId("heroPublishButton")?.addEventListener("click", goToComposer);
        ["openDirectoryButton", "sideDirectoryButton", "viewAllProfilesButton"].forEach(id => {
            byId(id)?.addEventListener("click", () => window.openProfileSelector?.());
        });
        byId("focusSearchButton")?.addEventListener("click", () => {
            const input = byId("profileQuickSearch");
            input?.focus();
            input?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        // Le bouton « Actualiser » du flux statique n'était relié à rien :
        // index.js ne pose l'écouteur que lorsqu'il crée lui-même la section.
        byId("refreshDiscordMessages")?.addEventListener("click", () => window.loadDiscordMessages?.());
    }

    function bindShortcuts() {
        document.addEventListener("keydown", event => {
            if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
                event.preventDefault();
                byId("profileQuickSearch")?.focus();
            }
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                byId("publishButton")?.click();
            }
        });
    }

    function bindComposer() {
        const input = byId("messageInput");
        if (!input) return;
        const status = byId("draftStatus");
        const length = byId("messageLength");
        const update = () => {
            if (length) length.textContent = input.value.length;
            window.clearTimeout(input._draftTimer);
            input._draftTimer = window.setTimeout(() => {
                localStorage.setItem(DRAFT_KEY, input.value);
                if (status) status.textContent = input.value ? "Brouillon sauvegardé" : "Nouveau brouillon";
            }, 280);
        };
        input.addEventListener("input", update);
        byId("clearDraftButton")?.addEventListener("click", () => {
            input.value = "";
            localStorage.removeItem(DRAFT_KEY);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.focus();
            window.publisherToast?.("Brouillon effacé");
        });
        update();
    }

    function restoreDraft() {
        const input = byId("messageInput");
        if (!input) return;
        const draft = localStorage.getItem(DRAFT_KEY);
        if (draft && !input.value) {
            input.value = draft;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }

    // ==========================================
    // RECHERCHE DE PROFILS
    // ==========================================

    /**
     * La recherche était morte : `#profileQuickSearch` n'avait aucun écouteur,
     * le filtre lisait donc sa valeur une seule fois, au chargement.
     */
    function bindSearch() {
        const input = byId("profileQuickSearch");
        const list = byId("recentProfiles");
        if (!input || !list) return;

        let timer = null;
        input.addEventListener("input", () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(renderQuickProfiles, 70);
        });
        input.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                input.value = "";
                renderQuickProfiles();
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                list.querySelector(".quick-profile")?.click();
                return;
            }
            if (event.key === "ArrowDown") {
                event.preventDefault();
                list.querySelector(".quick-profile")?.focus();
            }
        });
        list.addEventListener("keydown", event => {
            const buttons = [...list.querySelectorAll(".quick-profile")];
            const index = buttons.indexOf(document.activeElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = event.key === "ArrowDown" ? index + 1 : index - 1;
                (buttons[next] || input).focus();
            }
            if (event.key === "Escape") {
                event.preventDefault();
                input.focus();
            }
        });
    }

    async function loadLibrary() {
        const list = byId("recentProfiles");
        try {
            const [profilesResponse, categoriesResponse] = await Promise.all([
                fetch("/api/profiles", { cache: "no-store" }),
                fetch("/api/categories", { cache: "no-store" }),
            ]);
            if (!profilesResponse.ok) throw new Error("Bibliothèque indisponible");
            libraryProfiles = await profilesResponse.json();
            libraryCategories = categoriesResponse.ok ? await categoriesResponse.json() : [];
            byId("profileCount").textContent = libraryProfiles.length;
            byId("categoryCount").textContent = libraryCategories.length;
            renderCategoryFilters();
            renderQuickProfiles();
        } catch (error) {
            console.warn("Bibliothèque non disponible", error);
            byId("profileCount").textContent = "—";
            byId("categoryCount").textContent = "—";
            if (list) {
                list.innerHTML =
                    '<div class="panel-empty">Impossible de charger les profils.<br><button type="button" class="link-button" data-retry>Réessayer</button></div>';
                list.querySelector("[data-retry]")?.addEventListener("click", loadLibrary);
            }
        }
    }

    async function loadMessageMetric() {
        try {
            const response = await fetch("/api/discord/messages?limit=100", { cache: "no-store" });
            if (!response.ok) throw new Error("Messages indisponibles");
            const messages = await response.json();
            byId("messageCount").textContent = Array.isArray(messages) ? messages.length : "—";
            updateFeedSummary(Array.isArray(messages) ? messages.length : 0);
        } catch {
            byId("messageCount").textContent = "—";
        }
    }

    function renderCategoryFilters() {
        const row = byId("quickCategoryFilters");
        if (!row) return;
        const stored = fold(localStorage.getItem(CATEGORY_KEY) || "");
        if (stored && !libraryCategories.some(category => fold(category.name) === stored)) {
            activeCategory = "all";
        } else {
            activeCategory = localStorage.getItem(CATEGORY_KEY) || "all";
        }

        row.innerHTML = '<button class="filter-chip" type="button" data-category="all">Tous</button>';
        libraryCategories.forEach(category => {
            const button = document.createElement("button");
            button.className = "filter-chip";
            button.type = "button";
            button.dataset.category = category.name;
            button.textContent = category.name;
            row.appendChild(button);
        });
        row.querySelectorAll(".filter-chip").forEach(chip => {
            const isActive = fold(chip.dataset.category) === fold(activeCategory);
            chip.classList.toggle("is-active", isActive);
            chip.setAttribute("aria-pressed", String(isActive));
        });

        if (row.dataset.bound) return;
        row.dataset.bound = "1";
        row.addEventListener("click", event => {
            const button = event.target.closest(".filter-chip");
            if (!button) return;
            activeCategory = button.dataset.category || "all";
            if (activeCategory === "all") localStorage.removeItem(CATEGORY_KEY);
            else localStorage.setItem(CATEGORY_KEY, activeCategory);
            row.querySelectorAll(".filter-chip").forEach(item => {
                const isActive = item === button;
                item.classList.toggle("is-active", isActive);
                item.setAttribute("aria-pressed", String(isActive));
            });
            renderQuickProfiles();
        });
    }

    function matchesQuery(profile, tokens) {
        if (!tokens.length) return true;
        const haystack = fold(
            [profile.name, profile.category, profile.folder, profile.role, profile.verified ? "vérifié verifie" : ""].join(" "),
        );
        return tokens.every(token => haystack.includes(token));
    }

    function renderQuickProfiles() {
        const list = byId("recentProfiles");
        if (!list) return;
        const tokens = fold(byId("profileQuickSearch")?.value).split(" ").filter(Boolean);
        const filtered = libraryProfiles.filter(profile => {
            const matchesCategory = activeCategory === "all" || fold(profile.category) === fold(activeCategory);
            return matchesCategory && matchesQuery(profile, tokens);
        });

        updateSearchSummary(filtered.length, tokens.length > 0);

        if (!filtered.length) {
            list.innerHTML = `<div class="panel-empty">
                <strong>Aucun profil ne correspond.</strong>
                <span>${tokens.length ? "Essaie un autre nom, une catégorie ou un rôle." : "Cette catégorie est vide."}</span>
                <button type="button" class="link-button" data-create>Tout afficher</button>
            </div>`;
            list.querySelector("[data-create]")?.addEventListener("click", () => {
                activeCategory = "all";
                localStorage.removeItem(CATEGORY_KEY);
                const input = byId("profileQuickSearch");
                if (input) input.value = "";
                renderCategoryFilters();
                renderQuickProfiles();
            });
            return;
        }

        list.innerHTML = filtered
            .slice(0, 7)
            .map(profile => {
                const avatar = profile.avatar
                    ? `<img src="${escapeAttribute(profile.avatar)}?v=${encodeURIComponent(
                          profile.avatarUpdatedAt || profile.createdAt || "",
                      )}" alt="" loading="lazy" data-name="${escapeAttribute(profile.name)}">`
                    : initialBadge(profile.name).outerHTML;
                return `<button type="button" class="quick-profile" data-profile="${escapeAttribute(profile.folder)}">
                    <span class="quick-profile-avatar">${avatar}</span>
                    <span class="quick-profile-copy">
                        <span class="quick-profile-name">${escapeHtml(profile.name)}${
                            profile.verified ? ' <span class="verified-badge">✓</span>' : ""
                        }</span>
                        <span class="quick-profile-category">${escapeHtml(profile.category || "Sans catégorie")}${
                            profile.avatar ? "" : ' · <span class="photo-missing">sans photo</span>'
                        }</span>
                    </span>
                    <span class="quick-profile-arrow">↗</span>
                </button>`;
            })
            .join("");

        list.querySelectorAll(".quick-profile").forEach(button => {
            button.addEventListener("click", () => chooseProfileFromLibrary(button.dataset.profile));
        });
    }

    function updateSearchSummary(count, searching) {
        const summary = byId("quickSearchCount");
        if (!summary) return;
        if (searching) {
            summary.textContent = `${count} résultat${count === 1 ? "" : "s"}`;
            summary.hidden = false;
            return;
        }
        summary.hidden = true;
    }

    async function chooseProfileFromLibrary(folder) {
        localStorage.setItem(PROFILE_KEY, folder);
        window.openProfileSelector?.();
        await waitFor(() => document.querySelector(".profile-modal"));
        const modal = document.querySelector(".profile-modal");
        const card = modal?.querySelector(`.profile-card[data-folder="${CSS.escape(folder)}"]`);
        card?.querySelector(".profile-select-button")?.click();
    }

    // ==========================================
    // MODALES
    // ==========================================

    function observeDynamicModals() {
        const observer = new MutationObserver(mutations => {
            mutations
                .flatMap(mutation => [...mutation.addedNodes])
                .forEach(node => {
                    if (!(node instanceof HTMLElement)) return;
                    if (node.matches(".modal")) enhanceModal(node);
                    node.querySelectorAll?.(".modal").forEach(enhanceModal);
                });
        });
        observer.observe(document.body, { childList: true });

        document.addEventListener("click", event => {
            const tab = event.target.closest(".category-tab");
            if (tab && tab.dataset.category) {
                activeCategory = tab.dataset.category;
                if (tab.dataset.category !== "all") localStorage.setItem(CATEGORY_KEY, tab.dataset.category);
            }
            const selected = event.target.closest(".profile-select-button");
            if (selected) {
                const folder = selected.closest(".profile-card")?.dataset.folder;
                if (folder) localStorage.setItem(PROFILE_KEY, folder);
            }
            const webhook = event.target.closest(".webhook-option");
            if (webhook?.dataset.folder) localStorage.setItem(WEBHOOK_KEY, webhook.dataset.folder);
        });
    }

    function enhanceModal(modal) {
        if (!modal.querySelector(".profile-modal")) return;
        const toolbar = modal.querySelector(".profile-modal-toolbar");
        if (!toolbar || toolbar.querySelector(".profile-search-row")) return;
        const row = document.createElement("div");
        row.className = "profile-search-row";
        row.innerHTML = `<label class="search-field">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.7"></circle><path d="m16 16 5 5"></path></svg>
                <input class="profile-search-input" type="search" placeholder="Filtrer par nom, catégorie ou rôle..." autocomplete="off">
                <span class="search-count" hidden></span>
            </label>`;
        toolbar.prepend(row);

        const input = row.querySelector("input");
        const count = row.querySelector(".search-count");
        const apply = () => filterModalProfiles(modal, input.value, count);
        input.addEventListener("input", apply);
        input.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                input.value = "";
                apply();
            }
        });

        const remembered = localStorage.getItem(CATEGORY_KEY);
        if (remembered) {
            window.setTimeout(
                () => modal.querySelector(`.category-tab[data-category="${CSS.escape(remembered)}"]`)?.click(),
                20,
            );
        }
    }

    function filterModalProfiles(modal, query, count) {
        const tokens = fold(query).split(" ").filter(Boolean);
        let visible = 0;
        modal.querySelectorAll(".profile-card").forEach(card => {
            const matches = tokens.every(token => fold(card.dataset.search || card.textContent).includes(token));
            card.hidden = !matches;
            if (matches) visible += 1;
        });
        if (count) {
            count.hidden = !tokens.length;
            count.textContent = `${visible}`;
        }
        let empty = modal.querySelector(".profiles-grid .search-empty");
        if (!visible && tokens.length) {
            if (!empty) {
                empty = document.createElement("div");
                empty.className = "empty-profiles search-empty";
                empty.textContent = "Aucun profil ne correspond à cette recherche.";
                modal.querySelector(".profiles-grid")?.appendChild(empty);
            }
        } else {
            empty?.remove();
        }
    }

    // ==========================================
    // TEST DU RÉGLAGE (SANS PUBLIER)
    // ==========================================

    function installPublishTools() {
        const row = document.querySelector(".publish-row");
        if (!row || byId("testPublishButton")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.id = "testPublishButton";
        button.className = "subtle-button test-publish";
        button.textContent = "Tester le réglage";
        row.insertBefore(button, byId("publishButton") || row.lastElementChild);
        button.addEventListener("click", testPublish);
    }

    /**
     * Vérifie webhook + profil + photo côté serveur, sans écrire dans le salon.
     * C'est le contrôle qui manquait pour comprendre une photo absente.
     */
    async function testPublish() {
        const state = window.currentPublisherState?.();
        if (!state?.webhook) return window.publisherToast?.("Sélectionne un salon (webhook).", "error");
        if (!state?.profile) return window.publisherToast?.("Sélectionne un profil.", "error");

        const button = byId("testPublishButton");
        if (button) button.disabled = true;
        try {
            const form = new FormData();
            form.append("webhookFolder", state.webhook.folder);
            form.append("profileFolder", state.profile.folder);
            form.append("message", "test");
            form.append("dryRun", "1");
            // L'origine de la page est l'adresse que Discord devra joindre pour
            // récupérer la photo : c'est la plus fiable, elle est déjà utilisée.
            form.append("publicBase", window.location.origin);
            const response = await fetch("/api/publish", { method: "POST", body: form });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Réglage refusé.");
            window.publisherToast?.(data.message, "success");
            if (data.avatarWarning) window.publisherToast?.(data.avatarWarning, "warning");
            else setAvatarLink(data.avatarUrl);
        } catch (error) {
            window.publisherToast?.(error.message, "error");
        } finally {
            if (button) button.disabled = false;
        }
    }

    // ==========================================
    // SANTÉ DES DONNÉES ET IMPORT
    // ==========================================

    function installDiagnostics() {
        const side = document.querySelector(".workspace-side");
        if (!side || byId("diagnosticsPanel")) return;
        const panel = document.createElement("section");
        panel.className = "side-panel diagnostics-panel";
        panel.id = "diagnosticsPanel";
        panel.innerHTML = `
            <div class="side-panel-heading">
                <div>
                    <span class="section-kicker">SANTÉ DES DONNÉES</span>
                    <h2>Ce que le serveur voit</h2>
                </div>
                <button class="icon-button small-icon-button" id="diagnosticsRefresh" type="button" title="Revérifier" aria-label="Revérifier les données">⟳</button>
            </div>
            <div class="diagnostics-metrics" id="diagnosticsMetrics">
                <div class="diagnostic-metric"><strong>—</strong><span>profils</span></div>
                <div class="diagnostic-metric"><strong>—</strong><span>photos</span></div>
                <div class="diagnostic-metric"><strong>—</strong><span>catégories</span></div>
            </div>
            <p class="diagnostics-photo" id="diagnosticsPhoto">Vérification des photos…</p>
            <a class="diagnostics-avatar-link" id="diagnosticsAvatarLink" hidden target="_blank" rel="noreferrer">
                Photo telle que Discord la téléchargera →
            </a>
            <details class="diagnostics-details" id="diagnosticsDetails" hidden>
                <summary id="diagnosticsDetailsSummary"></summary>
                <ul id="diagnosticsDetailsList"></ul>
            </details>
            <div class="diagnostics-actions">
                <label class="diagnostics-import" id="diagnosticsImportLabel">
                    <input type="file" id="diagnosticsImport" accept=".zip,application/zip" hidden>
                    <span>Importer data.zip</span>
                </label>
                <span class="diagnostics-progress" id="diagnosticsProgress" hidden>Import en cours…</span>
            </div>
            <p class="diagnostics-hint">Reprise de l'ancien site : les entrées déjà présentes sont conservées, les nouvelles sont ajoutées.</p>
        `;
        side.insertBefore(panel, side.querySelector(".tip-panel"));

        byId("diagnosticsRefresh")?.addEventListener("click", () => loadDiagnostics(true));
        byId("diagnosticsImport")?.addEventListener("change", event => importArchive(event.target.files?.[0]));
        window.publisherAvatarPreview = setAvatarLink;
        loadDiagnostics();
    }

    /**
     * Affiche l'URL exacte que Discord va télécharger : la cliquer permet de
     * constater soi-même si l'image est joignable depuis l'extérieur.
     */
    function setAvatarLink(url) {
        const link = byId("diagnosticsAvatarLink");
        if (!link || !url) return;
        link.href = url;
        link.hidden = false;
        link.title = url;
    }

    async function loadDiagnostics(showToast = false) {
        try {
            const response = await fetch("/api/publisher/health", { cache: "no-store" });
            if (!response.ok) throw new Error("Diagnostic indisponible");
            health = await response.json();
            renderDiagnostics();
            if (showToast) window.publisherToast?.("Données revérifiées");
        } catch (error) {
            const photo = byId("diagnosticsPhoto");
            if (photo) photo.textContent = "Diagnostic indisponible : l'API ne répond pas.";
            if (showToast) window.publisherToast?.("Diagnostic indisponible", "error");
        }
    }

    function renderDiagnostics() {
        if (!health) return;
        const { counts, avatars, skipped, repaired } = health;
        const metrics = byId("diagnosticsMetrics");
        if (metrics) {
            metrics.innerHTML = `
                <div class="diagnostic-metric"><strong>${counts.profiles}</strong><span>profils</span></div>
                <div class="diagnostic-metric"><strong>${counts.withPhoto}</strong><span>photos</span></div>
                <div class="diagnostic-metric"><strong>${counts.categories}</strong><span>catégories</span></div>
            `;
        }

        const photo = byId("diagnosticsPhoto");
        if (photo) {
            if (avatars.canSend) {
                const host = (avatars.baseUrl || "").replace(/^https?:\/\//, "");
                photo.className = "diagnostics-photo is-ok";
                photo.innerHTML = `<span class="status-dot"></span> Photos livrables à Discord${host ? ` <em>via ${escapeHtml(host)}</em>` : ""}`;
            } else {
                photo.className = "diagnostics-photo is-warning";
                photo.innerHTML = `<strong>Photos non livrées à Discord.</strong><span>${escapeHtml(
                    avatars.reason || "Adresse publique introuvable.",
                )}</span>`;
            }
        }

        const ignored = [
            ...(skipped.profiles || []).map(item => ({ ...item, kind: "profil" })),
            ...(skipped.categories || []).map(item => ({ ...item, kind: "catégorie" })),
            ...(skipped.webhooks || []).map(item => ({ ...item, kind: "webhook" })),
            ...(repaired.profiles || []).map(item => ({ ...item, kind: "profil réparé" })),
            ...(repaired.categories || []).map(item => ({ ...item, kind: "catégorie réparée" })),
        ];
        const details = byId("diagnosticsDetails");
        const summary = byId("diagnosticsDetailsSummary");
        const list = byId("diagnosticsDetailsList");
        if (details && summary && list) {
            details.hidden = !ignored.length;
            summary.textContent = `${ignored.length} entrée${ignored.length === 1 ? "" : "s"} à vérifier`;
            list.innerHTML = ignored
                .map(
                    item =>
                        `<li><strong>${escapeHtml(item.folder)}</strong><span>${escapeHtml(item.reason)}</span></li>`,
                )
                .join("");
        }
    }

    async function importArchive(file) {
        if (!file) return;
        const label = byId("diagnosticsImportLabel");
        const progress = byId("diagnosticsProgress");
        const input = byId("diagnosticsImport");
        if (label) label.classList.add("is-busy");
        if (progress) progress.hidden = false;

        try {
            const form = new FormData();
            form.append("archive", file);
            const response = await fetch("/api/publisher/import", { method: "POST", body: form });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Import refusé.");

            const counts = payload.report?.counts || {};
            window.publisherToast?.(
                `Import terminé : ${counts.profiles || 0} profil(s), ${counts.avatars || 0} photo(s), ` +
                    `${counts.categories || 0} catégorie(s).`,
            );

            if (payload.skipped?.length) {
                window.publisherToast?.(
                    `${payload.skipped.length} dossier(s) non exploitable(s) — voir « Santé des données ».`,
                    "warning",
                );
            }

            await Promise.all([loadLibrary(), loadDiagnostics(), refreshMainLibrary()]);
        } catch (error) {
            window.publisherToast?.(error.message, "error");
        } finally {
            if (label) label.classList.remove("is-busy");
            if (progress) progress.hidden = true;
            if (input) input.value = "";
        }
    }

    /** Le sélecteur principal (index.js) garde sa propre liste : on la recharge. */
    async function refreshMainLibrary() {
        if (typeof window.loadProfiles !== "function") return;
        await window.loadProfiles();
        if (typeof window.renderProfile === "function") window.renderProfile();
    }

    // ==========================================
    // FLUX
    // ==========================================

    function syncComposerChannel() {
        const source = byId("webhookName");
        const destination = byId("composerChannel");
        if (!source || !destination) return;
        const update = () => {
            destination.textContent =
                source.textContent === "Aucun webhook" ? "salon sélectionné" : source.textContent;
        };
        update();
        new MutationObserver(update).observe(source, { childList: true, characterData: true, subtree: true });
    }

    function observeFeed() {
        const feed = byId("discordMessages");
        if (!feed) return;
        new MutationObserver(() => {
            const count = feed.querySelectorAll(".discord-message").length;
            byId("messageCount").textContent = count;
            updateFeedSummary(count);
        }).observe(feed, { childList: true });
    }

    function updateFeedSummary(count) {
        const summary = byId("messageFeedSummary");
        if (summary) summary.textContent = `${count} message${count === 1 ? "" : "s"} récent${count === 1 ? "" : "s"}`;
    }

    function waitFor(predicate, timeout = 1200) {
        return new Promise(resolve => {
            const started = Date.now();
            const check = () => {
                if (predicate()) return resolve(true);
                if (Date.now() - started > timeout) return resolve(false);
                window.setTimeout(check, 30);
            };
            check();
        });
    }

    document.addEventListener("DOMContentLoaded", init);
})();
