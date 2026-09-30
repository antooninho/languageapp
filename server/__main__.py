"""Lance le serveur : python -m server [--dev] [--host 127.0.0.1] [--port 8000]

Variables d'environnement : RU_APP_DB (base, défaut ./data.db), RU_APP_TRUST_PROXY=1 (derrière Caddy),
RU_APP_DEV=1 (équivalent de --dev : sert aussi l'appli, cookie non « Secure » pour http://localhost).
"""
import argparse
import os

import uvicorn

from server.app import create_app


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m server")
    parser.add_argument("--dev", action="store_true", help="sert aussi l'appli, pour développer en local")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    dev = args.dev or os.environ.get("RU_APP_DEV") == "1"
    app = create_app(os.environ.get("RU_APP_DB", "data.db"), dev=dev,
                     trust_proxy=os.environ.get("RU_APP_TRUST_PROXY") == "1")
    if dev:
        print(f"Appli : http://localhost:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
