"""Commandes d'administration : python -m server.manage <commande> …

  create-user <nom> [--password-stdin]      crée le compte
  change-password <nom> [--password-stdin]  change le mot de passe (déconnecte tous les appareils)
  backup <dossier>                          copie la base et garde les 14 plus récentes
"""
import argparse
import datetime
import getpass
import os
import sqlite3
import sys
from pathlib import Path

from server import db
from server.auth import MAX_PASSWORD, MIN_PASSWORD, hash_password, normalize_username

KEEP_BACKUPS = 14


class CommandError(Exception):
    pass


def _db_path() -> str:
    return os.environ.get("RU_APP_DB", "data.db")


def _read_password(from_stdin: bool, stdin) -> str:
    if from_stdin:
        password = stdin.readline().rstrip("\r\n")
    else:
        password = getpass.getpass("Mot de passe : ")
        if getpass.getpass("Confirme le mot de passe : ") != password:
            raise CommandError("Les deux mots de passe sont différents.")
    if not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        raise CommandError(f"Le mot de passe doit faire entre {MIN_PASSWORD} et {MAX_PASSWORD} caractères.")
    return password


def _username(raw: str) -> str:
    name = normalize_username(raw)
    if name is None:
        raise CommandError("Identifiant invalide : 1 à 32 caractères parmi a-z, 0-9, _ et -.")
    return name


def create_user(args, stdin, stdout) -> None:
    name = _username(args.name)
    conn = db.connect(_db_path())
    try:
        if db.get_user_by_name(conn, name):
            raise CommandError(f"L'utilisateur « {name} » existe déjà.")
        password = _read_password(args.password_stdin, stdin)
        db.create_user(conn, name, hash_password(password), datetime.datetime.now().isoformat(timespec="seconds"))
    finally:
        conn.close()
    print(f"Compte « {name} » créé.", file=stdout)


def change_password(args, stdin, stdout) -> None:
    name = _username(args.name)
    conn = db.connect(_db_path())
    try:
        user = db.get_user_by_name(conn, name)
        if user is None:
            raise CommandError(f"L'utilisateur « {name} » n'existe pas.")
        password = _read_password(args.password_stdin, stdin)
        db.set_password(conn, user["id"], hash_password(password))
        db.delete_user_sessions(conn, user["id"])
    finally:
        conn.close()
    print(f"Mot de passe de « {name} » changé. Tous les appareils sont déconnectés.", file=stdout)


def backup(args, stdin, stdout) -> None:
    folder = Path(args.folder)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"data-{datetime.date.today().isoformat()}.db"
    source = db.connect(_db_path())
    dest = sqlite3.connect(str(target))
    try:
        source.backup(dest)
    finally:
        dest.close()
        source.close()
    for old in sorted(folder.glob("data-*.db"))[:-KEEP_BACKUPS]:
        old.unlink()
    print(f"Sauvegarde : {target}", file=stdout)


def main(argv: list[str], stdin=sys.stdin, stdout=sys.stdout) -> int:
    parser = argparse.ArgumentParser(prog="python -m server.manage", description="Administration de l'appli.")
    sub = parser.add_subparsers(dest="command", required=True)
    for name, func in [("create-user", create_user), ("change-password", change_password)]:
        p = sub.add_parser(name)
        p.add_argument("name")
        p.add_argument("--password-stdin", action="store_true", help="lit le mot de passe sur l'entrée standard")
        p.set_defaults(func=func)
    p = sub.add_parser("backup")
    p.add_argument("folder")
    p.set_defaults(func=backup)

    args = parser.parse_args(argv)
    try:
        args.func(args, stdin, stdout)
    except CommandError as error:
        print(f"Erreur : {error}", file=stdout)
        return 1
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # accents lisibles aussi dans une console Windows
    sys.exit(main(sys.argv[1:]))
