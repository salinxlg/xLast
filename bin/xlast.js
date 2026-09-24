#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { spawn, spawnSync } = require('node:child_process');
const packageInfo = require('../package.json');
const {
  createActivity,
  createPainter,
  printBrand,
  printInfo,
  printMenuActions,
  printMenuPanel,
  printResultCard,
  printSection,
  printStep,
  supportsAnimation,
  supportsColor
} = require('../lib/ui');

const BASE_VERSION = '7.0.0';
const MANIFEST_FILENAME = 'xrelease.json';
const MANIFEST_SCHEMA_VERSION = 1;
const PRODUCT_AUTHOR = 'Roger Salinas';
const PRODUCT_VENDOR = 'Dexly Studios';
const MINIMUM_NODE_MAJOR = 18;
const MAX_CAPTURED_OUTPUT = 384 * 1024;
const RELEASE_TYPES = new Set(['patch', 'minor', 'major']);

class XLastError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'XLastError';
    this.exitCode = exitCode;
  }
}

function normalizeReleaseType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const aliases = {
    p: 'patch',
    patch: 'patch',
    mn: 'minor',
    minor: 'minor',
    mj: 'major',
    major: 'major'
  };
  const type = aliases[normalized];
  if (!type) throw new XLastError(`Tipo de release desconocido: ${value}`);
  return type;
}

function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(String(value));
  if (!match) throw new XLastError(`La versión "${value}" no usa el formato Major.Minor.Patch.`);
  return match.slice(1).map(Number);
}

function bumpVersion(version, type) {
  const [major, minor, patch] = parseVersion(version);
  const releaseType = normalizeReleaseType(type);

  if (releaseType === 'major') return `${major + 1}.0.0`;
  if (releaseType === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function formatReleaseDate(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new XLastError('No pude calcular la fecha del release.');
  }
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildId(date, sequence) {
  return `X-${date.replaceAll('-', '')}${String(sequence).padStart(2, '0')}`;
}

function createReleaseManifest() {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    product: 'xLast',
    author: PRODUCT_AUTHOR,
    vendor: PRODUCT_VENDOR,
    version: BASE_VERSION,
    releaseCount: 0,
    lastType: null,
    locked: false,
    build: {
      date: null,
      sequence: 0,
      id: null
    },
    lastRelease: null
  };
}

function validateManifest(raw, manifestPath) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new XLastError(`${manifestPath} debe contener un objeto JSON.`);
  }
  if (raw.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new XLastError(`schemaVersion debe ser ${MANIFEST_SCHEMA_VERSION} en ${manifestPath}.`);
  }

  parseVersion(raw.version);
  if (!Number.isInteger(raw.releaseCount) || raw.releaseCount < 0) {
    throw new XLastError(`releaseCount debe ser un entero positivo o cero en ${manifestPath}.`);
  }
  if (raw.lastType !== null && !RELEASE_TYPES.has(raw.lastType)) {
    throw new XLastError(`lastType debe ser patch, minor, major o null en ${manifestPath}.`);
  }
  if (typeof raw.locked !== 'boolean') {
    throw new XLastError(`locked debe ser true o false en ${manifestPath}.`);
  }
  if (raw.locked && raw.lastType === null) {
    throw new XLastError(`xLast está bloqueado, pero ${manifestPath} no define lastType.`);
  }
  if (!raw.build || typeof raw.build !== 'object' || Array.isArray(raw.build)) {
    throw new XLastError(`build debe ser un objeto en ${manifestPath}.`);
  }
  if (raw.build.date !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(raw.build.date)) {
    throw new XLastError(`build.date no es válido en ${manifestPath}.`);
  }
  if (!Number.isInteger(raw.build.sequence) || raw.build.sequence < 0) {
    throw new XLastError(`build.sequence debe ser un entero positivo o cero en ${manifestPath}.`);
  }

  return {
    ...createReleaseManifest(),
    ...raw,
    author: typeof raw.author === 'string' && raw.author.trim() ? raw.author.trim() : PRODUCT_AUTHOR,
    vendor: typeof raw.vendor === 'string' && raw.vendor.trim() ? raw.vendor.trim() : PRODUCT_VENDOR,
    build: {
      date: raw.build.date,
      sequence: raw.build.sequence,
      id: raw.build.id === undefined ? null : raw.build.id
    }
  };
}

