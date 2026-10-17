import math

from typing import List, Tuple

from endstone.command import Command, CommandSender, CommandExecutor
from endstone.plugin import Plugin


def message(config: dict, key: str, **values) -> str:
    """Message traduit depuis la config, tolerant a une cle absente.

    L'amont faisait ``self.messages.get(key).format(...)`` : si l'utilisateur
    supprimait une cle de son config.toml, la commande levait une
    AttributeError sur None. On retombe sur une chaine vide.
    """
    messages: dict = config.get("messages") or {}
    template = messages.get(key) or ""
    try:
        return template.format(**values)
    except (KeyError, IndexError, ValueError):
        return template


class MapLoader():
    def __init__(self, plugin: Plugin):
        self.plugin = plugin
        self.isLoading = False

        self.messages: dict = self.plugin.config.get("messages", {})
        self.areasQueue: List[Tuple[int, int, int, int, str]] = []

        self.batchId = 0
        self.totalBatches = 0
        self.completedBatches = 0
        
    def startLoading(self, minX: int, minZ: int, maxX: int, maxZ: int, batchSize: int, maxAreas: int) -> None:
        if self.isLoading:
            self.plugin.logger.warning(
                message(self.plugin.config, "mapLoadingAlreadyRunning")
            )
            return
        
        self.isLoading = True
        self.areasQueue = []
        self.maxAreas = maxAreas
        self.completedBatches = 0
        
        areaCount = 0
        for x in range(minX, maxX, batchSize):
            for z in range(minZ, maxZ, batchSize):
                endX = min(x + batchSize, maxX)
                endZ = min(z + batchSize, maxZ)

                areaId = f"loadmap-{areaCount}"

                self.areasQueue.append((x, z, endX, endZ, areaId))
                areaCount += 1
        
        self.totalBatches = math.ceil(areaCount / maxAreas)
        
        self.plugin.logger.info(
            message(self.plugin.config, "mapLoadingStartedLog", areaCount=areaCount)
        )
        self._nextBatch()

    def _nextBatch(self) -> None:
        if not self.areasQueue:
            self._finishLoading()
            return
        
        batch = []
        for _ in range(min(self.maxAreas, len(self.areasQueue))):
            batch.append(self.areasQueue.pop(0))
        
        self.completedBatches += 1
        batchNum = self.completedBatches
        
        percentage = (batchNum / self.totalBatches * 100) if self.totalBatches > 0 else 0
        
        self.plugin.logger.info(
            message(
                self.plugin.config,
                "processingBatch",
                batchSize=len(batch),
                remaining=len(self.areasQueue),
                currentBatch=batchNum,
                totalBatches=self.totalBatches,
                percentage=percentage,
            )
        )
        
        for x, z, endX, endZ, areaId in batch:
            command = f"tickingarea add {x} 0 {z} {endX} 0 {endZ} {areaId}"
            self.plugin.server.dispatch_command(self.plugin.server.command_sender, command)
        
        self.batchId += 1

        # Le tracker est cree dans Map.on_load ; getattr evite un crash si la
        # commande est resolue avant (c'etait un bug de l'amont : le tracker
        # n'existait qu'apres on_enable).
        tracker = getattr(self.plugin, "batchTracker", None)
        if tracker is not None:
            tracker.startBatch(
                batchId=self.batchId,
                areas=batch,
                onComplete=lambda: self._removeBatch(batch),
            )

    def _removeBatch(self, batch: List[Tuple[int, int, int, int, str]]) -> None:
        for _, _, _, _, areaId in batch:
            command = f"tickingarea remove {areaId}"
            self.plugin.server.dispatch_command(self.plugin.server.command_sender, command)
        
        self.plugin.logger.info(
            message(self.plugin.config, "batchProcessed", batchSize=len(batch))
        )

        self.plugin.server.scheduler.run_task(self.plugin, self._nextBatch, 1)

    def _finishLoading(self) -> None:
        self.isLoading = False
        tracker = getattr(self.plugin, "batchTracker", None)
        if tracker is not None:
            tracker.cancelBatch()
        self.plugin.logger.info(message(self.plugin.config, "mapLoadingFinished"))


class LoadmapCommand(CommandExecutor):
    def __init__(self, plugin: Plugin):
        super().__init__()
        self.plugin = plugin
        self.mapLoader = MapLoader(plugin)

        self.messages: dict = self.plugin.config.get("messages", {})
        self.config: dict = self.plugin.config

        self.batchSize = self.config.get("mapLoading", {}).get("batchSize", 100)
        self.maxAreas = self.config.get("mapLoading", {}).get("maxAreas", 10)
    
    def clearAreas(self):
        self.plugin.server.dispatch_command(self.plugin.server.command_sender, "tickingarea remove_all")

    def on_command(self, sender: CommandSender, command: Command, args: List[str]) -> bool:                    
        if len(args) == 0:
            self.clearAreas()
            
            defaultArea: dict = self.config.get("mapLoading", {}).get("defaultArea", {})
            
            minX = defaultArea.get("minX")
            minZ = defaultArea.get("minZ")
            maxX = defaultArea.get("maxX")
            maxZ = defaultArea.get("maxZ")
            
            self.mapLoader.startLoading(minX, minZ, maxX, maxZ, self.batchSize, self.maxAreas)
            sender.send_message(
                message(self.config, "loadingStarted", minX=minX, minZ=minZ, maxX=maxX, maxZ=maxZ)
            )

        elif args[0].lower() == "status":
            if self.mapLoader.isLoading:
                remaining = len(self.mapLoader.areasQueue)
                sender.send_message(
                    message(self.config, "loadingInProgress", remaining=remaining)
                )
            else:
                sender.send_message(message(self.config, "loadingNotRunning"))
                
        elif len(args) == 4:
            self.clearAreas()

            try:
                minX, minZ, maxX, maxZ = map(int, args[:4])
            except ValueError:
                sender.send_message(message(self.config, "invalidCoordinates"))
                return True

            if minX >= maxX or minZ >= maxZ:
                sender.send_message(message(self.config, "invalidCoordinates"))
                return True

            self.mapLoader.startLoading(minX, minZ, maxX, maxZ, self.batchSize, self.maxAreas)
            sender.send_message(
                message(self.config, "loadingStarted", minX=minX, minZ=minZ, maxX=maxX, maxZ=maxZ)
            )

        elif args[0].lower() == "help":
            sender.send_message(message(self.config, "helpUsage"))
            sender.send_message(message(self.config, "helpDefault"))
            sender.send_message(message(self.config, "helpCustom"))
            sender.send_message(message(self.config, "helpStatus"))
            sender.send_message(message(self.config, "helpInfo"))
            
        return True