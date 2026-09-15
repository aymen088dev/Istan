import { useState } from "react";
import { BookOpen, Save, Trash2, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Player } from "@/lib/formations";

export type SavedComposition = {
  id: string;
  name: string;
  savedAt: number;
  sport: "football" | "hockey";
  formation: string;
  title: string;
  players: Player[];
  bench: Player[];
  jerseyColor: string;
  secondaryColor: string;
  accentColor: string;
  numberColor?: string;
  jerseyStyle: string;
  backgroundId: string;
  showBench: boolean;
  showDetails: boolean;
};

const STORAGE_KEY = "lineup-saved-compositions";

export function loadCompositions(): SavedComposition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCompositions(list: SavedComposition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

type Props = {
  currentState: Omit<SavedComposition, "id" | "name" | "savedAt">;
  onLoad: (c: SavedComposition) => void;
};

export function CompositionLibrary({ currentState, onLoad }: Props) {
  const [open, setOpen] = useState(false);
  const [compositions, setCompositions] = useState<SavedComposition[]>([]);
  const [newName, setNewName] = useState("");

  const handleOpen = () => {
    setCompositions(loadCompositions());
    setOpen(true);
  };

  const handleSave = () => {
    const name = newName.trim() || currentState.title || "Composition sans nom";
    const entry: SavedComposition = {
      ...currentState,
      id: `comp-${Date.now()}`,
      name,
      savedAt: Date.now(),
    };
    const updated = [entry, ...compositions];
    saveCompositions(updated);
    setCompositions(updated);
    setNewName("");
  };

  const handleDelete = (id: string) => {
    const updated = compositions.filter(c => c.id !== id);
    saveCompositions(updated);
    setCompositions(updated);
  };

  const handleLoad = (c: SavedComposition) => {
    onLoad(c);
    setOpen(false);
  };

  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" onClick={handleOpen} title="Bibliothèque de compositions">
          <BookOpen className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Bibliothèque de compositions
          </DialogTitle>
        </DialogHeader>

        {/* Save current */}
        <div className="border border-border rounded-lg p-4 space-y-3 shrink-0">
          <p className="text-sm font-semibold text-foreground">Sauvegarder la composition actuelle</p>
          <div className="flex gap-2">
            <Input
              placeholder={currentState.title || "Nom de la composition…"}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="flex-1"
            />
            <Button onClick={handleSave} className="shrink-0">
              <Save className="w-4 h-4 mr-2" />
              Sauvegarder
            </Button>
          </div>
        </div>

        {/* Saved list */}
        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
          {compositions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Plus className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucune composition sauvegardée</p>
            </div>
          ) : (
            compositions.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border border-border hover:bg-muted/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.sport === "football" ? "⚽" : "🏒"} {c.formation} · {fmt(c.savedAt)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleLoad(c)} className="shrink-0 text-primary hover:text-primary hover:bg-primary/10">
                  <FolderOpen className="w-4 h-4 mr-1" />
                  Charger
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
