'use strict';

const ERASE_LINE = '\r\u001b[2K';

function supportsColor(stream = process.stdout) {
  return Boolean(stream.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb');
}

function supportsAnimation(stream = process.stdout) {
  return Boolean(stream.isTTY && process.env.TERM !== 'dumb' && !process.env.CI);
}

function createPainter(enabled = supportsColor()) {
  const paint = (code, value) => (enabled ? `\u001b[${code}m${value}\u001b[0m` : value);

  return {
    enabled,
    accent: (value) => paint('38;5;213', value),
    violet: (value) => paint('38;5;141', value),
    cyan: (value) => paint('38;5;117', value),
    white: (value) => paint('97', value),
    bold: (value) => paint('1', value),
    italic: (value) => paint('3', value),
    dim: (value) => paint('2', value),
    error: (value) => paint('38;5;203', value),
    success: (value) => paint('38;5;120', value),
    warning: (value) => paint('38;5;221', value)
  };
}

function printBrand(painter, version, subtitle = 'By Roger Salinas · Dexly Studios') {
  const name = 'xLast';
  const section = 'RELEASE CONTROL';
  const versionLabel = `v${version}`;
  const width = 54;
  const productLength = name.length + 3 + section.length;
  const gap = ' '.repeat(Math.max(1, width - productLength - versionLabel.length - 4));
  const subtitleText = `  ${subtitle}`.padEnd(width, ' ');

  console.log('');
  console.log(`  ${painter.violet('╭' + '─'.repeat(width) + '╮')}`);
  console.log(
    `  ${painter.violet('│')}  ${painter.bold(painter.white(name))}${painter.dim(' / ')}` +
      `${painter.bold(painter.cyan(section))}${gap}` +
      `${painter.accent(versionLabel)}  ${painter.violet('│')}`
  );
  console.log(`  ${painter.violet('│')}${painter.dim(subtitleText)}${painter.violet('│')}`);
  console.log(`  ${painter.violet('╰' + '─'.repeat(width) + '╯')}`);
  console.log('');
}

function printInfo(painter, label, value) {
  console.log(`  ${painter.dim(label.padEnd(12, ' '))} ${value}`);
}

function printStep(painter, current, total, label) {
  const width = 12;
  const filled = Math.max(0, Math.min(width, Math.round((current / total) * width)));
  const bar = `${painter.accent('━'.repeat(filled))}${painter.dim('─'.repeat(width - filled))}`;
  console.log(`  ${bar}  ${painter.bold(`${current}/${total}`)}  ${label}`);
}

function printSection(painter, title) {
  const label = ` ${String(title).toUpperCase()} `;
  const remaining = Math.max(2, 54 - label.length);
  console.log(`  ${painter.dim('─'.repeat(3))}${painter.bold(label)}${painter.dim('─'.repeat(remaining - 3))}`);
}

function printMenuPanel(painter, options) {
  const width = 54;
  console.log(`  ${painter.violet('╭' + '─'.repeat(width) + '╮')}`);
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const key = String(option.key).padEnd(4, ' ');
    const title = String(option.title).toUpperCase().padEnd(10, ' ');
    const value = String(option.value).padEnd(12, ' ');
    const description = String(option.description).slice(0, 24);
    const used = 2 + key.length + title.length + value.length + description.length;
    const trailing = ' '.repeat(Math.max(0, width - used));
    console.log(
      `  ${painter.violet('│')}  ${painter.accent(key)}${painter.bold(title)}` +
        `${painter.cyan(value)}${painter.dim(description)}${trailing}${painter.violet('│')}`
    );
    if (index < options.length - 1) {
      console.log(`  ${painter.violet('│')}${' '.repeat(width)}${painter.violet('│')}`);
    }
  }
  console.log(`  ${painter.violet('╰' + '─'.repeat(width) + '╯')}`);
}

function printMenuActions(painter, actions) {
  const rendered = actions.map(
    (action) =>
      `${painter.accent(String(action.key).toUpperCase())} ${painter.bold(action.label)}`
  );
  console.log(`  ${rendered.join(`  ${painter.dim('·')}  `)}`);
}

function createActivity(message, painter, enabled = supportsAnimation()) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const trackWidth = 9;
  let timer = null;
  let tick = 0;

  const render = () => {
    const position = tick % (trackWidth * 2 - 2);
    const cursor = position < trackWidth ? position : trackWidth * 2 - 2 - position;
    const track = Array.from({ length: trackWidth }, (_, index) =>
      index === cursor ? painter.accent('◆') : painter.dim('·')
    ).join('');
    const frame = painter.violet(frames[tick % frames.length]);
    process.stdout.write(`${ERASE_LINE}  ${frame}  ${message}  ${track}`);
    tick += 1;
  };

  return {
    start() {
      if (!enabled) {
        console.log(`  ${painter.violet('›')}  ${message}...`);
        return;
      }
      render();
      timer = setInterval(render, 80);
    },
    stop(ok, finalMessage) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (enabled) process.stdout.write(ERASE_LINE);
      const symbol = ok ? painter.success('✓') : painter.error('✕');
      console.log(`  ${symbol}  ${finalMessage}`);
    }
  };
}

function printResultCard(painter, title, lines) {
  const width = 56;
  console.log('');
  console.log(`  ${painter.violet('╭' + '─'.repeat(width) + '╮')}`);
  console.log(
    `  ${painter.violet('│')}  ${painter.success('✓')} ${painter.bold(title.slice(0, width - 4).padEnd(width - 4, ' '))}` +
      `${painter.violet('│')}`
  );
  console.log(`  ${painter.violet('├' + '─'.repeat(width) + '┤')}`);
  for (const line of lines) {
    const clipped = String(line).slice(0, width - 2);
    console.log(`  ${painter.violet('│')}  ${clipped.padEnd(width - 2, ' ')}${painter.violet('│')}`);
  }
  console.log(`  ${painter.violet('╰' + '─'.repeat(width) + '╯')}`);
}

module.exports = {
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
};
