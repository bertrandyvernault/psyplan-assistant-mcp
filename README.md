# psyplan-assistant-mcp

Service mince exposant à **OpenClaw** une API conforme au **Model Context Protocol (MCP)**, en agissant comme passerelle vers l'API HTTP de `psyplan-backend`.

Il ne contient **aucune logique métier** : il traduit les appels MCP en appels HTTP backend, valide les entrées/sorties (Zod) et retourne des réponses structurées. `psyplan-backend` reste la source de vérité.

```
WhatsApp ──► OpenClaw ──MCP──► psyplan-assistant-mcp ──HTTP──► psyplan-backend ──► PostgreSQL
```

## Tools V0

| Tool | Endpoint backend | Description |
|---|---|---|
| `schedule.get_today` | `GET /assistant/practitioner/today-schedule` | Planning du jour du praticien |
| `availability.get_for_date` | `GET /assistant/practitioner/available-slots?date=YYYY-MM-DD` | Créneaux libres pour une date |

## Prérequis

- Node 20+ LTS (pour le `fetch` natif)
- npm

## Démarrage local

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Éditer .env : générer une clé avec `openssl rand -hex 32`
#   PSYPLAN_BACKEND_ASSISTANT_API_KEY=<clé>
#   PSYPLAN_BACKEND_URL=http://localhost:8080   (en local hors Docker)

# 3. Lancer en mode dev (watch)
npm run dev

# ou build + start production
npm run build
npm start
```

Le service écoute sur `PORT` (3000 par défaut), avec :
- `POST /mcp` — endpoint MCP (transport StreamableHTTP, stateless)
- `GET /health` — healthcheck Docker (`{"status":"ok"}`)

## Variables d'environnement

| Variable | Type | Obligatoire | Défaut | Description |
|---|---|---|---|---|
| `PSYPLAN_BACKEND_URL` | URL | Oui | — | URL interne du backend (`http://psyplan-backend:8080`) |
| `PSYPLAN_BACKEND_ASSISTANT_API_KEY` | string (≥32) | Oui | — | Clé API partagée avec le backend |
| `PORT` | int | Non | `3000` | Port d'écoute du MCP |
| `LOG_LEVEL` | enum | Non | `info` | `fatal\|error\|warn\|info\|debug\|trace` |
| `BACKEND_TIMEOUT_MS` | int | Non | `5000` | Timeout des appels backend (ms) |

Le service **refuse de démarrer** (exit 1) si la config est invalide — pas de fallback silencieux.

## Commandes

| Commande | Description |
|---|---|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Lance `dist/server.js` (build requis) |
| `npm run dev` | Mode watch (`tsx watch src/server.ts`) |
| `npm test` | Tests unitaires Vitest (run unique) |
| `npm run test:watch` | Tests Vitest en watch |

## Docker

```bash
# Build de l'image
docker build -t psyplan-assistant-mcp .

# Via docker-compose (avec backend + openclaw, réseau psyplan-internal)
# ASSISTANT_API_KEY doit être présent dans le .env du VPS
docker compose up psyplan-backend psyplan-assistant-mcp
```

Le MCP **n'expose aucun port** sur l'hôte : il n'est joignable que via le réseau Docker interne `psyplan-internal` (par OpenClaw). Docker le considère prêt quand `GET /health` répond 200.

## Sécurité & logs

- La clé API (`X-Assistant-Api-Key`) et le numéro WhatsApp (PII) ne sont **jamais** loggés en `info`.
- Chaque appel backend est logué en JSON structuré avec un `requestId` (UUID v4) corrélé au header `X-Assistant-Request-Id`.
- Le contenu des réponses (sessions, créneaux) n'est jamais logué — uniquement la métadonnée (status, latence).

## Runbook ops

### Le MCP est down

Symptômes : OpenClaw ne répond plus aux messages WhatsApp ; healthcheck Docker en `unhealthy`.

1. Vérifier l'état du conteneur : `docker compose ps psyplan-assistant-mcp`
2. Consulter les logs : `docker compose logs --tail=100 psyplan-assistant-mcp`
   - Config invalide au boot → message `Invalid configuration` puis exit 1. Corriger le `.env` du VPS.
   - `BACKEND_UNREACHABLE` répété → le backend est down ou injoignable. Vérifier `psyplan-backend`.
3. Redémarrer : `docker compose up -d psyplan-assistant-mcp`
4. Vérifier le healthcheck depuis le réseau interne :
   `docker compose exec psyplan-assistant-mcp wget -qO- http://localhost:3000/health`
   → doit retourner `{"status":"ok"}`

Le service étant **stateless**, un redémarrage est sans risque : aucune session ni donnée en mémoire à perdre.

### Rotation de la clé API (`ASSISTANT_API_KEY`)

La clé est partagée entre le MCP (`PSYPLAN_BACKEND_ASSISTANT_API_KEY`) et le backend (`ASSISTANT_API_KEY`). Elle doit être identique des deux côtés.

1. Générer une nouvelle clé : `openssl rand -hex 32`
2. Mettre à jour le `.env` du VPS (la variable `ASSISTANT_API_KEY` est injectée dans les deux services par docker-compose).
3. Redéployer les **deux** services ensemble pour éviter une fenêtre d'incohérence :
   `docker compose up -d psyplan-backend psyplan-assistant-mcp`
4. Vérifier qu'un appel tool réussit (pas de `ASSISTANT_PRACTITIONER_UNKNOWN` / 401 lié à la clé).

La clé n'est **jamais commitée** ; elle vit uniquement dans le `.env` du VPS.
