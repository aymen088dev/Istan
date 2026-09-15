import { useEffect, useState } from "react";
import { Trash2, FolderOpen, User, BookOpen, Star, Hash, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadCompositions, type SavedComposition } from "@/components/CompositionLibrary";
import { JerseySVG } from "@/components/JerseySVG";
import type { JerseyStyle } from "@/components/JerseySVG";
import { deleteSharedComposition, getSharedCompositions, saveSharedComposition } from "@/lib/sharedApi";
import {
  loadPlayerLibrary,
  savePlayerLibrary,
  type LibraryPlayer,
} from "@/lib/playerLibrary";
const STORAGE_KEY = "lineup-saved-compositions";

function saveCompositions(list: SavedComposition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function ratingColor(r: number) {
  if (r >= 90) return "#f59e0b";
  if (r >= 80) return "#4ade80";
  if (r >= 70) return "#60a5fa";
  return "#94a3b8";
}

function fmt(ts: number) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Props = {
  onLoadComposition: (c: SavedComposition) => void;
  currentState: Omit<SavedComposition, "id" | "name" | "savedAt">;
};

export function LibraryPage({ onLoadComposition, currentState }: Props) {
  const [tab, setTab] = useState<"compos" | "joueurs">("compos");
  const [compositions, setCompositions] = useState<SavedComposition[]>(() => loadCompositions());
  const [players, setPlayers] = useState<LibraryPlayer[]>(() => loadPlayerLibrary());
  const [saveName, setSaveName] = useState("");
  const [searchCompo, setSearchCompo] = useState("");
  const [searchPlayer, setSearchPlayer] = useState("");

  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        const shared = await getSharedCompositions();
        if (!active) return;
        if (shared.length > 0) {
          // Ne remplace l'état que si le contenu a changé : évite les re-rendus
          // complets à chaque tick de synchronisation.
          setCompositions(previous => {
            if (JSON.stringify(previous) === JSON.stringify(shared)) return previous;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(shared));
            return shared;
          });
          return;
        }
        const local = loadCompositions();
        await Promise.all(local.map(composition => saveSharedComposition(composition)));
      } catch {
        // localStorage remains available when the API is temporarily offline.
      }
    };
    void sync();
    const timer = window.setInterval(() => { void sync(); }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleSaveCompo = () => {
    const name = saveName.trim() || currentState.title || "Composition";
    const entry: SavedComposition = {
      ...currentState,
      id: `comp-${Date.now()}`,
      name,
      savedAt: Date.now(),
    };
    const updated = [entry, ...compositions];
    saveCompositions(updated);
    setCompositions(updated);
    void saveSharedComposition(entry);
    setSaveName("");
  };

  const handleDeleteCompo = (id: string) => {
    const updated = compositions.filter(c => c.id !== id);
    saveCompositions(updated);
    setCompositions(updated);
    void deleteSharedComposition(id);
  };

  const handleDeletePlayer = (idx: number) => {
    const updated = players.filter((_, i) => i !== idx);
    savePlayerLibrary(updated);
    setPlayers(updated);
  };

  const filteredCompos = searchCompo.trim()
    ? compositions.filter(c => c.name.toLowerCase().includes(searchCompo.toLowerCase()))
    : compositions;

  const filteredPlayers = searchPlayer.trim()
    ? players.filter(p => p.name.toLowerCase().includes(searchPlayer.toLowerCase()) || p.position.toLowerCase().includes(searchPlayer.toLowerCase()))
    : players;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Tabs */}
      <div className="flex shrink-0 border-b border-border/40">
        <button
          onClick={() => setTab("compos")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all border-b-2 ${tab === "compos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <BookOpen className="w-4 h-4" />
          Compositions
          {compositions.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">{compositions.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab("joueurs")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all border-b-2 ${tab === "joueurs" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <User className="w-4 h-4" />
          Joueurs
          {players.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">{players.length}</span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── COMPOSITIONS ── */}
        {tab === "compos" && (
          <div className="p-4 space-y-4">
            {/* Save current */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">Sauvegarder la compo actuelle</p>
              <div className="flex gap-2">
                <Input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSaveCompo()}
                  placeholder={currentState.title || "Nom de la composition…"}
                  className="h-9 text-sm flex-1"
                />
                <Button onClick={handleSaveCompo} className="h-9 px-4 text-sm font-bold shrink-0">
                  <Star className="w-3.5 h-3.5 mr-1.5" />
                  Sauver
                </Button>
              </div>
            </div>

            {/* Search */}
            {compositions.length > 2 && (
              <Input value={searchCompo} onChange={e => setSearchCompo(e.target.value)} placeholder="Rechercher…" className="h-8 text-sm" />
            )}

            {/* List */}
            {filteredCompos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Trophy className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Aucune composition sauvegardée</p>
                <p className="text-xs text-muted-foreground/60">Sauvegarde ta compo actuelle ci-dessus</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCompos.map(c => (
                  <div key={c.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/40 hover:border-primary/30 hover:bg-muted/30 transition-all group">
                    {/* Jersey preview */}
                    <div className="w-9 h-9 shrink-0">
                      <JerseySVG
                        uid={`lib-${c.id}`}
                        color1={c.jerseyColor}
                        color2={c.secondaryColor}
                        color3={c.accentColor}
                        numberColor={c.numberColor}
                        style={(c.jerseyStyle as JerseyStyle) ?? "plain"}
                        number=""
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.sport === "football" ? "⚽" : "🏒"} {c.formation} · {fmt(c.savedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={() => onLoadComposition(c)}
                        className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10 px-2">
                        <FolderOpen className="w-3.5 h-3.5 mr-1" />
                        Charger
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteCompo(c.id)}
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {/* Mobile: always show buttons */}
                    <div className="flex items-center gap-1 md:hidden">
                      <Button variant="ghost" size="sm" onClick={() => onLoadComposition(c)}
                        className="h-8 text-xs text-primary px-2">
                        <FolderOpen className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteCompo(c.id)}
                        className="h-8 w-8 text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── JOUEURS ── */}
        {tab === "joueurs" && (
          <div className="p-4 space-y-4">
            {players.length > 2 && (
              <Input value={searchPlayer} onChange={e => setSearchPlayer(e.target.value)} placeholder="Rechercher un joueur…" className="h-8 text-sm" />
            )}

            {filteredPlayers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <User className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Bibliothèque vide</p>
                <p className="text-xs text-muted-foreground/60">Sauvegarde des joueurs depuis l'éditeur de joueur</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredPlayers.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/30 transition-all group">
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-black text-primary">#{p.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{p.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">{p.position}</span>
                        {p.nationality && (
                          <img src={`https://flagcdn.com/w20/${p.nationality.toLowerCase()}.png`} alt="" className="h-3 w-4 object-cover rounded-sm" onError={e => (e.target as HTMLElement).style.display = "none"} />
                        )}
                      </div>
                    </div>
                    {p.rating && (
                      <span className="text-sm font-black tabular-nums shrink-0" style={{ color: ratingColor(p.rating) }}>
                        {p.rating}
                      </span>
                    )}
                    {p.isCaptain && (
                      <span className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center text-[9px] font-black text-black shrink-0">C</span>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleDeletePlayer(i)}
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 md:flex hidden transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeletePlayer(i)}
                      className="h-8 w-8 text-destructive md:hidden">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