function readReleaseManifest(repositoryRoot) {
  const manifestPath = path.join(repositoryRoot, MANIFEST_FILENAME);
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return { exists: true, manifest: validateManifest(raw, manifestPath), manifestPath };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { exists: false, manifest: createReleaseManifest(), manifestPath };
    }
    if (error instanceof XLastError) throw error;
    throw new XLastError(`No pude leer ${manifestPath}: ${error.message}`);
  }
}

function writeReleaseManifest(manifestPath, manifest) {
  const temporaryPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
    fs.renameSync(temporaryPath, manifestPath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // El archivo temporal queda fuera del repositorio y no afecta el release.
    }
    throw new XLastError(`No pude guardar ${manifestPath}: ${error.message}`);
  }
}

function prepareRelease(manifest, type, date = new Date()) {
  const releaseType = normalizeReleaseType(type);
  const releaseDate = formatReleaseDate(date);
  const initial = manifest.releaseCount === 0;
  const version = initial ? BASE_VERSION : bumpVersion(manifest.version, releaseType);
  const sequence = manifest.build.date === releaseDate ? manifest.build.sequence + 1 : 1;
  const build = buildId(releaseDate, sequence);
  const message = `Release ${releaseDate} • Build: ${build} • v${version}`;

  return {
    build,
    date: releaseDate,
    initial,
    message,
    type: releaseType,
    version,
    manifest: {
      ...manifest,
      version,
      releaseCount: manifest.releaseCount + 1,
      lastType: releaseType,
      build: {
        date: releaseDate,
        sequence,
        id: build
      },
      lastRelease: {
        version,
        type: releaseType,
        date: releaseDate,
        build,
        message,
        createdAt: date.toISOString()
      }
    }
  };
}

function commandStatus(command, args = [], cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe',
    windowsHide: true
  });
  return {
    available: !result.error,
    error: result.error,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    status: result.status
  };
}

function requireSuccessful(result, message) {
  if (!result.available || result.status !== 0) {
    const detail = result.output ? `\n\nDetalle de Git:\n${result.output}` : '';
    throw new XLastError(`${message}${detail}`);
  }
  return result.output;
}

function getGitRoot(startDirectory = process.cwd()) {
  const gitVersion = commandStatus('git', ['--version'], startDirectory);
  if (!gitVersion.available && gitVersion.error && gitVersion.error.code === 'ENOENT') {
    throw new XLastError('Git no está instalado o no está disponible en PATH.');
  }
  requireSuccessful(gitVersion, 'Git no pudo ejecutarse correctamente.');

  const rootResult = commandStatus('git', ['rev-parse', '--show-toplevel'], startDirectory);
  return path.resolve(requireSuccessful(rootResult, 'Esta carpeta no pertenece a un repositorio Git.'));
}

function getGitContext(startDirectory = process.cwd()) {
  const root = getGitRoot(startDirectory);
  const branchResult = commandStatus('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], root);
  const branch = requireSuccessful(branchResult, 'xLast no puede publicar desde un HEAD separado.').trim();
  const name = commandStatus('git', ['config', '--get', 'user.name'], root);
  const email = commandStatus('git', ['config', '--get', 'user.email'], root);

  if (name.status !== 0 || !name.output || email.status !== 0 || !email.output) {
    throw new XLastError(
      'Configura tu identidad de Git antes del release:\n' +
        '  git config user.name "Roger Salinas"\n' +
        '  git config user.email "tu-correo@ejemplo.com"'
    );
  }

  const remoteResult = commandStatus('git', ['remote'], root);
  const remotes = requireSuccessful(remoteResult, 'No pude leer los remotos de Git.')
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (remotes.length === 0) {
    throw new XLastError('Este repositorio no tiene un remoto configurado para hacer push.');
  }

  const upstream = commandStatus(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    root
  );
  return {
    branch,
    hasUpstream: upstream.status === 0,
    identity: `${name.output.trim()} <${email.output.trim()}>`,
    remote: remotes.includes('origin') ? 'origin' : remotes[0],
    root
  };
}

function appendCaptured(current, chunk) {
  const combined = `${current}${chunk.toString('utf8')}`;
  return combined.length > MAX_CAPTURED_OUTPUT
    ? combined.slice(combined.length - MAX_CAPTURED_OUTPUT)
    : combined;
}

function cleanFailureOutput(output) {
  return output
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu, '')
    .replace(/\r/gu, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-14)
    .join('\n');
}

