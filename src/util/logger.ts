import colors from 'colors';

const LINE  = '─'.repeat(52);
const DLINE = '═'.repeat(52);

function now() {
  return new Date().toLocaleTimeString('es-CO', { hour12: false });
}

export function logBanner() {
  console.log('\n' + colors.magenta('╔' + DLINE + '╗'));
  console.log(colors.magenta('║') + colors.bold.cyan('        ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗     ') + colors.magenta('║'));
  console.log(colors.magenta('║') + colors.bold.cyan('        ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝     ') + colors.magenta('║'));
  console.log(colors.magenta('║') + colors.bold.cyan('        ██║███████║██████╔╝██║   ██║██║███████╗     ') + colors.magenta('║'));
  console.log(colors.magenta('║') + colors.bold.cyan('   ██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║     ') + colors.magenta('║'));
  console.log(colors.magenta('║') + colors.bold.cyan('   ╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║     ') + colors.magenta('║'));
  console.log(colors.magenta('║') + colors.bold.cyan('    ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝     ') + colors.magenta('║'));
  console.log(colors.magenta('║') + colors.gray('                    API  v5.5                       ') + colors.magenta('║'));
  console.log(colors.magenta('╚' + DLINE + '╝') + '\n');
}

export function logServerStart(env: string, port: number) {
  console.log(colors.green('┌' + LINE + '┐'));
  console.log(colors.green('│') + colors.bold('  🚀 HTTPS SERVER                                   ') + colors.green('│'));
  console.log(colors.green('├' + LINE + '┤'));
  console.log(colors.green('│') + `  ${colors.gray('env  :')}  ${colors.yellow(env.toUpperCase().padEnd(44))}` + colors.green('│'));
  console.log(colors.green('│') + `  ${colors.gray('port :')}  ${colors.cyan(String(port).padEnd(44))}` + colors.green('│'));
  console.log(colors.green('│') + `  ${colors.gray('time :')}  ${colors.white(now().padEnd(44))}` + colors.green('│'));
  console.log(colors.green('└' + LINE + '┘'));
}

export function logHttpStart(port: number) {
  console.log(colors.blue('┌' + LINE + '┐'));
  console.log(colors.blue('│') + colors.bold('  🌐 HTTP  SERVER  (redirect / dev)                 ') + colors.blue('│'));
  console.log(colors.blue('├' + LINE + '┤'));
  console.log(colors.blue('│') + `  ${colors.gray('port :')}  ${colors.cyan(String(port).padEnd(44))}` + colors.blue('│'));
  console.log(colors.blue('│') + `  ${colors.gray('time :')}  ${colors.white(now().padEnd(44))}` + colors.blue('│'));
  console.log(colors.blue('└' + LINE + '┘'));
}

export function logSocketStart() {
  console.log(colors.magenta('┌' + LINE + '┐'));
  console.log(colors.magenta('│') + colors.bold('  🔌 SOCKET.IO  ready                               ') + colors.magenta('│'));
  console.log(colors.magenta('│') + `  ${colors.gray('time :')}  ${colors.white(now().padEnd(44))}` + colors.magenta('│'));
  console.log(colors.magenta('└' + LINE + '┘'));
}

export function logDBSuccess(dbName?: string) {
  console.log(colors.green('┌' + LINE + '┐'));
  console.log(colors.green('│') + colors.bold('  🍃 MONGODB  connected                             ') + colors.green('│'));
  if (dbName) {
    console.log(colors.green('│') + `  ${colors.gray('db   :')}  ${colors.cyan(dbName.padEnd(44))}` + colors.green('│'));
  }
  console.log(colors.green('│') + `  ${colors.gray('time :')}  ${colors.white(now().padEnd(44))}` + colors.green('│'));
  console.log(colors.green('└' + LINE + '┘'));
}

export function logDBError(err: unknown) {
  console.log(colors.red('┌' + LINE + '┐'));
  console.log(colors.red('│') + colors.bold('  ❌ MONGODB  connection failed                      ') + colors.red('│'));
  console.log(colors.red('│') + `  ${colors.gray('err  :')}  ${colors.red(String(err).slice(0, 44).padEnd(44))}` + colors.red('│'));
  console.log(colors.red('│') + `  ${colors.gray('time :')}  ${colors.white(now().padEnd(44))}` + colors.red('│'));
  console.log(colors.red('└' + LINE + '┘'));
}
