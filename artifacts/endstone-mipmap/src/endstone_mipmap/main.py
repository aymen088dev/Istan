"""MipMap — carte interactive pour serveurs Endstone.

Amont : github.com/MipaSenpai/MipMap (MIT, voir LICENSE).
Ce fork ne change que ce qui bloque sur **Endstone 0.11** :

1. ``Block.type`` y est une **chaine** (``"minecraft:grass_block"``) et non un
   objet ``BlockType``. L'amont fait ``while blockType in blacklist: blockType =
   block.data.type`` : avec une chaine, la comparaison fonctionnait encore, mais
   on normalise des deux cotes pour rester sur.
2. La blacklist amont contient des entrees parasites (``"minecraft:poppy.png"``)
   qui n'excluaient donc rien. On ne garde que des identifiants valides.
3. ``/loadmap`` lisait ``self.plugin.batchTracker``, cree seulement dans
   ``on_enable`` : la commande plantait si elle etait appelee avant. On cree le
   tracker dans ``on_load`` et on utilise ``getattr`` partout.

Le protocole d'envoi (POST JSON vers ``api.chunks`` / ``api.players``) est
inchange : le mapserver de ce depot le parle nativement.
"""

import asyncio
import multiprocessing as mp

from endstone.block import BlockFace
from endstone.event import ChunkLoadEvent, PlayerJoinEvent, PlayerQuitEvent, event_handler
from endstone.plugin import Plugin

from .commands.loadmap import LoadmapCommand
from .core import BatchTracker, ChunksSender, PlayersSender

# Identifiant d'un bloc vide, quel que soit le format renvoye par l'API.
AIR_IDS = ("minecraft:air", "air")


def blockId(block) -> str:
    """Identifiant d'un bloc, tolerant aux versions d'Endstone.

    0.11 expose ``Block.type`` comme une chaine ; les versions precedentes
    exposent un objet ``BlockType`` avec un attribut ``id``.
    """
    try:
        blockType = block.type
    except Exception:  # noqa: BLE001 - API C++ susceptible de lever
        return ""

    if isinstance(blockType, str):
        return blockType
    return str(getattr(blockType, "id", blockType))


def startChunkSender(queue: mp.Queue, resultQueue: mp.Queue, config: dict) -> None:
    try:
        sender = ChunksSender(config, resultQueue)
        asyncio.run(sender.run(queue))
    except KeyboardInterrupt:
        return


def startPlayersSender(queue: mp.Queue, config: dict) -> None:
    try:
        sender = PlayersSender(config)
        asyncio.run(sender.run(queue))
    except KeyboardInterrupt:
        return


