"use strict";

/* =========================================================
   MERCATO ANALYSER — interface du portail

   L'analyse tourne côté serveur (elle dure plusieurs minutes) :
   cette page ne fait que lancer le job, suivre sa progression et
   afficher le rapport enregistré.
========================================================= */

const state = {
    report: null,
    job: null,
    pollTimer: null,
    filter: { query: "", club: "", type: "all" },
    expanded: new Set(),
};

const TYPE_LABELS = {
    transfert: "Transfert",
    "prêt": "Prêt",
    retour: "Retour",
    libre: "Libre",
    autre: "Autre",
};

const byId = id => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function fold(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function toast(message, tone = "info") {
    const region = byId("toastRegion");
    if (!region) return;
    const element = document.createElement("div");
    element.className = `toast${tone === "error" ? " is-error" : ""}`;
    element.textContent = message;
    region.appendChild(element);
    window.setTimeout(() => element.remove(), 5200);
}

async function api(path, options) {
    const response = await fetch(path, { cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || data.message || `Erreur ${response.status}`);
    }
    return data;
}

// ==========================================
// FORMATAGE
// ==========================================

function shortDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}

function longDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function monthKey(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ==========================================
// STATUT DU SERVEUR
// ==========================================

async function loadStatus() {
    try {
        const status = await api("/api/mercato/status");
        renderConfig(status);
        if (status.report) {
            byId("messagesFact").textContent = status.report.analyzedMessages || status.report.messageCount || "—";
            byId("transfersFact").textContent = status.report.transfers;
            byId("lastRunBadge").textContent = shortDate(status.report.generatedAt);
        }
        if (status.job) {
            state.job = status.job;
            renderJob(status.job);
            if (status.job.state === "fetching" || status.job.state === "analyzing") {
                pollJob(status.job.id);
            }
        }
        setConnection(status.configured, status.job);
        if (!state.report && status.report) {
            await loadReport();
        }
    } catch (error) {
        setConnection(null, null);
        console.warn("Statut mercato indisponible", error);
    }
}

function setConnection(configured, job) {
    const dot = byId("statusDot");
    const label = byId("statusLabel");
    if (!dot || !label) return;
    dot.className = "status-dot";
    if (job && (job.state === "fetching" || job.state === "analyzing")) {
        dot.classList.add("is-busy");
        label.textContent = "Analyse en cours";
        return;
    }
    if (configured && configured.discordBotToken && configured.groqKey) {
        dot.classList.add("is-ready");
        label.textContent = "Serveur prêt";
        return;
    }
    if (configured) {
        dot.classList.add("is-warning");
        label.textContent = "Configuration à compléter";
        return;
    }
    label.textContent = "Serveur injoignable";
}

function renderConfig(status) {
    const token = byId("tokenState");
    const groq = byId("groqState");
    const channel = byId("channelIdLabel");
    if (channel && status.channelId) channel.textContent = status.channelId;

    const discord = status.configured || {};
    token.textContent = discord.discordBotToken ? "présent" : "absent";
    token.className = `config-state ${discord.discordBotToken ? "is-ok" : "is-missing"}`;
    token.title = discord.discordSource || "";
    groq.textContent = discord.groqKey ? "présente" : "absente";
    groq.className = `config-state ${discord.groqKey ? "is-ok" : "is-missing"}`;

    if (!discord.discordBotToken) {
        byId("controlNote").textContent =
            "Ajoute DISCORD_BOT_TOKEN dans token.json (racine du serveur), puis relance l'analyse.";
    } else if (!discord.groqKey) {
        byId("controlNote").textContent =
            "Ajoute GROQ_API_KEY dans token.json (racine du serveur) pour activer la lecture IA.";
    }

    const months = byId("monthsSelect");
    if (months && status.months && !months.dataset.touched) months.value = String(status.months);
    if (status.maxMonths) {
        [...months.options].forEach(option => {
            option.disabled = Number(option.value) > status.maxMonths;
        });
    }
}

// ==========================================
// LANCEMENT ET PROGRESSION
// ==========================================

async function startAnalysis() {
    const button = byId("analyzeButton");
    const months = Number(byId("monthsSelect").value) || 4;
    button.disabled = true;
    byId("analyzeLabel").textContent = "Démarrage…";
    hideError();

    try {
        const { job } = await api("/api/mercato/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ months }),
        });
        state.job = job;
        renderJob(job);
        pollJob(job.id);
        toast(`Analyse lancée sur ${months} mois.`);
    } catch (error) {
        showError(error.message);
        resetButton();
    }
}

