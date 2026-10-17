/* =========================================================

   DISCORD PUBLISHER — MESSAGE EDITOR

   ÉDITEUR AVANCÉ

========================================================= */

(() => {

    "use strict";

    /* =====================================================

       CONFIGURATION

    ===================================================== */

    const MAX_CHARACTERS = 2000;

    /* =====================================================

       ÉTAT

    ===================================================== */

    let editorInitialized = false;

    let advancedMode = false;

    /* =====================================================

       INITIALISATION

    ===================================================== */

    function initMessageEditor() {

        if (editorInitialized) {

            return;

        }

        const textarea =

            document.getElementById(

                "messageInput"

            );

        if (!textarea) {

            return;

        }

        editorInitialized = true;

        createEditorInterface(

            textarea

        );

        console.log(

            "Éditeur avancé chargé."

        );

    }

    /* =====================================================

       CRÉATION DE L'INTERFACE

    ===================================================== */

    function createEditorInterface(textarea) {

        const section =

            textarea.closest(

                ".section"

            );

        if (!section) {

            return;

        }

        /*

         * On garde le textarea original.

         * Il reste la source réelle du message.

         */

        textarea.classList.add(

            "message-editor-textarea"

        );

        /*

         * BARRE D'OUTILS

         */

        const toolbar =

            document.createElement(

                "div"

            );

        toolbar.className =

            "message-toolbar";

        toolbar.innerHTML = `

            <div class="message-toolbar-group">

                <button

                    type="button"

                    class="message-tool"

                    data-action="bold"

                    title="Gras"

                >

                    <strong>B</strong>

                </button>

                <button

                    type="button"

                    class="message-tool"

                    data-action="italic"

                    title="Italique"

                >

                    <em>I</em>

                </button>

                <button

                    type="button"

                    class="message-tool"

                    data-action="underline"

                    title="Souligné"

                >

                    <u>U</u>

                </button>

                <button

                    type="button"

                    class="message-tool"

                    data-action="strike"

                    title="Barré"

                >

                    <s>S</s>

                </button>

            </div>

            <div class="message-toolbar-separator"></div>

            <div class="message-toolbar-group">

                <button

                    type="button"

                    class="message-tool"

                    data-action="inline-code"

                    title="Code"

                >

                    &lt;/&gt;

                </button>

                <button

                    type="button"

                    class="message-tool"

                    data-action="code-block"

                    title="Bloc de code"

                >

                    { }

                </button>

                <button

                    type="button"

                    class="message-tool"

                    data-action="quote"

                    title="Citation"

                >

                    ❯

                </button>

            </div>

            <div class="message-toolbar-separator"></div>

            <div class="message-toolbar-group">

                <button

                    type="button"

                    class="message-tool"

                    data-action="bullet-list"

                    title="Liste"

                >

                    •

                </button>

                <button

                    type="button"

                    class="message-tool"

                    data-action="number-list"

                    title="Liste numérotée"

                >

                    1.

                </button>

                <button

                    type="button"

                    class="message-tool"

                    data-action="link"

                    title="Lien"

                >

                    lien

                </button>

            </div>

            <div class="message-toolbar-spacer"></div>

            <button

                type="button"

                class="message-preview-button"

                id="messagePreviewButton"

            >

                Aperçu

            </button>

        `;

        /*

         * Insérer avant le textarea

         */

        textarea.parentNode.insertBefore(

            toolbar,

            textarea

        );

        /*

         * FOOTER

         */

        const footer =

            document.createElement(

                "div"

            );

        footer.className =

            "message-editor-footer";

        footer.innerHTML = `

            <div class="message-editor-hint">

                Markdown Discord compatible

            </div>

            <div

                class="message-character-count"

                id="messageCharacterCount"

            >

                0 / ${MAX_CHARACTERS}

            </div>

        `;

        textarea.parentNode.insertBefore(

            footer,

            textarea.nextSibling

        );

        /*

         * APERÇU

         */

        const preview =

            document.createElement(

                "div"

            );

        preview.id =

            "messagePreview";

        preview.className =

            "message-preview";

        preview.innerHTML = `

            <div class="message-preview-header">

                <div>

                    <strong>

                        Aperçu Discord

                    </strong>

                    <span>

                        Rendu approximatif

                    </span>

                </div>

                <button

                    type="button"

                    id="closeMessagePreview"

                    class="message-preview-close"

                >

                    ×

                </button>

            </div>

            <div

                id="messagePreviewContent"

                class="message-preview-content"

            ></div>

        `;

        section.appendChild(

            preview

        );

        /*

         * ÉVÉNEMENTS

         */

        toolbar

            .querySelectorAll(

                ".message-tool"

            )

            .forEach(

                button => {

                    button.addEventListener(

                        "click",

                        () => {

                            applyAction(

                                button.dataset.action,

                                textarea

                            );

                        }

                    );

                }

            );

        const previewButton =

            document.getElementById(

                "messagePreviewButton"

            );

        if (previewButton) {

            previewButton.addEventListener(

                "click",

                () => {

                    togglePreview(

                        textarea

                    );

                }

            );

        }

        const closePreview =

            document.getElementById(

                "closeMessagePreview"

            );

        if (closePreview) {

            closePreview.addEventListener(

                "click",

                () => {

                    hidePreview();

                }

            );

        }

        textarea.addEventListener(

            "input",

            () => {

                updateCharacterCount(

                    textarea

                );

                updatePreview(

                    textarea

                );

            }

        );

        /*

         * Raccourcis clavier

         */

        textarea.addEventListener(

            "keydown",

            event => {

                handleKeyboardShortcut(

                    event,

                    textarea

                );

            }

        );

        updateCharacterCount(

            textarea

        );

    }

    /* =====================================================

       ACTIONS

    ===================================================== */

    function applyAction(

        action,

        textarea

    ) {

        switch (action) {

            case "bold":

                wrapSelection(

                    textarea,

                    "**",

                    "**"

                );

                break;

            case "italic":

                wrapSelection(

                    textarea,

                    "*",

                    "*"

                );

                break;

            case "underline":

                wrapSelection(

                    textarea,

                    "__",

                    "__"

                );

                break;

            case "strike":

                wrapSelection(

                    textarea,

                    "~~",

                    "~~"

                );

                break;

            case "inline-code":

                wrapSelection(

                    textarea,

                    "`",

                    "`"

                );

                break;

            case "code-block":

                createCodeBlock(

                    textarea

                );

                break;

            case "quote":

                createQuote(

                    textarea

                );

                break;

            case "bullet-list":

                createBulletList(

                    textarea

                );

                break;

            case "number-list":

                createNumberList(

                    textarea

                );

                break;

            case "link":

                createLink(

                    textarea

                );

                break;

        }

        textarea.focus();

        updateCharacterCount(

            textarea

        );

        updatePreview(

            textarea

        );

    }

    /* =====================================================

       WRAPPER

    ===================================================== */

    function wrapSelection(

        textarea,

        before,

        after

    ) {

        const start =

            textarea.selectionStart;

        const end =

            textarea.selectionEnd;

        const value =

            textarea.value;

        const selected =

            value.substring(

                start,

                end

            );

        const replacement =

            before +

            (

                selected ||

                "texte"

            ) +

            after;

        textarea.setRangeText(

            replacement,

            start,

            end,

            "select"

        );

    }

    /* =====================================================

       CODE BLOCK

    ===================================================== */

    function createCodeBlock(

        textarea

    ) {

        const start =

            textarea.selectionStart;

        const end =

            textarea.selectionEnd;

        const value =

            textarea.value;

        const selected =

            value.substring(

                start,

                end

            );

        const content =

            selected ||

            "ton code";

        const replacement =

            "```\n" +

            content +

            "\n```";

        textarea.setRangeText(

            replacement,

            start,

            end,

            "select"

        );

    }

    /* =====================================================

       CITATION

    ===================================================== */

    function createQuote(

        textarea

    ) {

        const start =

            textarea.selectionStart;

        const end =

            textarea.selectionEnd;

        const value =

            textarea.value;

        const selected =

            value.substring(

                start,

                end

            );

        const content =

            selected ||

            "citation";

        const lines =

            content.split(

                "\n"

            );

        const replacement =

            lines

                .map(

                    line =>

                        `> ${line}`

                )

                .join(

                    "\n"

                );

        textarea.setRangeText(

            replacement,

            start,

            end,

            "select"

        );

    }

    /* =====================================================

       LISTE À PUCES

    ===================================================== */

    function createBulletList(

        textarea

    ) {

        transformLines(

            textarea,

            line =>

                `- ${line}`

        );

    }

    /* =====================================================

       LISTE NUMÉROTÉE

    ===================================================== */

    function createNumberList(

        textarea

    ) {

        const start =

            textarea.selectionStart;

        const end =

            textarea.selectionEnd;

        const value =

            textarea.value;

        const selected =

            value.substring(

                start,

                end

            );

        const content =

            selected ||

            "élément 1\nélément 2";

        const lines =

            content.split(

                "\n"

            );

        const replacement =

            lines

                .map(

                    (line, index) =>

                        `${index + 1}. ${line}`

                )

                .join(

                    "\n"

                );

        textarea.setRangeText(

            replacement,

            start,

            end,

            "select"

        );

    }

    /* =====================================================

       TRANSFORMER LES LIGNES

    ===================================================== */

    function transformLines(

        textarea,

        transformer

    ) {

        const start =

            textarea.selectionStart;

        const end =

            textarea.selectionEnd;

        const value =

            textarea.value;

        const selected =

            value.substring(

                start,

                end

            );

        const content =

            selected ||

            "élément";

        const lines =

            content.split(

                "\n"

            );

        const replacement =

            lines

                .map(

                    transformer

                )

                .join(

                    "\n"

                );

        textarea.setRangeText(

            replacement,

            start,

            end,

            "select"

        );

    }

    /* =====================================================

       LIEN

    ===================================================== */

    function createLink(

        textarea

    ) {

        const selected =

            textarea.value.substring(

                textarea.selectionStart,

                textarea.selectionEnd

            );

        const text =

            selected ||

            "texte du lien";

        const url =

            window.prompt(

                "URL du lien :",

                "https://"

            );

        if (!url) {

            return;

        }

        const replacement =

            `[${text}](${url})`;

        const start =

            textarea.selectionStart;

        const end =

            textarea.selectionEnd;

        textarea.setRangeText(

            replacement,

            start,

            end,

            "select"

        );

    }

    /* =====================================================

       COMPTEUR

    ===================================================== */

    function updateCharacterCount(

        textarea

    ) {

        const counter =

            document.getElementById(

                "messageCharacterCount"

            );

        if (!counter) {

            return;

        }

        const length =

            textarea.value.length;

        counter.textContent =

            `${length} / ${MAX_CHARACTERS}`;

        counter.classList.remove(

            "warning",

            "danger"

        );

        if (

            length >

            MAX_CHARACTERS

        ) {

            counter.classList.add(

                "danger"

            );

        } else if (

            length >

            MAX_CHARACTERS * 0.9

        ) {

            counter.classList.add(

                "warning"

            );

        }

    }

    /* =====================================================

       APERÇU

    ===================================================== */

    function togglePreview(

        textarea

    ) {

        const preview =

            document.getElementById(

                "messagePreview"

            );

        if (!preview) {

            return;

        }

        const visible =

            preview.classList.contains(

                "visible"

            );

        if (visible) {

            hidePreview();

        } else {

            preview.classList.add(

                "visible"

            );

            updatePreview(

                textarea

            );

        }

    }

    function hidePreview() {

        const preview =

            document.getElementById(

                "messagePreview"

            );

        if (!preview) {

            return;

        }

        preview.classList.remove(

            "visible"

        );

    }

    /* =====================================================

       RENDU APERÇU

    ===================================================== */

    function updatePreview(

        textarea

    ) {

        const container =

            document.getElementById(

                "messagePreviewContent"

            );

        if (!container) {

            return;

        }

        const content =

            textarea.value;

        if (!content.trim()) {

            container.innerHTML = `

                <div class="message-preview-empty">

                    Aucun contenu à prévisualiser.

                </div>

            `;

            return;

        }

        container.innerHTML =

            discordMarkdownToHTML(

                content

            );

    }

    /* =====================================================

       MINI PARSEUR DISCORD

    ===================================================== */

    function discordMarkdownToHTML(

        text

    ) {

        let escaped =

            escapeHTML(

                text

            );

        /*

         * Blocs de code

         */

        escaped =

            escaped.replace(

                /```([\s\S]*?)```/g,

                '<pre class="preview-code"><code>$1</code></pre>'

            );

        /*

         * Code inline

         */

        escaped =

            escaped.replace(

                /`([^`\n]+)`/g,

                '<code class="preview-inline-code">$1</code>'

            );

        /*

         * Gras

         */

        escaped =

            escaped.replace(

                /\*\*([^*]+)\*\*/g,

                "<strong>$1</strong>"

            );

        /*

         * Italique

         */

        escaped =

            escaped.replace(

                /(?<!\*)\*([^*\n]+)\*(?!\*)/g,

                "<em>$1</em>"

            );

        /*

         * Souligné

         */

        escaped =

            escaped.replace(

                /__([^_]+)__/g,

                "<u>$1</u>"

            );

        /*

         * Barré

         */

        escaped =

            escaped.replace(

                /~~([^~]+)~~/g,

                "<s>$1</s>"

            );

        /*

         * Liens

         */

        escaped =

            escaped.replace(

                /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,

                '<a href="$2" target="_blank" rel="noopener">$1</a>'

            );

        /*

         * Citations

         */

        escaped =

            escaped.replace(

                /^&gt;\s?(.*)$/gm,

                '<div class="preview-quote">$1</div>'

            );

        /*

         * Listes

         */

        escaped =

            escaped.replace(

                /^[-•]\s(.+)$/gm,

                '<div class="preview-list-item">• $1</div>'

            );

        escaped =

            escaped.replace(

                /^\d+\.\s(.+)$/gm,

                '<div class="preview-list-item">$&</div>'

            );

        /*

         * Sauts de ligne

         */

        escaped =

            escaped.replace(

                /\n/g,

                "<br>"

            );

        return escaped;

    }

    /* =====================================================

       ESCAPE HTML

    ===================================================== */

    function escapeHTML(

        text

    ) {

        return String(text)

            .replace(

                /&/g,

                "&amp;"

            )

            .replace(

                /</g,

                "&lt;"

            )

            .replace(

                />/g,

                "&gt;"

            )

            .replace(

                /"/g,

                "&quot;"

            )

            .replace(

                /'/g,

                "&#039;"

            );

    }

    /* =====================================================

       RACCOURCIS CLAVIER

    ===================================================== */

    function handleKeyboardShortcut(

        event,

        textarea

    ) {

        if (

            !event.ctrlKey &&

            !event.metaKey

        ) {

            return;

        }

        const key =

            event.key.toLowerCase();

        /*

         * CTRL + B

         */

        if (key === "b") {

            event.preventDefault();

            wrapSelection(

                textarea,

                "**",

                "**"

            );

        }

        /*

         * CTRL + I

         */

        else if (key === "i") {

            event.preventDefault();

            wrapSelection(

                textarea,

                "*",

                "*"

            );

        }

        /*

         * CTRL + U

         */

        else if (key === "u") {

            event.preventDefault();

            wrapSelection(

                textarea,

                "__",

                "__"

            );

        }

        updateCharacterCount(

            textarea

        );

    }

    /* =====================================================

       EXPOSITION PUBLIQUE

    ===================================================== */

    window.DiscordMessageEditor = {

        init:

            initMessageEditor,

        getMessage: () => {

            const textarea =

                document.getElementById(

                    "messageInput"

                );

            return textarea

                ? textarea.value

                : "";

        },

        setMessage: message => {

            const textarea =

                document.getElementById(

                    "messageInput"

                );

            if (!textarea) {

                return;

            }

            textarea.value =

                String(

                    message || ""

                );

            updateCharacterCount(

                textarea

            );

            updatePreview(

                textarea

            );

        },

        preview: () => {

            const textarea =

                document.getElementById(

                    "messageInput"

                );

            if (textarea) {

                togglePreview(

                    textarea

                );

            }

        }

    };

    /* =====================================================

       LANCEMENT

    ===================================================== */

    if (

        document.readyState ===

        "loading"

    ) {

        document.addEventListener(

            "DOMContentLoaded",

            initMessageEditor

        );

    } else {

        initMessageEditor();

    }

})();