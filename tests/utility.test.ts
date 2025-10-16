import 'jest-chrome';
import { chrome } from 'jest-chrome'

// describe('Utility Functions', () => {
//         test('isNumber should return true for numeric strings', () => {
//                 expect(isNumber('123')).toBe(true);
//                 expect(isNumber('0')).toBe(true);
//                 expect(isNumber('-123')).toBe(true);
//                 expect(isNumber('')).toBe(true);
//         });
//
//         test('isNumber should return false for non-numeric strings', () => {
//                 expect(isNumber('abc')).toBe(false);
//                 expect(isNumber('123abc')).toBe(false);
//         });
//
//         test('getLang should detect language', async () => {
//                 chrome.i18n.detectLanguage.mockImplementation((text) => {
//                         return ({ languages: [{ language: 'en', percentage: 100 }], isReliable: true });
//                 });
//
//                 const lang = await getLang('sample text');
//                 expect(lang).toBe('en');
//         });
// });
