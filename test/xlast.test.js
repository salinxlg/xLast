'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  BASE_VERSION,
  buildId,
  bumpVersion,
  commandStatus,
  createReleaseManifest,
  formatReleaseDate,
  parseArgs,
  prepareRelease,
  readReleaseManifest,
  validateManifest,
  writeReleaseManifest
} = require('../bin/xlast');

test('reconoce los alias patch, minor y major', () => {
  assert.equal(parseArgs(['p']).releaseType, 'patch');
  assert.equal(parseArgs(['mn']).releaseType, 'minor');
  assert.equal(parseArgs(['mj']).releaseType, 'major');
  assert.equal(parseArgs(['patch']).releaseType, 'patch');
});

test('incrementa versiones semánticas desde la serie 7', () => {
  assert.equal(bumpVersion('7.0.0', 'patch'), '7.0.1');
  assert.equal(bumpVersion('7.0.9', 'minor'), '7.1.0');
  assert.equal(bumpVersion('7.9.9', 'major'), '8.0.0');
});

test('el primer release siempre se publica como 7.0.0', () => {
  const date = new Date(2026, 7, 11, 12, 0, 0);
  const release = prepareRelease(createReleaseManifest(), 'minor', date);
  assert.equal(release.initial, true);
  assert.equal(release.version, BASE_VERSION);
  assert.equal(release.build, 'X-2026081101');
  assert.equal(
    release.message,
    'Release 2026-08-11 • Build: X-2026081101 • v7.0.0'
  );
  assert.equal(release.manifest.lastType, 'minor');
});

test('el build aumenta durante el día y reinicia su secuencia al día siguiente', () => {
  const manifest = createReleaseManifest();
  manifest.releaseCount = 1;
  manifest.version = '7.0.0';
  manifest.build = { date: '2026-08-11', sequence: 9, id: 'X-2026081109' };

  const sameDay = prepareRelease(manifest, 'patch', new Date(2026, 7, 11, 18, 0, 0));
  assert.equal(sameDay.version, '7.0.1');
  assert.equal(sameDay.build, 'X-2026081110');

  const nextDay = prepareRelease(
    sameDay.manifest,
    'minor',
    new Date(2026, 7, 12, 18, 0, 0)
  );
  assert.equal(nextDay.version, '7.1.0');
  assert.equal(nextDay.build, 'X-2026081201');
});

test('construye IDs con al menos dos dígitos de secuencia', () => {
  assert.equal(buildId('2026-08-11', 1), 'X-2026081101');
  assert.equal(buildId('2026-08-11', 100), 'X-20260811100');
});

