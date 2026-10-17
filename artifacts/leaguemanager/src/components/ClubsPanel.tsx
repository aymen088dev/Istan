import { useState } from "react";
import { newClub, type Club, type Sport } from "@/lib/types";
import { uploadLogo } from "@/lib/api";
import { Btn, Chip, EmptyState, Notice, Panel, RangeField, SectionTitle, SelectField, TextField } from "./ui";

/** Réduit le logo à 256 px de côté : l'image reste nette et légère. */
async function resizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  }
  bitmap.close();
  return canvas.toDataURL("image/png");
}

function ClubBadge({ club, size = 44 }: { club: Club; size?: number }) {
  if (club.logo) {
    return (
      <img
        src={club.logo}
        alt=""
        width={size}
        height={size}
        className="rounded-xl border border-[var(--line)] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl text-sm font-extrabold"
      style={{
        width: size,
        height: size,
        background: club.primaryColor,
        color: club.secondaryColor,
      }}
    >
      {club.shortName || club.name.slice(0, 3).toUpperCase()}
    </span>
  );
}

function RatingSummary({ club }: { club: Club }) {
  if (club.ratingMode === "classic") {
    return (
      <div className="flex items-center gap-2">
        <span className="num text-2xl font-extrabold">{club.rating.overall}</span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">généralité</span>
      </div>
    );
  }
  const bars: { label: string; value: number; color: string }[] = [
    { label: "DÉF", value: club.rating.defense, color: "var(--cyan)" },
    { label: "MIL", value: club.rating.midfield, color: "var(--lime)" },
    { label: "ATT", value: club.rating.attack, color: "var(--amber)" },
  ];
  return (
    <div className="flex flex-col gap-1">
      {bars.map(bar => (
        <div key={bar.label} className="flex items-center gap-2">
          <span className="w-8 text-[10px] tracking-[0.14em] text-[var(--muted)]">{bar.label}</span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full rounded-full" style={{ width: `${bar.value}%`, background: bar.color }} />
          </span>
          <span className="num w-6 text-right text-xs">{bar.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function ClubsPanel({
  clubs,
  onSave,
  onDelete,
}: {
  clubs: Club[];
  onSave: (club: Club) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Club | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function patch(changes: Partial<Club>) {
    setDraft(current => (current ? { ...current, ...changes } : current));
  }

  function patchRating(changes: Partial<Club["rating"]>) {
    setDraft(current => (current ? { ...current, rating: { ...current.rating, ...changes } } : current));
  }

  async function handleLogo(file: File) {
    setError(null);
    try {
      const dataUrl = await resizeImage(file);
      try {
        const url = await uploadLogo(dataUrl);
        patch({ logo: url });
      } catch {
        // Le serveur d'uploads n'est pas indispensable : le logo reste local.
        patch({ logo: dataUrl });
        setError("Logo conservé localement — envoi au serveur impossible pour le moment.");
      }
    } catch {
      setError("Image illisible : choisis un PNG ou un JPEG.");
    }
  }

  async function submit() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Le nom du club est obligatoire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        shortName: (draft.shortName || draft.name.slice(0, 3)).toUpperCase().slice(0, 4),
      });
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <SectionTitle
          eyebrow="Clubs"
          title={`${clubs.length} club${clubs.length > 1 ? "s" : ""} enregistré${clubs.length > 1 ? "s" : ""}`}
          note="Ajoute un club avec son logo (ou ses initiales), son sport et sa généralité — note unique en mode classique, ou défense / milieu / attaque en mode avancé."
          right={
            <Btn variant="primary" onClick={() => { setDraft(newClub()); setError(null); }}>
              + Nouveau club
            </Btn>
          }
        />

        {clubs.length === 0 ? (
          <EmptyState
            title="Aucun club pour l'instant"
            text="Commence par créer deux clubs : ils pourront ensuite être engagés dans une ligue, une coupe ou un format personnalisé."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {clubs.map(club => (
              <article
                key={club.id}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4"
              >
                <div className="flex items-center gap-3">
                  <ClubBadge club={club} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{club.name}</p>
                    <p className="truncate text-[12px] text-[var(--muted)]">
                      {[club.city, club.country].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
                <RatingSummary club={club} />
                <div className="flex flex-wrap items-center gap-2">
                  <Chip label={club.shortName} value={club.sport === "hockey" ? "🏒 Hockey" : "⚽ Football"} />
                  <Chip value={club.ratingMode === "advanced" ? "Avancé" : "Classique"} />
                </div>
                <div className="mt-auto flex gap-2">
                  <Btn onClick={() => { setDraft({ ...club }); setError(null); }}>Modifier</Btn>
                  <Btn
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(`Supprimer ${club.name} ?`)) void onDelete(club.id);
                    }}
                  >
                    Supprimer
                  </Btn>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {draft ? (
        <Panel>
          <SectionTitle
            eyebrow={clubs.some(existing => existing.id === draft.id) ? "Modifier" : "Nouveau club"}
            title={draft.name || "Club sans nom"}
          />

          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Nom du club" value={draft.name} onChange={value => patch({ name: value })} placeholder="Istanbul SK" maxLength={80} />
                <TextField label="Abréviation" value={draft.shortName} onChange={value => patch({ shortName: value.toUpperCase().slice(0, 4) })} placeholder="ISK" maxLength={4} />
                <TextField label="Ville" value={draft.city} onChange={value => patch({ city: value })} placeholder="Istanmusta" maxLength={60} />
                <TextField label="Pays / région" value={draft.country} onChange={value => patch({ country: value })} maxLength={40} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField<Sport>
                  label="Sport"
                  value={draft.sport}
                  onChange={value => patch({ sport: value })}
                  options={[
                    { value: "football", label: "Football" },
                    { value: "hockey", label: "Hockey" },
                  ]}
                />
                <SelectField
                  label="Généralité"
                  value={draft.ratingMode}
                  onChange={value => patch({ ratingMode: value })}
                  options={[
                    { value: "classic", label: "Classique — une seule note" },
                    { value: "advanced", label: "Avancée — défense / milieu / attaque" },
                  ]}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field">
                  Couleur principale
                  <input
                    type="color"
                    value={draft.primaryColor}
                    onChange={event => patch({ primaryColor: event.target.value })}
                  />
                </label>
                <label className="field">
                  Couleur secondaire
                  <input
                    type="color"
                    value={draft.secondaryColor}
                    onChange={event => patch({ secondaryColor: event.target.value })}
                  />
                </label>
              </div>

              <div className="field">
                Logo (optionnel)
                <div className="flex items-center gap-3">
                  <ClubBadge club={draft} size={52} />
                  <input
                    className="input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) void handleLogo(file);
                    }}
                  />
                  {draft.logo ? <Btn onClick={() => patch({ logo: undefined })}>Retirer</Btn> : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4">
              {draft.ratingMode === "classic" ? (
                <RangeField
                  label="Généralité"
                  value={draft.rating.overall}
                  onChange={value => patchRating({ overall: value })}
                  hint="La note unique est déclinée automatiquement sur les trois compartiments."
                />
              ) : (
                <>
                  <RangeField label="Défense" value={draft.rating.defense} onChange={value => patchRating({ defense: value })} />
                  <RangeField label="Milieu" value={draft.rating.midfield} onChange={value => patchRating({ midfield: value })} />
                  <RangeField label="Attaque" value={draft.rating.attack} onChange={value => patchRating({ attack: value })} />
                </>
              )}
              <RangeField
                label="Généralité affichée"
                value={Math.round(
                  draft.ratingMode === "advanced"
                    ? (draft.rating.attack + draft.rating.midfield + draft.rating.defense) / 3
                    : draft.rating.overall,
                )}
                onChange={value => patchRating({ overall: value })}
                hint="Sert au classement des têtes de série et de valeur de référence."
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4">
              <Notice tone="error">{error}</Notice>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Btn variant="primary" onClick={() => void submit()} disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer le club"}
            </Btn>
            <Btn onClick={() => { setDraft(null); setError(null); }}>Annuler</Btn>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