function renderJob(job) {
    state.job = job;
    const block = byId("progressBlock");
    const running = job.state === "fetching" || job.state === "analyzing";
    block.hidden = !(running || job.state === "done" || job.state === "error");

    byId("statFetched").textContent = job.messagesFetched;
    byId("statKept").textContent = job.messagesKept;
    byId("statBatches").textContent = `${job.batchesDone}/${job.batchesTotal}`;
    byId("statTransfers").textContent = job.transfersFound;
    byId("phaseLabel").textContent = job.phase;
    byId("windowFact").textContent = `${job.months} mois`;

    const bar = byId("progressBar");
    const percentLabel = byId("progressPercent");
    if (job.state === "analyzing" && job.batchesTotal) {
        const percent = Math.min(100, Math.round((job.batchesDone / job.batchesTotal) * 100));
        bar.classList.remove("is-indeterminate");
        bar.style.width = `${percent}%`;
        percentLabel.textContent = `${percent}%`;
    } else if (job.state === "fetching") {
        bar.style.width = "100%";
        bar.classList.add("is-indeterminate");
        percentLabel.textContent = "…";
    } else if (job.state === "done") {
        bar.classList.remove("is-indeterminate");
        bar.style.width = "100%";
        percentLabel.textContent = "100%";
    } else if (job.state === "error") {
        bar.classList.add("is-indeterminate");
        percentLabel.textContent = "—";
    }

    if (job.state === "error" && job.error) {
        showError(job.error);
        resetButton();
    }
    if (job.state === "done") {
        resetButton();
    }
}

function pollJob(id) {
    window.clearTimeout(state.pollTimer);
    const tick = async () => {
        try {
            const { job } = await api(`/api/mercato/jobs/${encodeURIComponent(id)}`);
            renderJob(job);
            if (job.state === "fetching" || job.state === "analyzing") {
                state.pollTimer = window.setTimeout(tick, 1400);
                return;
            }
            if (job.state === "done") {
                await loadReport();
                toast("Analyse terminée : la liste des transferts est à jour.");
            }
        } catch (error) {
            showError(error.message);
            resetButton();
        }
    };
    state.pollTimer = window.setTimeout(tick, 900);
}

function resetButton() {
    const button = byId("analyzeButton");
    button.disabled = false;
    byId("analyzeLabel").textContent = "Relancer l'analyse";
}

function showError(message) {
    const box = byId("jobError");
    box.textContent = message;
    box.hidden = false;
}

function hideError() {
    byId("jobError").hidden = true;
}

// ==========================================
// RAPPORT
// ==========================================

async function loadReport() {
    try {
        const report = await api("/api/mercato/report");
        applyReport(report);
    } catch (error) {
        // 404 attendu avant la première analyse : pas d'erreur visible.
        if (!/Aucune analyse/.test(error.message)) console.warn("Rapport mercato", error);
    }
}

function applyReport(report) {
    state.report = report;
    state.expanded.clear();
    state.filter = { query: "", club: "", type: "all" };

    byId("messagesFact").textContent = report.analyzedMessages;
    byId("transfersFact").textContent = report.transfers.length;
    byId("lastRunBadge").textContent = shortDate(report.generatedAt);
    byId("reportWindow").textContent =
        `${report.transfers.length} transfert${report.transfers.length > 1 ? "s" : ""} · ` +
        `${report.analyzedMessages} messages analysés · ${longDate(report.since)} → ${longDate(report.until)}` +
        (report.channelName ? ` · #${report.channelName}` : "");

    renderSummary(report);
    renderTypeFilters(report.transfers);
    renderClubOptions(report.transfers);

    byId("filters").hidden = report.transfers.length === 0;
    byId("exportCsv").disabled = report.transfers.length === 0;
    byId("exportJson").disabled = report.transfers.length === 0;
    byId("emptyState").hidden = report.transfers.length > 0;

    // Une analyse terminée sans transfert n'est pas le même état qu'une
    // première visite : le texte doit le dire, sans réutiliser le mode d'emploi.
    const emptyTitle = document.querySelector("#emptyState h3");
    const emptyText = document.querySelector("#emptyState p:not(.empty-hint)");
    if (emptyTitle && emptyText) {
        if (report.transfers.length === 0) {
            emptyTitle.textContent = "Aucun transfert retenu sur cette période.";
            emptyText.innerHTML =
                "Les messages ont bien été lus, mais aucune annonce de transfert individuel conclu n'en ressort. " +
                "Relance l'analyse avec une profondeur plus grande, ou vérifie que le salon choisi est le bon.";
        } else {
            emptyTitle.textContent = "La liste se construit à partir du salon.";
            emptyText.innerHTML =
                "Clique sur <strong>Lancer l'analyse</strong> : le serveur récupère les messages des " +
                "quatre derniers mois, les fait lire par lots, puis dédoublonne les annonces d'un même transfert.";
        }
    }

    const note = byId("resultsNote");
    if (report.failedBatches > 0) {
        note.textContent =
            `${report.failedBatches} lot(s) de messages n'ont pas pu être analysés (quota ou erreur Groq). ` +
            "Relance l'analyse pour compléter la liste.";
        note.hidden = false;
    } else {
        note.hidden = true;
    }

    renderTransfers();
}