function runGit(args, context, config, painter, activityLabel, successLabel) {
  return new Promise((resolve, reject) => {
    const animated = !config.noAnimation && !config.verbose && supportsAnimation();
    const activity = createActivity(activityLabel, painter, animated);
    const stdio = config.verbose ? 'inherit' : ['inherit', 'pipe', 'pipe'];
    let output = '';
    let settled = false;
    const child = spawn('git', args, {
      cwd: context.root,
      shell: false,
      stdio,
      windowsHide: true
    });

    activity.start();
    if (!config.verbose) {
      child.stdout.on('data', (chunk) => {
        output = appendCaptured(output, chunk);
      });
      child.stderr.on('data', (chunk) => {
        output = appendCaptured(output, chunk);
      });
    }
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      activity.stop(false, `${activityLabel} falló`);
      reject(new XLastError(`No pude iniciar Git: ${error.message}`));
    });
    child.once('close', (status, signal) => {
      if (settled) return;
      settled = true;
      if (status === 0) {
        activity.stop(true, successLabel);
        resolve();
        return;
      }
      activity.stop(false, `${activityLabel} falló`);
      const detail = cleanFailureOutput(output);
      const suffix = detail ? `\n\nDetalle de Git:\n${detail}` : '';
      reject(
        new XLastError(
          `Git terminó con ${signal ? `la señal ${signal}` : `el código ${status ?? 'desconocido'}`}.${suffix}`
        )
      );
    });
  });
}

function parseArgs(args) {
  const config = {
    action: 'menu',
    dryRun: false,
    noAnimation: false,
    noColor: false,
    releaseType: null,
    verbose: false,
    yes: false
  };
  const positional = [];

  for (const token of args) {
    const lower = token.toLowerCase();
    if (lower === '--help' || lower === '-h' || lower === 'help') {
      config.action = 'help';
    } else if (lower === '--version' || lower === '-v' || lower === 'version') {
      config.action = 'version';
    } else if (lower === '--developer' || lower === 'developer') {
      config.action = 'developer';
    } else if (lower === '--doctor' || lower === 'doctor') {
      config.action = 'doctor';
    } else if (lower === '--dry-run') {
      config.dryRun = true;
    } else if (lower === '--no-animation') {
      config.noAnimation = true;
    } else if (lower === '--no-color') {
      config.noColor = true;
    } else if (lower === '--verbose') {
      config.verbose = true;
    } else if (lower === '--yes' || lower === '-y') {
      config.yes = true;
    } else if (token.startsWith('-')) {
      throw new XLastError(`Opción desconocida: ${token}`);
    } else {
      positional.push(lower);
    }
  }

  if (['help', 'version', 'developer', 'doctor'].includes(config.action)) {
    if (positional.length > 0) throw new XLastError(`Argumento inesperado: ${positional[0]}`);
    return config;
  }
  if (positional.length === 0) return config;
  if (positional.length > 1) throw new XLastError(`Argumento inesperado: ${positional[1]}`);

  const command = positional[0];
  if (['p', 'patch', 'mn', 'minor', 'mj', 'major'].includes(command)) {
    config.action = 'release';
    config.releaseType = normalizeReleaseType(command);
    return config;
  }
  const actions = new Set(['init', 'lock', 'unlock', 'reset', 'status', 'push']);
  if (!actions.has(command)) throw new XLastError(`Comando desconocido: ${command}`);
  config.action = command;
  return config;
}