class Map(Plugin):
    api_version = "0.11"

    commands = {
        "loadmap": {
            "description": "Map loading control",
            "usages": [
                "/loadmap",
                "/loadmap <minX: int> <minZ: int> <maxX: int> <maxZ: int>",
                "/loadmap status",
                "/loadmap help",
            ],
            "aliases": ["lm"],
            "permissions": ["mipmap.command.loadmap"],
        }
    }

    permissions = {
        "mipmap.command.loadmap": {
            "description": "Permission for map loading control",
            # L'amont mettait "console" : la commande etait alors IMPOSSIBLE a
            # lancer en jeu, meme pour un OP. "op" la rend utilisable par les
            # operateurs, ce qui est le cas d'usage normal. Valeurs possibles
            # (doc Endstone) : True, False, "op", "not_op", "console".
            "default": "op",
        }
    }

    def on_load(self) -> None:
        # Cree ici (et pas seulement dans on_enable) : /loadmap peut etre
        # resolue avant que on_enable ne soit termine.
        self.batchTracker = BatchTracker(self)
        self.logger.info("MipMap charge (port Endstone 0.11).")

    def on_enable(self) -> None:
        self.save_default_config()
        self.register_events(self)

        self.get_command("loadmap").executor = LoadmapCommand(self)

        self._chunksQueue = mp.Queue()
        self._resultQueue = mp.Queue()
        self._playersQueue = mp.Queue()

        self._chunkDataSenderProcess = mp.Process(
            target=startChunkSender,
            args=(self._chunksQueue, self._resultQueue, self.config),
        )
        self._chunkDataSenderProcess.start()

        self._scheduleResultProcessing()

        self._playerDataSenderProcess = mp.Process(
            target=startPlayersSender,
            args=(self._playersQueue, self.config),
        )
        self._playerDataSenderProcess.start()

        self._schedulePlayersUpdate()

        api = self.config.get("api") or {}
        self.logger.info(
            f"Envoi des chunks vers {api.get('chunks')} "
            f"(joueurs : {'oui' if self.config.get('sendPlayers') else 'non'})"
        )

    def on_disable(self) -> None:
        for name in ("_chunkDataSenderProcess", "_playerDataSenderProcess"):
            process = getattr(self, name, None)
            if process is not None:
                process.terminate()
                process.join(timeout=5)

    # --- evenements -------------------------------------------------------

    @event_handler
    def loadChunk(self, event: ChunkLoadEvent):
        chunkData = self._getChunkData(event)

        chunkData["chunkX"] = event.chunk.x
        chunkData["chunkZ"] = event.chunk.z

        self._chunksQueue.put(chunkData)

    @event_handler
    def onPlayerJoin(self, event: PlayerJoinEvent):
        self._sendPlayers()

    @event_handler
    def onPlayerQuit(self, event: PlayerQuitEvent):
        self._sendPlayers()

    # --- boucle de resultats ---------------------------------------------

    def _scheduleResultProcessing(self) -> None:
        self.server.scheduler.run_task(self, self._processResults, 1)

    def _processResults(self) -> None:
        while not self._resultQueue.empty():
            try:
                result = self._resultQueue.get_nowait()
                status, chunkX, chunkZ = result

                if status == "success":
                    self.batchTracker.chunkProcessed(chunkX, chunkZ)

            except Exception:  # noqa: BLE001 - file vide ou element inattendu
                break

        self._scheduleResultProcessing()

    # --- joueurs ----------------------------------------------------------

    def _schedulePlayersUpdate(self) -> None:
        self.server.scheduler.run_task(self, self._sendPlayers, delay=100)

    def _sendPlayers(self) -> None:
        if not self.config.get("sendPlayers"):
            return

        players = []

        for player in self.server.online_players:
            try:
                skin = player.skin.image
                skinHex = skin.tobytes().hex()
                skinShape = list(skin.shape)
            except Exception:  # noqa: BLE001 - skin indisponible
                skinHex = ""
                skinShape = []

            players.append(
                {
                    "name": player.name,
                    "xuid": player.xuid,
                    "skin": skinHex,
                    "skinShape": skinShape,
                    "dimension": player.dimension.name,
                    "x": player.location.x,
                    "y": player.location.y,
                    "z": player.location.z,
                }
            )

        self._playersQueue.put({"players": players})

        self._schedulePlayersUpdate()

    # --- lecture du monde -------------------------------------------------

    def _blacklist(self) -> set:
        """Identifiants de blocs ignores (config ``blacklist.blocks``).

        Les entrees amont se terminant par ``.png`` sont des restes de la table
        de textures : on les ignore pour ne pas masquer de vrais blocs.
        """
        blacklist = self.config.get("blacklist") or {}
        blocks = blacklist.get("blocks") or []
        return {b for b in blocks if isinstance(b, str) and not b.endswith(".png")}

    def _getChunkData(self, event: ChunkLoadEvent) -> dict:
        world = event.chunk.dimension
        chunkX = event.chunk.x
        chunkZ = event.chunk.z

        chunkStartX = chunkX * 16
        chunkStartZ = chunkZ * 16

        blocksData = []
        blacklist = self._blacklist()

        for x in range(chunkStartX, chunkStartX + 16):
            for z in range(chunkStartZ, chunkStartZ + 16):
                block = world.get_highest_block_at(x, z)
                blockType = blockId(block)

                # On descend tant que le bloc est ignore (herbe, fleurs,
                # cloisons...) pour atteindre le sol visible.
                while (blockType in blacklist or blockType in AIR_IDS) and block.y > -64:
                    block = block.get_relative(BlockFace.DOWN, 1)
                    blockType = blockId(block)

                blocksData.append(
                    {"name": blockType, "coordinates": [block.x, block.y, block.z]}
                )

        return {
            "chunk": {
                "dimension": world.name,
                "blocks": blocksData,
            }
        }
