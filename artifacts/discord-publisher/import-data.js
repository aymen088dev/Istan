#!/usr/bin/env node
"use strict";

/* =========================================================
   IMPORT DE L'ANCIENNE INSTALLATION (data/ ou data.zip)

   Le README promettait ce script, il n'existait pas : d'où des profils
   « importés » mais absents de l'interface, sans le moindre message.

   Usage :
     node artifacts/discord-publisher/import-data.js                  # data.zip à la racine
     node artifacts/discord-publisher/import-data.js ./ancien-data    # dossier déjà décompressé
     node artifacts/discord-publisher/import-data.js data.zip --overwrite

   Un dossier est copié directement (aucun serveur requis). Une archive ZIP
   est envoyée à l'API (`POST /api/publisher/import`) : c'est le serveur qui
   la décompresse, avec exactement les mêmes règles que l'import depuis
   l'interface, donc un seul comportement à maintenir.
   ========================================================= */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

const args = process.argv.slice(2);
const overwrite = args.includes("--overwrite");
const dataDirFlag = args.indexOf("--data-dir");
const DATA_DIR = path.resolve(
    dataDirFlag !== -1 && args[dataDirFlag + 1]
        ? args[dataDirFlag + 1]
        : process.env.PUBLISHER_DATA_DIR || path.join(ROOT, "data", "publisher"),
);

const NOISE = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const ROOTS = new Set(["profils", "profiles", "webhooks", "categories", "messages"]);
const EXTENSIONS = new Set(["json", "png", "jpg", "jpeg", "webp", "gif"]);

function readConfigFile(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return {};
    }
}

const config = {
    ...readConfigFile(path.join(__dirname, "token.json")),
    ...readConfigFile(path.join(ROOT, "token.json")),
};

const SERVER_URL = String(process.env.PUBLISHER_SERVER_URL || config.PUBLISHER_SERVER_URL || "http://localhost:10005")
    .replace(/\/+$/, "");

const positional = args.filter((argument, index) =>
    !argument.startsWith("--") && args[index - 1] !== "--data-dir",
);
const source = path.resolve(ROOT, positional[0] || "data.zip");

const counts = { profiles: 0, categories: 0, webhooks: 0, messages: 0, avatars: 0, skipped: 0, existing: 0 };

/** Dossier de l'ancien site → nom de fichier relatif à `data/publisher/`. */
function relativeTarget(parts) {
    const index = parts.findIndex(part => ROOTS.has(part.toLowerCase()));
    if (index === -1) return null;
    const relative = parts.slice(index);
    relative[0] = relative[0].toLowerCase() === "profiles" ? "profils" : relative[0].toLowerCase();
    const name = relative[relative.length - 1];
    const extension = path.extname(name).slice(1).toLowerCase();
    if (!EXTENSIONS.has(extension) || name.endsWith(".bak")) return null;
    return relative;
}

function count(relative) {
    const [root] = relative;
    const extension = path.extname(relative[relative.length - 1]).slice(1).toLowerCase();
    if (root === "profils" && extension !== "json") counts.avatars += 1;
    else if (root === "profils") counts.profiles += 1;
    else if (root === "categories") counts.categories += 1;
    else if (root === "webhooks") counts.webhooks += 1;
    else if (root === "messages") counts.messages += 1;
}

function copyEntry(parts, data) {
    const relative = relativeTarget(parts);
    if (!relative) {
        counts.skipped += 1;
        return;
    }
    const target = path.join(DATA_DIR, ...relative);
    if (!target.startsWith(path.resolve(DATA_DIR) + path.sep)) {
        counts.skipped += 1;
        return;
    }
    if (fs.existsSync(target) && !overwrite) {
        counts.existing += 1;
        return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    count(relative);
}

function copyDirectory(directory) {
    const walk = current => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (NOISE.has(entry.name) || entry.name.startsWith(".") || entry.name === "__MACOSX") continue;
            const full = path.join(current, entry.name);
            const parts = path.relative(directory, full).split(path.sep);
            if (entry.isDirectory()) walk(full);
            else copyEntry(parts, fs.readFileSync(full));
        }
    };
    walk(directory);
}

function report(label) {
    console.log(`\n${label}`);
    console.log(`  profils    : ${counts.profiles}`);
    console.log(`  avatars    : ${counts.avatars}`);
    console.log(`  catégories : ${counts.categories}`);
    console.log(`  webhooks   : ${counts.webhooks}`);
    console.log(`  messages   : ${counts.messages}`);
    if (counts.existing) console.log(`  déjà présents, conservés : ${counts.existing} (--overwrite pour remplacer)`);
    if (counts.skipped) console.log(`  ignorés (hors profils/catégories/webhooks/messages) : ${counts.skipped}`);
    console.log(`\nDonnées : ${DATA_DIR}`);
    console.log("Recharge l'interface (onglet Profils) : les entrées ci-dessus doivent apparaître.");
}

async function importArchive(file) {
    const form = new FormData();
    form.append("archive", new Blob([fs.readFileSync(file)]), path.basename(file));
    if (overwrite) form.append("overwrite", "1");

    let response;
    try {
        response = await fetch(`${SERVER_URL}/api/publisher/import`, { method: "POST", body: form });
    } catch (error) {
        console.error(`❌ Portail injoignable sur ${SERVER_URL} (${error.message}).`);
        console.error("   Démarre le portail (node start.js) puis relance, ou décompresse l'archive");
        console.error("   et passe le dossier en argument : node import-data.js ./dossier-data");
        process.exit(1);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.error(`❌ Import refusé (${response.status}) : ${payload.error || "sans détail"}`);
        process.exit(1);
    }

    const imported = payload.report || {};
    console.log("\nArchive importée.");
    console.log("  fichiers écrits :", imported.files ?? 0);
    console.log("  profils         :", imported.counts?.profiles ?? 0);
    console.log("  avatars         :", imported.counts?.avatars ?? 0);
    console.log("  catégories      :", imported.counts?.categories ?? 0);
    console.log("  webhooks        :", imported.counts?.webhooks ?? 0);
    if (imported.skipped?.length) {
        console.log(`  ignorés (${imported.skipped.length}) :`);
        imported.skipped.slice(0, 8).forEach(item => console.log(`    · ${item.path} — ${item.reason}`));
    }
    console.log("\nVisibles après import :", JSON.stringify(payload.visible));
}

async function main() {
    if (!fs.existsSync(source)) {
        console.error(`❌ Introuvable : ${source}`);
        console.error("   Passe le dossier de l'ancien site ou data.zip en argument.");
        process.exit(1);
    }

    const stats = fs.statSync(source);
    if (stats.isDirectory()) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        copyDirectory(source);
        report(`Dossier importé depuis ${source}`);
        return;
    }

    if (path.extname(source).toLowerCase() !== ".zip") {
        console.error("❌ Attendu : un dossier ou une archive .zip.");
        process.exit(1);
    }
    await importArchive(source);
}

main().catch(error => {
    console.error("❌ Import impossible :", error.message);
    process.exit(1);
});
