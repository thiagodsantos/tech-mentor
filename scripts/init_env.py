from __future__ import annotations

import base64
import os
import secrets
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
EXAMPLE_FILE = ROOT / ".env.example"


def main() -> None:
    if ENV_FILE.exists():
        print(".env já existe; mantendo as configurações e segredos atuais.")
        return

    content = EXAMPLE_FILE.read_text(encoding="utf-8")
    content = content.replace("POSTGRES_PASSWORD=replace-on-first-run", f"POSTGRES_PASSWORD={secrets.token_urlsafe(32)}")
    fernet_key = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
    content = content.replace("FERNET_KEY=", f"FERNET_KEY={fernet_key}")
    ENV_FILE.write_text(content, encoding="utf-8")
    os.chmod(ENV_FILE, 0o600)
    print(".env criado com senha do banco e chave Fernet aleatórias (permissão 0600).")
    print("Guarde FERNET_KEY em backup seguro: perdê-la impede decifrar a chave OpenRouter salva.")


if __name__ == "__main__":
    main()
