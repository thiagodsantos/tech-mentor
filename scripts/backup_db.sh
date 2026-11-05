#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$ROOT_DIR"
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP="$(date '+%Y-%m-%d_%H:%M:%S')"
BACKUP_FILE="$BACKUP_DIR/tech-mentor-backup-$TIMESTAMP.dump"

mkdir -p -- "$BACKUP_DIR"
if [[ -e "$BACKUP_FILE" ]]; then
    printf 'Erro: já existe um backup com o timestamp atual: %s\n' "$BACKUP_FILE" >&2
    exit 1
fi

printf 'Verificando disponibilidade do PostgreSQL...\n'
docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

printf 'Iniciando backup verbose do banco PostgreSQL em: %s\n' "$BACKUP_FILE"
if docker compose exec -T db sh -c 'exec pg_dump --verbose --format=custom --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' > "$BACKUP_FILE"; then
    printf 'Backup concluído com sucesso: %s (%s bytes)\n' "$BACKUP_FILE" "$(wc -c < "$BACKUP_FILE" | tr -d ' ')"
else
    rm -f -- "$BACKUP_FILE"
    printf 'Erro: o backup falhou; o arquivo incompleto foi removido.\n' >&2
    exit 1
fi