function pushArgs(context) {
  return context.hasUpstream
    ? ['push']
    : ['push', '--set-upstream', context.remote, context.branch];
}

function restoreManifestAfterCommitFailure(context, manifestPath, originalContent) {
  const relativePath = path.relative(context.root, manifestPath);
  try {
    if (originalContent === null) {
      fs.rmSync(manifestPath, { force: true });
      commandStatus('git', ['rm', '--cached', '--quiet', '--ignore-unmatch', '--', relativePath], context.root);
    } else {
      fs.writeFileSync(manifestPath, originalContent, 'utf8');
      commandStatus('git', ['add', '--', relativePath], context.root);
    }
  } catch {
    // El error original contiene el diagnóstico principal; no se oculta con el rollback.
  }
}

async function runRelease(config, painter, releaseType) {
  const context = getGitContext();
  const loaded = readReleaseManifest(context.root);
  const release = prepareRelease(loaded.manifest, releaseType);
  const modeLabel = release.type[0].toUpperCase() + release.type.slice(1);

  printBrand(
    painter,
    packageInfo.version,
    loaded.manifest.locked ? `Bloqueado en ${modeLabel} · xlast unlock` : undefined
  );
  printInfo(painter, 'REPOSITORIO', context.root);
  printInfo(painter, 'RAMA', context.branch);
  printInfo(painter, 'TIPO', release.initial ? `${modeLabel} · release inicial` : modeLabel);
  printInfo(painter, 'VERSIÓN', painter.accent(`v${release.version}`));
  printInfo(painter, 'BUILD', release.build);
  printInfo(painter, 'COMMIT', release.message);
  console.log('');

  if (config.dryRun) {
    console.log(`  ${painter.warning('◆')}  ${painter.bold('Simulación activa')}`);
    console.log(`  ${painter.dim('No se modificó xrelease.json ni se ejecutó Git.')}`);
    console.log(`\n  ${painter.dim('git add .')}`);
    console.log(`  ${painter.dim(`git commit -m "${release.message}"`)}`);
    console.log(`  ${painter.dim(`git ${pushArgs(context).join(' ')}`)}\n`);
    return 0;
  }

  const originalContent = loaded.exists ? fs.readFileSync(loaded.manifestPath, 'utf8') : null;
  writeReleaseManifest(loaded.manifestPath, release.manifest);
  printStep(painter, 1, 4, `${MANIFEST_FILENAME} preparado`);

  let committed = false;
  try {
    await runGit(['add', '.'], context, config, painter, 'Preparando cambios', 'Cambios preparados');
    printStep(painter, 2, 4, 'git add . completado');
    await runGit(
      ['commit', '-m', release.message],
      context,
      config,
      painter,
      'Creando release',
      `Commit v${release.version} creado`
    );
    committed = true;
    printStep(painter, 3, 4, 'Release confirmado en Git');
  } catch (error) {
    if (!committed) restoreManifestAfterCommitFailure(context, loaded.manifestPath, originalContent);
    throw error;
  }

  try {
    await runGit(
      pushArgs(context),
      context,
      config,
      painter,
      'Publicando en GitHub',
      'Push completado'
    );
  } catch (error) {
    throw new XLastError(
      `El commit "${release.message}" fue creado, pero el push falló.\n` +
        `No generes otra versión: corrige la conexión y ejecuta xlast push.\n\n${error.message}`
    );
  }
  printStep(painter, 4, 4, `Publicado en ${context.remote}/${context.branch}`);

  printResultCard(painter, `Release v${release.version} publicado`, [
    `Build: ${release.build}`,
    `Tipo: ${modeLabel}`,
    `Rama: ${context.branch}`,
    `${PRODUCT_VENDOR} · ${PRODUCT_AUTHOR}`
  ]);
  console.log('');
  return 0;
}