function renderSummary(report) {
    const strip = byId("summaryStrip");
    strip.hidden = false;

    const players = new Set(report.transfers.map(item => fold(item.player)));
    const clubs = new Set();
    for (const item of report.transfers) {
        if (item.from) clubs.add(fold(item.from));
        if (item.to) clubs.add(fold(item.to));
    }

    byId("summaryTransfers").textContent = report.transfers.length;
    byId("summaryPlayers").textContent = players.size;
    byId("summaryClubs").textContent = clubs.size;
    byId("summaryMessages").textContent = report.analyzedMessages;
    byId("summaryWindow").textContent = `${shortDate(report.since)} → ${shortDate(report.until)}`;
}

function renderTypeFilters(transfers) {
    const row = byId("typeFilters");
    const types = [...new Set(transfers.map(item => item.type))];
    row.innerHTML = "";

    const all = document.createElement("button");
    all.type = "button";
    all.className = "type-chip is-active";
    all.dataset.type = "all";
    all.textContent = "Tous";
    row.appendChild(all);

    for (const type of types) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "type-chip";
        button.dataset.type = type;
        button.textContent = TYPE_LABELS[type] || type;
        row.appendChild(button);
    }

    row.onclick = event => {
        const button = event.target.closest(".type-chip");
        if (!button) return;
        state.filter.type = button.dataset.type || "all";
        row.querySelectorAll(".type-chip").forEach(chip => {
            chip.classList.toggle("is-active", chip === button);
        });
        renderTransfers();
    };
}

function renderClubOptions(transfers) {
    const select = byId("clubSelect");
    const clubs = new Map();
    for (const item of transfers) {
        for (const club of [item.from, item.to]) {
            if (!club) continue;
            const key = fold(club);
            if (!clubs.has(key)) clubs.set(key, club);
        }
    }
    const sorted = [...clubs.values()].sort((a, b) => a.localeCompare(b, "fr"));
    select.innerHTML = '<option value="">Tous les clubs</option>';
    for (const club of sorted) {
        const option = document.createElement("option");
        option.value = club;
        option.textContent = club;
        select.appendChild(option);
    }
    select.value = "";
}

function filteredTransfers() {
    const { query, club, type } = state.filter;
    const needle = fold(query);
    const clubNeedle = fold(club);
    return (state.report?.transfers || []).filter(item => {
        if (type !== "all" && item.type !== type) return false;
        if (clubNeedle && fold(item.from) !== clubNeedle && fold(item.to) !== clubNeedle) return false;
        if (!needle) return true;
        return fold([item.player, item.from, item.to, item.fee, item.author, item.quote].join(" ")).includes(needle);
    });
}

