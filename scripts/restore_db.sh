#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
    printf 'Uso: %s <arquivo-de-backup>\n' "$0" >&2
    exit 2
fi

BACKUP_FILE="$1"
if [[ "$BACKUP_FILE" != /* ]]; then
    BACKUP_FILE="$(pwd)/$BACKUP_FILE"
fi
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$ROOT_DIR"

if [[ ! -f "$BACKUP_FILE" || ! -s "$BACKUP_FILE" ]]; then
    printf 'Erro: arquivo de backup inexistente ou vazio: %s\n' "$BACKUP_FILE" >&2
    exit 2
fi

printf 'ATENÇÃO: a restauração substitui objetos existentes no banco de dados.\n'
printf 'Arquivo: %s\n' "$BACKUP_FILE"
read -r -p 'Digite RESTORE para confirmar: ' CONFIRMATION
if [[ "$CONFIRMATION" != 'RESTORE' ]]; then
    printf 'Restauração cancelada; o banco não foi alterado.\n'
    exit 1
fi

printf 'Verificando disponibilidade do PostgreSQL...\n'
docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

printf 'Iniciando restauração verbose. Objetos existentes presentes no backup serão removidos/substituídos.\n'
docker compose exec -T db sh -c 'exec pg_restore --verbose --clean --if-exists --no-owner --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -' < "$BACKUP_FILE"
printf 'Restauração concluída com sucesso a partir de: %s\n' "$BACKUP_FILE"