async function runPush(config, painter) {
  const context = getGitContext();
  const loaded = readReleaseManifest(context.root);
  printBrand(painter, packageInfo.version, 'Recuperación de publicación.');
  printInfo(painter, 'RAMA', context.branch);
  printInfo(painter, 'REMOTO', context.remote);
  printInfo(painter, 'VERSIÓN', loaded.exists ? `v${loaded.manifest.version}` : 'Sin manifiesto');
  console.log('');

  if (config.dryRun) {
    console.log(`  ${painter.warning('◆')}  ${painter.bold('Simulación activa')}`);
    console.log(`  ${painter.dim(`git ${pushArgs(context).join(' ')}`)}\n`);
    return 0;
  }
  await runGit(pushArgs(context), context, config, painter, 'Publicando commit pendiente', 'Push completado');
  console.log(`\n  ${painter.success('✓')}  La rama quedó sincronizada con GitHub.\n`);
  return 0;
}

function runInit(painter) {
  const repositoryRoot = getGitRoot();
  const loaded = readReleaseManifest(repositoryRoot);
  if (loaded.exists) {
    throw new XLastError(`${MANIFEST_FILENAME} ya existe y no fue modificado:\n  ${loaded.manifestPath}`);
  }
  writeReleaseManifest(loaded.manifestPath, loaded.manifest);
  printBrand(painter, packageInfo.version, 'Control de releases por proyecto.');
  printInfo(painter, 'ARCHIVO', loaded.manifestPath);
  printInfo(painter, 'BASE', `v${BASE_VERSION}`);
  printInfo(painter, 'AUTOR', PRODUCT_AUTHOR);
  printInfo(painter, 'ESTUDIO', PRODUCT_VENDOR);
  console.log(`\n  ${painter.success('✓')}  ${MANIFEST_FILENAME} fue creado.`);
  console.log(`  ${painter.dim('Primer deploy:')} xlast p\n`);
  return 0;
}

function runStatus(painter) {
  const repositoryRoot = getGitRoot();
  const branchResult = commandStatus(
    'git',
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    repositoryRoot
  );
  const branch = branchResult.status === 0 ? branchResult.output : 'HEAD separado';
  const loaded = readReleaseManifest(repositoryRoot);
  printBrand(painter, packageInfo.version, 'Estado del proyecto.');
  printInfo(painter, 'REPOSITORIO', repositoryRoot);
  printInfo(painter, 'RAMA', branch);
  printInfo(painter, 'MANIFIESTO', loaded.exists ? loaded.manifestPath : 'Aún no existe');
  printInfo(painter, 'VERSIÓN', `v${loaded.manifest.version}`);
  printInfo(painter, 'RELEASES', String(loaded.manifest.releaseCount));
  printInfo(painter, 'ÚLTIMO TIPO', loaded.manifest.lastType || 'Ninguno');
  printInfo(
    painter,
    'BLOQUEO',
    loaded.manifest.locked ? painter.accent(`Activo · ${loaded.manifest.lastType}`) : 'Desactivado'
  );
  printInfo(painter, 'ÚLTIMO BUILD', loaded.manifest.build.id || 'Ninguno');
  if (!loaded.exists) console.log(`\n  ${painter.dim('Se creará automáticamente con el primer release.')}`);
  console.log('');
  return 0;
}

function runLock(painter) {
  const repositoryRoot = getGitRoot();
  const loaded = readReleaseManifest(repositoryRoot);
  if (!loaded.exists || loaded.manifest.lastType === null) {
    throw new XLastError('Primero crea un release para que xLast pueda recordar su tipo.');
  }
  if (!loaded.manifest.locked) {
    loaded.manifest.locked = true;
    writeReleaseManifest(loaded.manifestPath, loaded.manifest);
  }
  printBrand(painter, packageInfo.version, 'Tipo de release bloqueado.');
  printInfo(painter, 'TIPO', loaded.manifest.lastType);
  console.log(`\n  ${painter.success('✓')}  Ahora basta ejecutar xlast para repetirlo.`);
  console.log(`  ${painter.dim('Para volver al selector:')} xlast unlock\n`);
  return 0;
}

