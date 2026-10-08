from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = (root / 'shared' / 'engine.js').read_bytes()
for target in (root / 'dist' / 'engine.js', root / 'functions' / 'engine.js'):
    target.write_bytes(source)
    print(target)

