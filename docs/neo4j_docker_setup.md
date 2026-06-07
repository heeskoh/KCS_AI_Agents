# Neo4j Docker Setup

## Current Status

Neo4j is configured with:

- Compose file: `docker-compose.neo4j.yml`
- Container name: `kcs-neo4j`
- Image: `neo4j:5-community`
- Browser URL: `http://localhost:7474`
- Bolt URI: `bolt://localhost:7687`
- Username: `neo4j`
- Password: `kcsneo4j1234`

## Start Neo4j

```powershell
docker compose -f docker-compose.neo4j.yml up -d
```

## Check Status

```powershell
docker compose -f docker-compose.neo4j.yml ps
```

## View Logs

```powershell
docker compose -f docker-compose.neo4j.yml logs --tail 60
```

## Stop Neo4j

```powershell
docker compose -f docker-compose.neo4j.yml stop
```

## Start Again

```powershell
docker compose -f docker-compose.neo4j.yml start
```

## Remove Container

This removes the container but keeps named volumes.

```powershell
docker compose -f docker-compose.neo4j.yml down
```

## Remove Data Volumes

Only use this when you intentionally want to delete Neo4j data.

```powershell
docker compose -f docker-compose.neo4j.yml down -v
```

## First Browser Login

Open:

```text
http://localhost:7474
```

Use:

```text
Username: neo4j
Password: kcsneo4j1234
```

Run this test query:

```cypher
RETURN "KCS Neo4j ready" AS message;
```