function runUnlock(painter) {
  const repositoryRoot = getGitRoot();
  const loaded = readReleaseManifest(repositoryRoot);
  if (!loaded.exists) throw new XLastError(`No encontré ${MANIFEST_FILENAME} en este proyecto.`);
  loaded.manifest.locked = false;
  writeReleaseManifest(loaded.manifestPath, loaded.manifest);
  printBrand(painter, packageInfo.version, 'Selector de releases restaurado.');
  console.log(`  ${painter.success('✓')}  xLast fue desbloqueado.`);
  console.log(`  ${painter.dim('La próxima vez que ejecutes xlast podrás elegir el tipo.')}\n`);
  return 0;
}

async function confirmReset(config, painter) {
  if (config.yes) return true;
  if (!process.stdin.isTTY) {
    throw new XLastError('Reset requiere confirmación. Ejecuta xlast reset --yes.');
  }
  const interfaceInstance = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await interfaceInstance.question(
      `  ${painter.warning('¿Reiniciar el versionado a v7.0.0?')} ${painter.dim('[s/N]')} `
    );
    return ['s', 'si', 'sí', 'y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    interfaceInstance.close();
  }
}

async function runReset(config, painter) {
  const repositoryRoot = getGitRoot();
  const loaded = readReleaseManifest(repositoryRoot);
  printBrand(painter, packageInfo.version, 'Reinicio controlado del versionado.');
  printInfo(painter, 'ACTUAL', `v${loaded.manifest.version}`);
  printInfo(painter, 'NUEVA BASE', `v${BASE_VERSION}`);
  console.log(`  ${painter.dim('El contador diario de builds se conservará para no repetir IDs.')}\n`);

  if (!(await confirmReset(config, painter))) {
    console.log(`\n  ${painter.dim('Reset cancelado.')}\n`);
    return 0;
  }
  const resetManifest = {
    ...loaded.manifest,
    version: BASE_VERSION,
    releaseCount: 0,
    lastType: null,
    locked: false,
    lastRelease: null
  };
  writeReleaseManifest(loaded.manifestPath, resetManifest);
  console.log(`\n  ${painter.success('✓')}  Versionado reiniciado. El próximo release será v7.0.0.\n`);
  return 0;
}

