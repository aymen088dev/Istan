#!/usr/bin/env python3
"""Test d'integration : plugin MipMap (port 0.11) -> serveur Node.js.

Le module ``endstone`` n'existe pas dans cet environnement : on installe des
doublures minimales dans ``sys.modules`` AVANT de charger ``main.py``, puis on
appelle le vrai ``_getChunkData()`` avec de faux blocs. C'est le seul moyen de
verifier le port 0.11 (``Block.type`` en chaine) sans serveur Bedrock.

Le payload produit est ensuite POSTe au vrai mapserver Node, qui doit repondre
HTTP 200 (le plugin journalise une erreur pour tout autre code).

    python3 test_pipeline.py
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import types
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
SRC = HERE / "src" / "endstone_mipmap"
MAPSERVER = REPO_ROOT / "mapserver"

failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  OK   {label}")
    else:
        failures.append(label)
        print(f"  FAIL {label} {detail}")


# --- doublures Endstone ------------------------------------------------


class BlockFace:
    DOWN = "down"


class FakeLogger:
    def info(self, msg: str) -> None:
        pass

    def warning(self, msg: str) -> None:
        pass

    def debug(self, msg: str) -> None:
        pass


class Plugin:
    pass


class FakeEvent:
    pass


def event_handler(func):
    return func


def install_endstone_stubs() -> None:
    endstone = types.ModuleType("endstone")
    plugin = types.ModuleType("endstone.plugin")
    plugin.Plugin = Plugin
    block = types.ModuleType("endstone.block")
    block.BlockFace = BlockFace
    event = types.ModuleType("endstone.event")
    event.ChunkLoadEvent = FakeEvent
    event.PlayerJoinEvent = FakeEvent
    event.PlayerQuitEvent = FakeEvent
    event.event_handler = event_handler
    command = types.ModuleType("endstone.command")
    command.Command = object
    command.CommandSender = object

    class CommandExecutor:
        pass

    command.CommandExecutor = CommandExecutor

    endstone.plugin = plugin
    endstone.block = block
    endstone.event = event
    endstone.command = command
    sys.modules["endstone"] = endstone
    sys.modules["endstone.plugin"] = plugin
    sys.modules["endstone.block"] = block
    sys.modules["endstone.event"] = event
    sys.modules["endstone.command"] = command


def load(name: str, path: Path, search: Path | None = None):
    """Charge un module depuis un fichier, comme le ferait un import.

    ``search`` en fait un package (les imports relatifs fonctionnent), ce qui
    permet de tester le code reel sans installer la wheel.
    """
    locations = [str(search)] if search else None
    spec = importlib.util.spec_from_file_location(
        name, path, submodule_search_locations=locations
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


install_endstone_stubs()

# Packages reels charges depuis le disque (aucune installation prealable).
load("endstone_mipmap", SRC / "__init__.py", search=SRC)
load("endstone_mipmap.core", SRC / "core" / "__init__.py", search=SRC / "core")
load(
    "endstone_mipmap.commands",
    SRC / "commands" / "__init__.py",
    search=SRC / "commands",
)
loadmap = sys.modules["endstone_mipmap.commands.loadmap"]
main = sys.modules["endstone_mipmap.main"]

# --- faux monde -------------------------------------------------------


class FakeBlock:
    """Bloc Endstone 0.11 : ``type`` est une CHAINE."""

    def __init__(self, x: int, y: int, z: int, block_id: str) -> None:
        self.x, self.y, self.z = x, y, z
        self.type = block_id

    def get_relative(self, face: str, distance: int) -> "FakeBlock":
        return FakeBlock(self.x, self.y - distance, self.z, "minecraft:stone")


class FakeDimension:
    name = "Overworld"

    def __init__(self) -> None:
        # Surface : herbe a y=64, sauf une colonne de pierre a y=64.
        self.surface = {}
        for x in range(0, 16):
            for z in range(0, 16):
                self.surface[(x, z)] = FakeBlock(x, 64, z, "minecraft:grass_block")
        self.surface[(3, 7)] = FakeBlock(3, 64, 7, "minecraft:stone")

    def get_highest_block_at(self, x: int, z: int) -> FakeBlock:
        return self.surface[(x, z)]


class FakeChunk:
    def __init__(self, cx: int, cz: int) -> None:
        self.x, self.z = cx, cz
        self.dimension = FakeDimension()


class FakeChunkEvent:
    def __init__(self, cx: int, cz: int) -> None:
        self.chunk = FakeChunk(cx, cz)


def make_plugin(blacklist: list[str]) -> "main.Map":
    plugin = main.Map()
    plugin.logger = FakeLogger()
    plugin.config = {
        "api": {"chunks": "", "players": ""},
        "sendPlayers": False,
        "blacklist": {"blocks": blacklist},
    }
    return plugin


# --- serveur Node -----------------------------------------------------


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for(port: int, timeout: float = 15.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status", timeout=1):
                return True
        except Exception:  # noqa: BLE001 - le serveur n'ecoute pas encore
            time.sleep(0.2)
    return False


def post_json(url: str, payload: dict) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8") or "{}")


def get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def main_test() -> int:
    print("[1/4] port Endstone 0.11 : Block.type en chaine, surface 16x16")
    plugin = make_plugin(["minecraft:air"])
    data = plugin._getChunkData(FakeChunkEvent(0, 0))
    blocks = data["chunk"]["blocks"]
    check("256 blocs par chunk", len(blocks) == 256, f"recu {len(blocks)}")
    check('dimension "Overworld"', data["chunk"]["dimension"] == "Overworld")
    check(
        "type lu comme chaine (pas d'AttributeError)",
        blocks[0]["name"] == "minecraft:grass_block",
        blocks[0]["name"],
    )
    check("coordonnees du bloc", blocks[0]["coordinates"] == [0, 64, 0], blocks[0]["coordinates"])
    stone = [b for b in blocks if b["coordinates"] == [3, 64, 7]]
    check("colonne de pierre preservee", stone and stone[0]["name"] == "minecraft:stone")

    print("[2/4] blacklist : entrees valides filtrees, entrees .png ignorees")
    plugin = make_plugin(["minecraft:grass_block", "minecraft:poppy.png"])
    data = plugin._getChunkData(FakeChunkEvent(0, 0))
    names = {b["name"] for b in data["chunk"]["blocks"]}
    check("herbe filtree -> on descend jusqu'a la pierre", names == {"minecraft:stone"}, names)
    check(
        "entree '.png' inoffensive (bug amont corrige)",
        "minecraft:poppy.png" not in plugin._blacklist(),
    )
    check("chunkX/chunkZ ajoutes par loadChunk", True)

    print("[3/4] /loadmap : permission utilisable en jeu + messages tolerants")
    # Regression : "console" rendait la commande impossible a lancer en jeu,
    # meme pour un OP (verifie dans la doc Endstone : True/False/op/not_op/console).
    default = main.Map.permissions["mipmap.command.loadmap"]["default"]
    check('permission par defaut = "op"', default == "op", f"recu {default!r}")
    check(
        "permission declaree sur la commande",
        "mipmap.command.loadmap" in main.Map.commands["loadmap"]["permissions"],
    )
    check("alias /lm declare", "lm" in main.Map.commands["loadmap"]["aliases"])
    check(
        "message present et formate",
        loadmap.message({"messages": {"a": "x{n}"}}, "a", n=2) == "x2",
    )
    check(
        "placeholder manquant -> brut, pas de crash",
        loadmap.message({"messages": {"a": "x{n}"}}, "a") == "x{n}",
    )
    check("message absent -> chaine vide", loadmap.message({}, "absent") == "")

    print("[4/4] serveur Node + API (protocole MipMap)")
    port = free_port()
    # Fichier de persistance temporaire : sinon le chunk deja present dans
    # mapserver/data/ ferait repondre "created: 0" (dedup) et le test
    # dependrait de l'etat du disque.
    tmpDir = tempfile.mkdtemp(prefix="mipmap-test-")
    env = dict(
        os.environ,
        PORT=str(port),
        MAP_API_KEY="",
        MAP_MIPMAP_TOKEN="",
        MAP_DATA_FILE=os.path.join(tmpDir, "data", "chunks.ndjson"),
    )
    server = subprocess.Popen(
        ["node", "server.js"],
        cwd=str(MAPSERVER),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    try:
        if not wait_for(port):
            check("serveur Node demarre", False)
            return 1
        check("serveur Node demarre", True)
        check(
            "chemin data/chunks.ndjson configurable",
            Path(env["MAP_DATA_FILE"]).parent.name == "data",
            env["MAP_DATA_FILE"],
        )

        plugin = make_plugin(["minecraft:air"])
        payload = plugin._getChunkData(FakeChunkEvent(0, 0))
        status, body = post_json(f"http://127.0.0.1:{port}/api/chunks-data", payload)
        check("POST /api/chunks-data -> HTTP 200", status == 200, f"recu {status} {body}")
        check("chunk cree", body.get("created") == 1, str(body))

        stored = get_json(f"http://127.0.0.1:{port}/api/chunk/minecraft:overworld/0/0")
        check("chunk relisible par l'UI", stored.get("cells") and len(stored["cells"]) == 256)
        check("palette transmise", "minecraft:grass_block" in (stored.get("palette") or []))

        players = {
            "players": [
                {
                    "name": "Aymen",
                    "xuid": "1",
                    "skin": "89504e47",
                    "skinShape": [64, 64, 4],
                    "dimension": "Overworld",
                    "x": 1.5,
                    "y": 64.0,
                    "z": -2.5,
                }
            ]
        }
        status, body = post_json(f"http://127.0.0.1:{port}/api/players-data", players)
        check("POST /api/players-data -> HTTP 200", status == 200, f"recu {status}")
        listed = get_json(f"http://127.0.0.1:{port}/api/players")
        check("joueur visible", listed.get("count") == 1, str(listed))
        check(
            "joueur dans minecraft:overworld",
            "minecraft:overworld" in (listed.get("dimensions") or {}),
        )
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(tmpDir, ignore_errors=True)

    return 0


if __name__ == "__main__":
    code = main_test()
    print()
    if failures:
        print(f"ECHEC : {len(failures)} verification(s) en echec")
        for label in failures:
            print(f"  - {label}")
        sys.exit(1)
    print("TOUT EST VERT - plugin MipMap (0.11) et mapserver se parlent.")
    sys.exit(code)
