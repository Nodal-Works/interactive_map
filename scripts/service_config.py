import os
from pathlib import Path
import sys
from services import configuration, ROOT

config = configuration(os.environ.get('MR_SERVICES_CONFIG'))
key = sys.argv[1]
print((ROOT / config[key]).resolve() if key == 'sam_directory' else config[key])
