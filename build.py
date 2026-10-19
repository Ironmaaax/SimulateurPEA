#!/usr/bin/env python3
"""Assemble src/ en un seul fichier HTML autonome : dist/simulateur-etf-pea.html"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "simulateur-etf-pea.html"

HEAD = '''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Simulateur ETF PEA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600&display=swap">
'''

def main():
    css = (SRC / "style.css").read_text(encoding="utf-8")
    body = (SRC / "body.html").read_text(encoding="utf-8")
    core = (SRC / "core.js").read_text(encoding="utf-8")
    ui = (SRC / "ui.js").read_text(encoding="utf-8")
    html = (HEAD + "<style>\n" + css + "\n</style>\n</head>\n<body>\n" + body +
            "\n<script>\n" + core + "\n</script>\n<script>\n" + ui + "\n</script>\n</body>\n</html>\n")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} : {OUT.stat().st_size} octets")
    # Page d’accueil de GitHub Pages et cours publiés à côté du simulateur.
    shutil.copyfile(OUT, OUT.parent / "index.html")
    cours = ROOT / "data" / "cours.json"
    if cours.exists():
        shutil.copyfile(cours, OUT.parent / "cours.json")

if __name__ == "__main__":
    main()
