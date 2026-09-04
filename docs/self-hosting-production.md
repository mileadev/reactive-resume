# Production self-hosting

Use `compose.production.yml` for production-like deployments. The root `compose.yml` remains a convenience stack for local evaluation and should not be treated as a hardened production manifest.

## Security model

The production profile intentionally:

- requires explicit immutable image references instead of `latest`;
- exposes only the application service;
- keeps PostgreSQL, Redis, and object storage on Docker-internal networks;
- requires non-default database, Redis, object-storage, authentication, and encryption secrets;
- runs the application with a read-only root filesystem, no Linux capabilities, and `no-new-privileges`;
- keeps API rate limiting enabled;
- keeps unsafe AI base URLs and unsafe OAuth redirect URIs disabled;
- binds the application to loopback by default so a reverse proxy/TLS terminator can own the public listener.

## Required environment

Create an operator-owned environment file that is not committed to source control. At minimum set:

```dotenv
APP_URL=https://resume.example.com
BIND_ADDRESS=127.0.0.1
PORT=3000

# Pin every image. Digests are preferred over mutable tags.
REACTIVE_RESUME_IMAGE=ghcr.io/mileadev/reactive-resume@sha256:REPLACE_ME
POSTGRES_IMAGE=postgres:16.15-alpine
REDIS_IMAGE=redis:8.4.6-alpine
SEAWEEDFS_IMAGE=chrislusf/seaweedfs:4.45
MC_IMAGE=quay.io/minio/mc@sha256:REPLACE_ME

POSTGRES_DB=reactive_resume
POSTGRES_USER=reactive_resume
POSTGRES_PASSWORD=REPLACE_WITH_RANDOM_SECRET
DATABASE_URL=postgresql://reactive_resume:URL_ENCODED_PASSWORD@postgres:5432/reactive_resume

REDIS_PASSWORD=REPLACE_WITH_RANDOM_SECRET

S3_ACCESS_KEY_ID=REPLACE_WITH_RANDOM_ID
S3_SECRET_ACCESS_KEY=REPLACE_WITH_RANDOM_SECRET
S3_BUCKET=reactive-resume
S3_REGION=us-east-1

AUTH_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES
ENCRYPTION_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES
```

`DATABASE_URL` is a URI. Percent-encode characters in the PostgreSQL password that are not URI-safe.

Generate secrets with a cryptographically secure generator, for example:

```sh
openssl rand -hex 32
```

Do not reuse secrets between environments.

## Deploy

```sh
docker compose --env-file .env.production -f compose.production.yml config --quiet
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up -d
```

Keep TLS termination in a dedicated reverse proxy or ingress and forward only to `127.0.0.1:3000` unless the host/network design requires a different bind address.

## Release pinning

Before promotion, resolve the exact image digest and record it in the deployment environment. Treat version tags as discovery inputs, not deployment identities. Promote the same digest through staging and production rather than rebuilding by environment.

PostgreSQL 16.15 is the supported 16.x maintenance release used by this profile's example at the time this document was written. Redis and SeaweedFS versions shown above are examples; operators should pin a tested current stable release or digest and update it through normal change control.

## Backups and restore testing

Back up all three state classes independently:

1. PostgreSQL database;
2. SeaweedFS/object-storage data;
3. deployment configuration and secret references (not plaintext secrets in the backup repository).

A backup is not considered valid until a restore has been exercised in an isolated environment and application-level integrity checks pass. Record recovery-point and recovery-time objectives explicitly.

## Upgrade procedure

1. back up state and verify the latest restore test;
2. review application/database release notes and migrations;
3. pin new image digests in staging;
4. run migrations and smoke/E2E tests against staging;
5. promote the exact application and dependency digests;
6. verify `/api/health`, authentication, resume rendering/export, agent operations, and storage;
7. keep the previous image digest and compatible database backup available for rollback.

Never roll back a database migration blindly. Use the migration's documented compatibility window and restore procedure.
