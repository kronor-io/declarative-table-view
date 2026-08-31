import { readFile } from 'node:fs/promises';
import path from 'node:path';

type GeminiModel = {
    name?: string;
    displayName?: string;
    description?: string;
    version?: string;
    supportedGenerationMethods?: string[];
};

type ListModelsResponse = {
    models?: GeminiModel[];
    nextPageToken?: string;
};

function parseDotEnvFile(contents: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) continue;

        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        env[key] = value;
    }
    return env;
}

async function loadEnvDevelopment(repoRoot: string): Promise<Record<string, string>> {
    try {
        const dotenvPath = path.join(repoRoot, '.env.development');
        const raw = await readFile(dotenvPath, 'utf-8');
        return parseDotEnvFile(raw);
    } catch {
        return {};
    }
}

async function listModels(args: {
    apiKey: string;
    httpReferer?: string;
    origin?: string;
}): Promise<GeminiModel[]> {
    const headers: Record<string, string> = {};
    if (args.httpReferer) headers['Referer'] = args.httpReferer;
    if (args.origin) headers['Origin'] = args.origin;

    const models: GeminiModel[] = [];
    let pageToken: string | undefined;

    for (; ;) {
        const tokenPart = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(args.apiKey)}${tokenPart}`;
        const response = await fetch(url, { headers });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`ListModels failed (${response.status}): ${text}`);
        }
        const json = (await response.json()) as ListModelsResponse;
        models.push(...(json.models ?? []));

        pageToken = json.nextPageToken;
        if (!pageToken) break;
    }

    return models;
}

function hasGenerateContent(model: GeminiModel): boolean {
    return (model.supportedGenerationMethods ?? []).includes('generateContent');
}

async function main(): Promise<void> {
    const repoRoot = process.cwd();
    const envDevelopment = await loadEnvDevelopment(repoRoot);

    const apiKey =
        process.env.GEMINI_API_KEY ||
        process.env.VITE_GEMINI_API_KEY ||
        envDevelopment.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error(
            'Missing Gemini API key. Set GEMINI_API_KEY or VITE_GEMINI_API_KEY (or provide VITE_GEMINI_API_KEY in .env.development).'
        );
    }

    const httpReferer =
        process.env.GEMINI_HTTP_REFERER ||
        process.env.VITE_AI_TEST_GEMINI_HTTP_REFERER ||
        envDevelopment.VITE_AI_TEST_GEMINI_HTTP_REFERER;
    const origin = httpReferer ? new URL(httpReferer).origin : undefined;

    const models = await listModels({ apiKey, httpReferer, origin });

    const generateModels = models
        .filter(hasGenerateContent)
        .map((m) => ({
            name: m.name ?? '',
            displayName: m.displayName ?? '',
            version: m.version ?? '',
            methods: (m.supportedGenerationMethods ?? []).join(', '),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`Total models: ${models.length}`);
    console.log(`Models supporting generateContent: ${generateModels.length}`);
    console.log('');

    for (const m of generateModels) {
        console.log(`${m.name}`);
    }

    console.log('');
    console.log('Tip: pick a model from above and run:');
    console.log('  GEMINI_MODEL_ID=<model> npm run ai:gemini-regression');
}

await main();
