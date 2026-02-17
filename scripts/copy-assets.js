#!/usr/bin/env node

/**
 * Copy static assets to dist folder after TypeScript compilation
 */

import { cpSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Ensure dist directory exists
const distDir = join(projectRoot, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Copy HTML files
console.log('Copying HTML files...');
cpSync(join(projectRoot, 'index.html'), join(distDir, 'index.html'));
cpSync(join(projectRoot, 'controller.html'), join(distDir, 'controller.html'));
cpSync(join(projectRoot, 'launcher.html'), join(distDir, 'launcher.html'));

// Copy CSS
console.log('Copying CSS files...');
cpSync(join(projectRoot, 'style.css'), join(distDir, 'style.css'));

// Copy media folder
console.log('Copying media assets...');
cpSync(join(projectRoot, 'media'), join(distDir, 'media'), { recursive: true });

// Copy calibration file
console.log('Copying calibration data...');
cpSync(join(projectRoot, 'map-calibration.json'), join(distDir, 'map-calibration.json'));

// Copy config example
if (existsSync(join(projectRoot, 'trafik-config.json.example'))) {
  cpSync(join(projectRoot, 'trafik-config.json.example'), join(distDir, 'trafik-config.json.example'));
}

// Copy trafik config if it exists (gitignored)
if (existsSync(join(projectRoot, 'trafik-config.json'))) {
  console.log('Copying trafik-config.json...');
  cpSync(join(projectRoot, 'trafik-config.json'), join(distDir, 'trafik-config.json'));
}

console.log('✅ Assets copied successfully!');
