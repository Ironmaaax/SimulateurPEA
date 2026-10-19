#!/usr/bin/env python3
"""Récupère les derniers cours des ETF (Yahoo Finance, via yfinance) et écrit data/cours.json.

Lancé par GitHub Actions (.github/workflows/cours.yml) ; utilisable aussi à la main :
    pip install yfinance
    python scripts/maj_cours.py
"""
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "cours.json"

# Code de l'ETF dans le simulateur -> symbole Yahoo. Les codes absents d'ici prennent « CODE.PA » (Euronext Paris).
SYMBOLES = {}


def codes_etf():
    """Lit les codes des ETF d'origine dans src/core.js."""
    core = (ROOT / "src" / "core.js").read_text(encoding="utf-8")
    bloc = core[core.index("const DEFAULT_DATA"):core.index("const CUR_YEAR")]
    return re.findall(r'\{ id: "([A-Za-z0-9_-]+)"', bloc)


def arrondi(x, n=4):
    return None if x is None or not math.isfinite(x) else round(float(x), n)


def cours(code):
    sym = SYMBOLES.get(code, code + ".PA")
    hist = yf.Ticker(sym).history(period="2y", interval="1d", auto_adjust=True)
    hist = hist[hist["Close"].notna()]
    if hist.empty:
        raise ValueError("aucun cours pour " + sym)
    close = hist["Close"]
    last, when = float(close.iloc[-1]), close.index[-1]
    prev = float(close.iloc[-2]) if len(close) > 1 else math.nan
    fin_an = close[close.index.year < when.year]
    ytd = last / float(fin_an.iloc[-1]) - 1 if len(fin_an) else math.nan
    un_an = close[close.index <= when - pd.DateOffset(years=1)]
    perf1y = last / float(un_an.iloc[-1]) - 1 if len(un_an) else math.nan
    rets = (close / close.shift(1)).apply(math.log).dropna().tail(252)
    vol1y = float(rets.std() * math.sqrt(252)) if len(rets) > 20 else math.nan
    return {
        "symbol": sym,
        "price": arrondi(last, 4),
        "date": when.strftime("%Y-%m-%d"),
        "change1d": arrondi(last / prev - 1),
        "ytd": arrondi(ytd),
        "perf1y": arrondi(perf1y),
        "vol1y": arrondi(vol1y),
    }


def main():
    res, erreurs = {}, {}
    for code in codes_etf():
        try:
            res[code] = cours(code)
            print(f"{code:6} {res[code]['symbol']:10} {res[code]['price']:>10} au {res[code]['date']}")
        except Exception as e:  # un ETF en échec ne bloque pas les autres
            erreurs[code] = str(e)
            print(f"{code:6} ÉCHEC : {e}", file=sys.stderr)
    if not res:
        sys.exit("Aucun cours récupéré : data/cours.json inchangé.")
    # Garde le dernier cours connu d'un ETF en échec plutôt que de le perdre.
    if erreurs and OUT.exists():
        ancien = json.loads(OUT.read_text(encoding="utf-8")).get("etfs", {})
        for code in erreurs:
            if code in ancien:
                res[code] = ancien[code]
    out = {
        "source": "Yahoo Finance (cours de clôture ou dernier cours, en EUR)",
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "etfs": res,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} écrit ({len(res)} ETF).")


if __name__ == "__main__":
    main()
