import { LRUCache, TranslationCacheEntry } from '../src/content';
import 'jest-chrome';

describe('LRUCache', () => {
        let cache: LRUCache;

        beforeEach(() => {
                cache = new LRUCache(3);
        });

        it('should set and get cache entries', () => {
                const entry: TranslationCacheEntry = { translatedText: 'Hello', expiry: Date.now() + 1000 };
                cache.set('key1', entry);

                const cachedEntry = cache.get('key1');
                expect(cachedEntry).toEqual(entry);
        });

        it('should remove expired cache entries', () => {
                const entry: TranslationCacheEntry = { translatedText: 'Hello', expiry: Date.now() - 1000 };
                cache.set('key1', entry);

                const cachedEntry = cache.get('key1');
                expect(cachedEntry).toBeUndefined();
        });

        it('should evict the least recently used entry when the max size is exceeded', () => {
                const entry1: TranslationCacheEntry = { translatedText: 'Hello', expiry: Date.now() + 1000 };
                const entry2: TranslationCacheEntry = { translatedText: 'World', expiry: Date.now() + 1000 };
                const entry3: TranslationCacheEntry = { translatedText: 'Foo', expiry: Date.now() + 1000 };
                const entry4: TranslationCacheEntry = { translatedText: 'Bar', expiry: Date.now() + 1000 };

                cache.set('key1', entry1);
                cache.set('key2', entry2);
                cache.set('key3', entry3);
                cache.set('key4', entry4);

                expect(cache.get('key1')).toBeUndefined();
                expect(cache.get('key2')).toEqual(entry2);
                expect(cache.get('key3')).toEqual(entry3);
                expect(cache.get('key4')).toEqual(entry4);
        });
});
