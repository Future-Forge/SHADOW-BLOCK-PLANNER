import os
import sys
import logging
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from ai_engine.reoptimizer import start_reoptimizer_listener

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("background_worker")

if __name__ == "__main__":
    logger.info("Initializing Shadow-Blockplanner Background Event Worker...")
    try:
        start_reoptimizer_listener()
    except KeyboardInterrupt:
        logger.info("Background Event Worker terminated by user.")
    except Exception as e:
        logger.error(f"Fatal worker exception: {e}", exc_info=True)
        sys.exit(1)
