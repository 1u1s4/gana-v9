// Verificación estructural offline, no prueba de inferencia ni de autenticación
// Uso: node pi-sdk-smoke.mjs /ruta/al/paquete-temporal-con-pi-1.2.0
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Indicá el directorio con Pi 1.2.0 instalado');
const modules = join(resolve(process.argv[2]), 'node_modules', '@earendil-works');
const packageDir = join(modules, 'pi-coding-agent');
const packageEntry = join(packageDir, 'dist/index.js');
const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
assert.equal(packageJson.version, '1.2.0');

// Evitar heredar credenciales al crear el runtime del SDK
for (const name of Object.keys(process.env)) {
  if (/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|DATABASE_URL|DIRECT_URL|AUTH)|^(?:GANA_|AGENT_)/.test(name)) {
    delete process.env[name];
  }
}
let fetchAttempts = 0;
globalThis.fetch = async () => { fetchAttempts++; throw new Error('Red deshabilitada en este smoke'); };

const { createAgentSession, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager } =
  await import(pathToFileURL(packageEntry).href);
const { getModel } = await import(pathToFileURL(join(modules, 'pi-ai/dist/compat.js')).href);
const { Type } = await import(pathToFileURL(join(modules, 'pi-ai/dist/index.js')).href);
const root = mkdtempSync(join(tmpdir(), 'gana-pi-offline-'));
const agentDir = join(root, 'agent');
mkdirSync(agentDir);
let session;
try {
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: null,
    modelsStorePath: join(agentDir, 'models-cache.json'),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const models = ['gpt-5.6-sol', 'gpt-6-astra'].map(id => {
    const model = getModel('openai-codex', id);
    assert.ok(model, `Modelo ausente del catálogo: ${id}`);
    return { id, api: model.api };
  });
  const loader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => 'Verificación local, sin inferencia ni efectos externos',
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
  const created = await createAgentSession({
    cwd: root,
    agentDir,
    modelRuntime,
    model: getModel('openai-codex', 'gpt-5.6-sol'),
    thinkingLevel: 'high',
    sessionManager: SessionManager.inMemory(root),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
    resourceLoader: loader,
    tools: ['gana_inspect_contract'],
    customTools: [{
      name: 'gana_inspect_contract', label: 'Inspect contract',
      description: 'Local structural test only',
      parameters: Type.Object({ name: Type.String() }),
      execute: async (_id, args) => ({ content: [{ type: 'text', text: args.name }], details: {} }),
    }],
  });
  session = created.session;
  assert.deepEqual(session.getActiveToolNames(), ['gana_inspect_contract']);
  assert.equal(session.thinkingLevel, 'high');
  assert.ok(session.getToolDefinition('gana_inspect_contract'));
  const unsubscribe = session.subscribe(() => {});
  unsubscribe();
  assert.equal(session.messages.length, 0);
  assert.equal(fetchAttempts, 0);
  const authCreated = readdirSync(agentDir).includes('auth.json');
  if (authCreated) assert.deepEqual(JSON.parse(readFileSync(join(agentDir, 'auth.json'), 'utf8')), {});
  console.log(JSON.stringify({
    ok: true, piVersion: packageJson.version, models,
    activeTools: session.getActiveToolNames(), thinkingLevel: session.thinkingLevel,
    fetchAttempts, modelRequests: 0, credentialsCopied: false, authStoreEmpty: true,
    limitation: 'No comprueba login, inferencia, búsqueda web, enforcement de tools ni paridad E2E',
  }, null, 2));
} finally {
  session?.dispose();
  rmSync(root, { recursive: true, force: true });
}