async function askMenu(painter, manifest, repositoryRoot) {
  if (!process.stdin.isTTY) {
    throw new XLastError('El selector necesita una terminal interactiva. Usa xlast p, xlast mn o xlast mj.');
  }
  const previews = {
    patch: prepareRelease(manifest, 'patch').version,
    minor: prepareRelease(manifest, 'minor').version,
    major: prepareRelease(manifest, 'major').version
  };
  const actions = [];
  if (manifest.lastType) {
    const lastType = manifest.lastType[0].toUpperCase() + manifest.lastType.slice(1);
    actions.push({ key: 'L', label: `Fijar ${lastType}` });
  }
  actions.push({ key: 'R', label: 'Reiniciar' }, { key: '0', label: 'Cancelar' });

  printBrand(painter, packageInfo.version);
  printSection(painter, 'Proyecto');
  printInfo(painter, 'NOMBRE', path.basename(repositoryRoot));
  printInfo(
    painter,
    'ESTADO',
    manifest.releaseCount === 0
      ? `Nuevo · inicia en ${painter.accent(`v${BASE_VERSION}`)}`
      : `${painter.accent(`v${manifest.version}`)} · ${manifest.releaseCount} releases`
  );
  printInfo(painter, 'ÚLTIMO BUILD', manifest.build.id || 'Aún no existe');
  console.log('');
  printSection(painter, 'Próximo release');
  printMenuPanel(painter, [
    {
      key: '1',
      title: 'Patch',
      value: `v${previews.patch}`,
      description: 'Correcciones y ajustes'
    },
    {
      key: '2',
      title: 'Minor',
      value: `v${previews.minor}`,
      description: 'Funciones compatibles'
    },
    {
      key: '3',
      title: 'Major',
      value: `v${previews.major}`,
      description: 'Cambios estructurales'
    }
  ]);
  if (manifest.releaseCount === 0) {
    console.log(`  ${painter.dim(`El primer release siempre parte de v${BASE_VERSION}.`)}`);
  }
  console.log('');
  printSection(painter, 'Acciones');
  printMenuActions(painter, actions);
  console.log('');

  const interfaceInstance = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const answer = (
        await interfaceInstance.question(
          `  ${painter.bold('Selecciona una opción')} ${painter.accent('›')} `
        )
      ).trim().toLowerCase();
      if (answer === '1' || answer === 'p' || answer === 'patch') return { action: 'release', type: 'patch' };
      if (answer === '2' || answer === 'mn' || answer === 'minor') return { action: 'release', type: 'minor' };
      if (answer === '3' || answer === 'mj' || answer === 'major') return { action: 'release', type: 'major' };
      if (answer === 'l' || answer === 'lock') {
        if (manifest.lastType) return { action: 'lock' };
        console.log(`  ${painter.warning('Aún no existe un tipo anterior para bloquear.')}`);
        continue;
      }
      if (answer === 'r' || answer === 'reset') return { action: 'reset' };
      if (answer === '0' || answer === 'cancelar' || answer === 'cancel') return { action: 'cancel' };
      console.log(`  ${painter.error('Opción no válida.')} Elige 1, 2, 3, L, R o 0.`);
    }
  } finally {
    interfaceInstance.close();
  }
}

function printHelp(painter) {
  printBrand(painter, packageInfo.version, 'Release menos. Construye más.');
  console.log(`${painter.bold('  USO')}
    xlast                           Abre el selector o repite el tipo bloqueado.
    xlast p                         Publica un patch.
    xlast mn                        Publica un minor.
    xlast mj                        Publica un major.

${painter.bold('  CONTROL')}
    xlast init                      Crea xrelease.json sin publicar.
    xlast status                    Muestra versión, build y bloqueo.
    xlast lock                      Bloquea el último tipo utilizado.
    xlast unlock                    Restaura el selector interactivo.
    xlast reset                     Reinicia el versionado a 7.0.0.
    xlast push                      Reintenta únicamente un push pendiente.

${painter.bold('  OPCIONES')}
    --dry-run                       Simula sin modificar archivos ni Git.
    --yes, -y                       Confirma reset sin preguntar.
    --verbose                       Muestra la salida completa de Git.
    --no-animation                  Desactiva las animaciones.
    --no-color                      Desactiva los colores.
    --doctor                        Revisa Git, remoto e identidad.
    --version, -v                   Muestra la versión de xLast.
    --developer                     Muestra la autoría.
    --help, -h                      Muestra esta ayuda.

${painter.bold('  FORMATO')}
    Release YYYY-MM-DD • Build: X-YYYYMMDDNN • vMajor.Minor.Patch

  ${painter.dim(`${PRODUCT_VENDOR} · Desarrollado por ${PRODUCT_AUTHOR}`)}
`);
}

function printDeveloper(painter) {
  printBrand(painter, packageInfo.version, 'Una herramienta de Dexly Studios.');
  printInfo(painter, 'AUTOR', PRODUCT_AUTHOR);
  printInfo(painter, 'ESTUDIO', PRODUCT_VENDOR);
  printInfo(painter, 'PRODUCTO', 'xLast');
  printInfo(painter, 'LEMA', painter.italic('Build without limits'));
  console.log('');
}

