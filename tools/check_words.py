"""Vérifie la liste de base data/words.json.

Usage : python tools/check_words.py data/words.json
"""
import json
import re
import sys

STRESS = "́"
VOWELS = set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")
TYPES = {"nom", "verbe", "adjectif", "adverbe", "autre"}
GENRES = {"m", "f", "n"}
ID_RE = re.compile(r"^base-\d{4}$")


def _non_empty_str(v):
    return isinstance(v, str) and v.strip() != ""


def stress_errors(token):
    """Erreurs d'accent pour un mot (sans espace)."""
    letters = token.replace(STRESS, "")
    vowels = sum(1 for ch in letters if ch in VOWELS)
    stresses = token.count(STRESS)
    errors = []
    for i, ch in enumerate(token):
        if ch == STRESS and (i == 0 or token[i - 1] not in VOWELS):
            errors.append(f"accent mal placé dans « {token} »")
    if "ё" in letters.lower() or vowels <= 1:
        if stresses:
            errors.append(f"accent inutile dans « {token} »")
    elif stresses != 1:
        errors.append(f"« {token} » doit avoir exactement un accent (trouvé : {stresses})")
    return errors


def check_words(words):
    errors = []
    seen_ids = set()
    seen_ru = set()
    for w in words:
        wid = w.get("id", "?") if isinstance(w, dict) else "?"
        err = lambda msg: errors.append(f"{wid} : {msg}")
        if not isinstance(w, dict):
            err("entrée qui n'est pas un objet")
            continue
        if not isinstance(w.get("id"), str) or not ID_RE.match(w["id"]):
            err("id invalide (attendu base-NNNN)")
        elif w["id"] in seen_ids:
            err("id en double")
        else:
            seen_ids.add(w["id"])
        ru = w.get("ru")
        if not _non_empty_str(ru):
            err("champ ru manquant")
        else:
            key = ru.replace(STRESS, "").lower()
            if key in seen_ru:
                err(f"mot russe en double « {ru} »")
            seen_ru.add(key)
            for token in ru.split():
                for e in stress_errors(token):
                    err(e)
        fr = w.get("fr")
        if not isinstance(fr, list) or not fr or not all(_non_empty_str(f) for f in fr):
            err("traductions fr manquantes ou vides")
        if w.get("type") not in TYPES:
            err(f"type invalide « {w.get('type')} »")
        if w.get("type") == "nom":
            if w.get("genre") not in GENRES:
                err("genre manquant ou invalide pour un nom")
        elif "genre" in w:
            err("genre présent sur un mot qui n'est pas un nom")
        if "theme" in w and not isinstance(w["theme"], str):
            err("theme invalide")
        if w.get("source") != "base":
            err("source doit valoir « base »")
    return errors


def main(path):
    sys.stdout.reconfigure(encoding="utf-8")
    with open(path, encoding="utf-8") as f:
        words = json.load(f)
    errors = check_words(words)
    for e in errors:
        print(e)
    if errors:
        print(f"{len(errors)} erreur(s)")
        return 1
    print(f"OK : {len(words)} mots")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "data/words.json"))
