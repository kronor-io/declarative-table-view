import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import type { DtvAnalyticsSource } from '../config.js';

/*
 * The compose project of one source of a host: the server, its store and the store's Hasura,
 * listening on 127.0.0.1 only. The store keeps its volume between runs.
 */

export type ComposeOptions = {
    /** The host's name, from its folder: projects of two hosts do not share a store. */
    host: string;
    sourceName: string;
    source: DtvAnalyticsSource;
    /** The folder with the definitions bundle, mounted into the server. */
    workDir: string;
    image: string;
    port: number;
    hasuraPort: number;
};

/** In the container, `localhost` is the container: a source on the host is reached through Docker's host name. */
export function containerEndpoint(endpoint: string): string {
    const url = new URL(endpoint);
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')) {
        url.hostname = 'host.docker.internal';
    }
    return url.toString();
}

export function projectName(host: string, sourceName: string): string {
    return `dtv-analytics-${host}-${sourceName}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

/** The server's configuration, as the server reads it in its container. */
export function serverConfig(options: ComposeOptions): unknown {
    const { source } = options;
    return {
        port: 8090,
        store: 'postgresql://postgres:postgres@store:5432/postgres',
        migrations: '/app/store/migrations',
        app: '/app/public',
        sidecar: ['node', '/app/sidecar.mjs', '/dtv-analytics/definitions.mjs'],
        definitions: '/dtv-analytics/definitions.json',
        hasura: { endpoint: 'http://hasura:8080', metadata: '/app/store/hasura-metadata.json' },
        appHasura: `http://localhost:${options.hasuraPort}/v1/graphql`,
        source: {
            name: options.sourceName,
            endpoint: containerEndpoint(source.endpoint),
            role: source.role,
            headers: source.headers ?? {},
            secretHeaders: source.secretHeaders ?? {},
            namingConvention: source.namingConvention ?? 'graphql-default',
            pageSize: source.pageSize ?? 10000,
            events: source.events,
            userData: source.userData,
            users: source.users,
        },
    };
}

export function composeFile(options: ComposeOptions): unknown {
    const secret = randomBytes(16).toString('hex');
    const storeUrl = 'postgres://postgres:postgres@store:5432/postgres';
    const configFile = path.posix.join('/dtv-analytics', options.sourceName, 'config.json');
    // The source's secrets come from the environment `dtv-analytics up` runs in
    const secrets = Object.fromEntries(Object.values(options.source.secretHeaders ?? {}).map(variable => [variable, null]));
    return {
        name: projectName(options.host, options.sourceName),
        services: {
            store: {
                image: 'postgres:17',
                environment: { POSTGRES_PASSWORD: 'postgres' },
                volumes: ['store:/var/lib/postgresql/data'],
                healthcheck: { test: ['CMD', 'pg_isready', '-U', 'postgres'], interval: '2s', retries: 30 },
            },
            hasura: {
                image: 'hasura/graphql-engine:v2.46.0',
                depends_on: { store: { condition: 'service_healthy' } },
                environment: {
                    HASURA_GRAPHQL_DATABASE_URL: storeUrl,
                    HASURA_GRAPHQL_METADATA_DATABASE_URL: storeUrl,
                    HASURA_GRAPHQL_ADMIN_SECRET: secret,
                    HASURA_GRAPHQL_UNAUTHORIZED_ROLE: 'analyst',
                    HASURA_GRAPHQL_EXPERIMENTAL_FEATURES: 'naming_convention',
                    HASURA_GRAPHQL_ENABLE_CONSOLE: 'true',
                },
                ports: [`127.0.0.1:${options.hasuraPort}:8080`],
            },
            server: {
                image: options.image,
                depends_on: { store: { condition: 'service_healthy' }, hasura: { condition: 'service_started' } },
                environment: { DTV_ANALYTICS_STORE_SECRET: secret, ...secrets },
                volumes: [`${options.workDir}:/dtv-analytics:ro`],
                command: [configFile],
                ports: [`127.0.0.1:${options.port}:8090`],
                extra_hosts: ['host.docker.internal:host-gateway'],
            },
        },
        volumes: { store: {} },
    };
}