test('crea, guarda y vuelve a leer xrelease.json', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xlast-manifest-'));
  const manifestPath = path.join(temporary, 'xrelease.json');
  try {
    const manifest = createReleaseManifest();
    writeReleaseManifest(manifestPath, manifest);
    const loaded = readReleaseManifest(temporary);
    assert.equal(loaded.exists, true);
    assert.equal(loaded.manifest.version, '7.0.0');
    assert.equal(loaded.manifest.author, 'Roger Salinas');
    assert.equal(loaded.manifest.vendor, 'Dexly Studios');
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test('rechaza un manifiesto bloqueado sin tipo anterior', () => {
  const manifest = createReleaseManifest();
  manifest.locked = true;
  assert.throws(() => validateManifest(manifest, 'xrelease.json'), /lastType/u);
});

test('la versión y la ayuda funcionan fuera de un repositorio', () => {
  const executable = path.resolve(__dirname, '..', 'bin', 'xlast.js');
  const version = spawnSync(process.execPath, [executable, '--version'], { encoding: 'utf8' });
  const help = spawnSync(process.execPath, [executable, '--help'], { encoding: 'utf8' });
  assert.equal(version.status, 0);
  assert.match(version.stdout, /^xlast 7\.0\.1/u);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /xlast mn/u);
  assert.match(help.stdout, /X-YYYYMMDDNN/u);
});

test('init crea xrelease.json aunque el repositorio todavía no tenga remoto', (context) => {
  const git = commandStatus('git', ['--version']);
  if (!git.available || git.status !== 0) {
    context.skip('Git no está disponible en este entorno.');
    return;
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xlast-init-'));
  const executable = path.resolve(__dirname, '..', 'bin', 'xlast.js');
  try {
    assert.equal(spawnSync('git', ['init', temporary], { encoding: 'utf8' }).status, 0);
    const result = spawnSync(
      process.execPath,
      [executable, 'init', '--no-color'],
      { cwd: temporary, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(temporary, 'xrelease.json'), 'utf8'));
    assert.equal(manifest.version, '7.0.0');
    assert.equal(manifest.releaseCount, 0);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test('publica en un remoto Git real y lock repite el último tipo', (context) => {
  const git = commandStatus('git', ['--version']);
  if (!git.available || git.status !== 0) {
    context.skip('Git no está disponible en este entorno.');
    return;
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xlast-integration-'));
  const remote = path.join(temporary, 'remote.git');
  const project = path.join(temporary, 'project');
  const executable = path.resolve(__dirname, '..', 'bin', 'xlast.js');
  const run = (command, args, cwd = project) =>
    spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, CI: '1', NO_COLOR: '1' }
    });

  try {
    fs.mkdirSync(project);
    assert.equal(run('git', ['init', '--bare', remote], temporary).status, 0);
    assert.equal(run('git', ['init', '--initial-branch=main'], project).status, 0);
    assert.equal(run('git', ['config', 'user.name', 'Roger Salinas']).status, 0);
    assert.equal(run('git', ['config', 'user.email', 'roger@example.com']).status, 0);
    assert.equal(run('git', ['remote', 'add', 'origin', remote]).status, 0);
    fs.writeFileSync(path.join(project, 'app.js'), 'console.log("xLast");\n', 'utf8');

    const first = run(process.execPath, [executable, 'p', '--no-color', '--no-animation']);
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const firstManifest = JSON.parse(
      fs.readFileSync(path.join(project, 'xrelease.json'), 'utf8')
    );
    assert.equal(firstManifest.version, '7.0.0');
    assert.equal(firstManifest.releaseCount, 1);
    assert.equal(firstManifest.lastType, 'patch');

    const firstSubject = run('git', ['log', '-1', '--format=%s']).stdout.trim();
    assert.equal(firstSubject, firstManifest.lastRelease.message);
    const remoteSubject = run(
      'git',
      ['--git-dir', remote, 'log', '-1', '--format=%s', 'main'],
      temporary
    ).stdout.trim();
    assert.equal(remoteSubject, firstSubject);

    const lock = run(process.execPath, [executable, 'lock', '--no-color']);
    assert.equal(lock.status, 0, `${lock.stdout}\n${lock.stderr}`);
    const repeated = run(process.execPath, [executable, '--no-color', '--no-animation']);
    assert.equal(repeated.status, 0, `${repeated.stdout}\n${repeated.stderr}`);
    const repeatedManifest = JSON.parse(
      fs.readFileSync(path.join(project, 'xrelease.json'), 'utf8')
    );
    assert.equal(repeatedManifest.version, '7.0.1');
    assert.equal(repeatedManifest.releaseCount, 2);
    assert.equal(repeatedManifest.locked, true);
    assert.equal(repeatedManifest.build.sequence, firstManifest.build.sequence + 1);

    const unlock = run(process.execPath, [executable, 'unlock', '--no-color']);
    assert.equal(unlock.status, 0, `${unlock.stdout}\n${unlock.stderr}`);
    const unlockedManifest = JSON.parse(
      fs.readFileSync(path.join(project, 'xrelease.json'), 'utf8')
    );
    assert.equal(unlockedManifest.locked, false);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test('formatea fechas locales como YYYY-MM-DD', () => {
  assert.equal(formatReleaseDate(new Date(2026, 7, 11, 12, 0, 0)), '2026-08-11');
});
