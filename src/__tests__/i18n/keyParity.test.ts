import fs from 'fs';
import path from 'path';

describe('i18n key parity', () => {
  const localeDir = path.resolve(__dirname, '../../../public/locales');
  const enContent = JSON.parse(fs.readFileSync(path.join(localeDir, 'en.json'), 'utf-8'));
  const enKeys = Object.keys(enContent);
  const localeFiles = fs.readdirSync(localeDir).filter(f => f.endsWith('.json') && f !== 'en.json');

  it('should have locale files to test', () => {
    expect(localeFiles.length).toBeGreaterThan(0);
  });

  localeFiles.forEach(file => {
    it(`${file} contains all English keys`, () => {
      const localeContent = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf-8'));
      const localeKeys = Object.keys(localeContent);
      const missing = enKeys.filter(k => !localeKeys.includes(k));
      if (missing.length > 0) {
        fail(`${file} is missing ${missing.length} key(s):\n  ${missing.join('\n  ')}`);
      }
      expect(missing).toEqual([]);
    });
  });
});
