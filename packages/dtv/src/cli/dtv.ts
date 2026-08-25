import { Command } from 'commander';
import { registerTypegenCommand } from './commands/typegen.js';
import { registerInitCommand } from './commands/init.js';

const program = new Command();
program
    .name('dtv')
    .description('DTV CLI')
    .version('0.0.0');

registerTypegenCommand(program);
registerInitCommand(program);

program.parse(process.argv);
