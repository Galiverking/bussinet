'use strict';

import Logger from './utils/logger.js';

Logger.info('app.js', 'Entry point — module loading...');

// Boot the application
import { boot } from './ui/init.js';
boot();