function renderTransfers() {
    const body = byId("transfersBody");
    const wrap = byId("tableWrap");
    const items = filteredTransfers();
    const count = byId("resultCount");

    body.innerHTML = "";
    count.textContent = `${items.length} / ${state.report?.transfers.length || 0}`;
    wrap.hidden = items.length === 0;

    if (!items.length) {
        const row = document.createElement("tr");
        row.innerHTML = `<td colspan="6" class="no-match">Aucun transfert ne correspond à ces filtres.</td>`;
        body.appendChild(row);
        wrap.hidden = false;
        return;
    }

    let lastMonth = null;
    for (const item of items) {
        const month = monthKey(item.date);
        if (month && month !== lastMonth) {
            lastMonth = month;
            const separator = document.createElement("tr");
            separator.className = "month-row";
            separator.innerHTML = `<td colspan="6">${escapeHtml(month)}</td>`;
            body.appendChild(separator);
        }

        const row = document.createElement("tr");
        row.className = "transfer-row";
        row.tabIndex = 0;
        row.dataset.id = item.id;
        row.setAttribute("aria-expanded", "false");
        row.innerHTML = `
            <td class="cell-date col-date" data-label="Date">${escapeHtml(shortDate(item.date))}</td>
            <td class="cell-player">${escapeHtml(item.player)}${
                item.author ? `<small>${escapeHtml(item.author)}</small>` : ""
            }</td>
            <td class="cell-move">${escapeHtml(item.from || "—")}<span class="arrow">→</span><span class="club-in">${escapeHtml(
                item.to || "—",
            )}</span></td>
            <td class="cell-fee col-fee${item.fee ? "" : " is-unknown"}" data-label="Montant">${escapeHtml(
                item.fee || "non précisé",
            )}</td>
            <td class="col-type" data-label="Type"><span class="type-pill type-${escapeHtml(item.type)}">${escapeHtml(
                TYPE_LABELS[item.type] || item.type,
            )}</span></td>
            <td class="col-source"><button class="row-toggle" type="button" aria-label="Voir la source">▾</button></td>
        `;

        const source = document.createElement("tr");
        source.className = "source-row";
        source.hidden = true;
        source.dataset.for = item.id;
        source.innerHTML = `
            <td colspan="6">
                <div class="source-card">
                    <p class="source-quote">« ${escapeHtml(item.quote || "Aucun extrait disponible.")} »</p>
                    <span class="source-meta">
                        ${item.author ? `${escapeHtml(item.author)} · ` : ""}${escapeHtml(longDate(item.date))} ·
                        confiance ${Math.round((item.confidence || 0) * 100)}%
                    </span>
                </div>
            </td>
        `;

        body.appendChild(row);
        body.appendChild(source);
    }
}

function toggleRow(id) {
    const row = document.querySelector(`.transfer-row[data-id="${CSS.escape(id)}"]`);
    const source = document.querySelector(`.source-row[data-for="${CSS.escape(id)}"]`);
    if (!row || !source) return;
    const open = state.expanded.has(id);
    if (open) state.expanded.delete(id);
    else state.expanded.add(id);
    source.hidden = open;
    row.setAttribute("aria-expanded", String(!open));
}

// ==========================================
// EXPORTS
// ==========================================

function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
    const items = filteredTransfers();
    if (!items.length) return;
    const cell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [
        ["Date", "Joueur", "Club quitté", "Club rejoint", "Montant", "Type", "Auteur", "Extrait", "Confiance"].map(cell).join(";"),
        ...items.map(item =>
            [
                item.date?.slice(0, 10) || "",
                item.player,
                item.from || "",
                item.to || "",
                item.fee || "",
                TYPE_LABELS[item.type] || item.type,
                item.author || "",
                item.quote,
                Math.round((item.confidence || 0) * 100) + "%",
            ]
                .map(cell)
                .join(";"),
        ),
    ];
    download(`mercato-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${lines.join("\r\n")}`, "text/csv;charset=utf-8");
}

function exportJson() {
    const items = filteredTransfers();
    if (!items.length) return;
    download(
        `mercato-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify({ ...state.report, transfers: items }, null, 2),
        "application/json",
    );
}

// ==========================================
// INITIALISATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    byId("analyzeButton").addEventListener("click", startAnalysis);
    byId("monthsSelect").addEventListener("change", event => {
        event.target.dataset.touched = "1";
        byId("windowFact").textContent = `${event.target.value} mois`;
    });
    byId("searchInput").addEventListener("input", event => {
        state.filter.query = event.target.value;
        renderTransfers();
    });
    byId("clubSelect").addEventListener("change", event => {
        state.filter.club = event.target.value;
        renderTransfers();
    });
    byId("exportCsv").addEventListener("click", exportCsv);
    byId("exportJson").addEventListener("click", exportJson);

    const body = byId("transfersBody");
    body.addEventListener("click", event => {
        const row = event.target.closest(".transfer-row");
        if (row) toggleRow(row.dataset.id);
    });
    body.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const row = event.target.closest(".transfer-row");
        if (!row) return;
        event.preventDefault();
        toggleRow(row.dataset.id);
    });

    loadStatus();
});