function runDoctor(painter) {
  const checks = [];
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  checks.push({ name: 'Node.js', ok: nodeMajor >= MINIMUM_NODE_MAJOR, detail: `v${process.versions.node}` });
  const git = commandStatus('git', ['--version']);
  checks.push({ name: 'Git', ok: git.available && git.status === 0, detail: git.output || 'no encontrado' });

  let root = null;
  if (git.available && git.status === 0) {
    const repository = commandStatus('git', ['rev-parse', '--show-toplevel']);
    root = repository.status === 0 ? repository.output.trim() : null;
    checks.push({ name: 'Repositorio', ok: Boolean(root), detail: root || 'fuera de un repositorio' });
  } else {
    checks.push({ name: 'Repositorio', ok: false, detail: 'Git no disponible' });
  }

  if (root) {
    const identityName = commandStatus('git', ['config', '--get', 'user.name'], root);
    const identityEmail = commandStatus('git', ['config', '--get', 'user.email'], root);
    const identityOk = identityName.status === 0 && identityEmail.status === 0;
    checks.push({
      name: 'Identidad',
      ok: identityOk,
      detail: identityOk ? `${identityName.output} <${identityEmail.output}>` : 'nombre o correo pendiente'
    });
    const remotes = commandStatus('git', ['remote'], root);
    checks.push({ name: 'Remoto', ok: remotes.status === 0 && Boolean(remotes.output), detail: remotes.output || 'sin remoto' });
  }

  printBrand(painter, packageInfo.version, 'Diagnóstico del entorno.');
  for (const check of checks) {
    const mark = check.ok ? painter.success('✓') : painter.error('✕');
    console.log(`  ${mark}  ${painter.bold(check.name.padEnd(13, ' '))} ${check.detail}`);
  }
  const healthy = checks.every((check) => check.ok);
  console.log(`\n  ${healthy ? painter.success('Todo está listo para publicar.') : painter.warning('Hay requisitos pendientes.')}\n`);
  return healthy ? 0 : 1;
}

async function runMenu(config, painter) {
  const repositoryRoot = getGitRoot();
  const loaded = readReleaseManifest(repositoryRoot);
  if (loaded.manifest.locked && loaded.manifest.lastType) {
    return runRelease(config, painter, loaded.manifest.lastType);
  }
  const selection = await askMenu(painter, loaded.manifest, repositoryRoot);
  if (selection.action === 'release') return runRelease(config, painter, selection.type);
  if (selection.action === 'lock') return runLock(painter);
  if (selection.action === 'reset') return runReset(config, painter);
  console.log(`\n  ${painter.dim('No se modificó nada.')}\n`);
  return 0;
}

async function main(args = process.argv.slice(2)) {
  let config;
  try {
    config = parseArgs(args);
    const painter = createPainter(!config.noColor && supportsColor());
    switch (config.action) {
      case 'help':
        printHelp(painter);
        return 0;
      case 'version':
        console.log(`xlast ${packageInfo.version}`);
        return 0;
      case 'developer':
        printDeveloper(painter);
        return 0;
      case 'doctor':
        return runDoctor(painter);
      case 'init':
        return runInit(painter);
      case 'status':
        return runStatus(painter);
      case 'lock':
        return runLock(painter);
      case 'unlock':
        return runUnlock(painter);
      case 'reset':
        return runReset(config, painter);
      case 'push':
        return runPush(config, painter);
      case 'release':
        return runRelease(config, painter, config.releaseType);
      default:
        return runMenu(config, painter);
    }
  } catch (error) {
    const painter = createPainter(!(config && config.noColor) && supportsColor(process.stderr));
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n  ${painter.error('✕ Error')}  ${message}`);
    console.error(`\n  Usa ${painter.bold('xlast --help')} para ver los comandos disponibles.\n`);
    return error instanceof XLastError ? error.exitCode : 1;
  }
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  BASE_VERSION,
  MANIFEST_FILENAME,
  PRODUCT_AUTHOR,
  PRODUCT_VENDOR,
  XLastError,
  buildId,
  bumpVersion,
  commandStatus,
  createReleaseManifest,
  formatReleaseDate,
  getGitContext,
  getGitRoot,
  main,
  normalizeReleaseType,
  parseArgs,
  parseVersion,
  prepareRelease,
  readReleaseManifest,
  validateManifest,
  writeReleaseManifest
};
