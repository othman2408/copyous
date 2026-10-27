import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import scss from 'postcss-scss';

import config from './postcss.config.cjs';

const file = 'resources/css/template.scss';
const result = await postcss(config.plugins).process(await readFile(file, 'utf8'), { from: file, parser: scss });
process.stdout.write(result.css);
