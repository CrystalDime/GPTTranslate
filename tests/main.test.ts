import {
  TranslationState,
} from '../src/content';

describe('Main Functions', () => {
  let state: TranslationState;

  beforeEach(() => {
    state = new TranslationState(10, 100); // Initialize state with batch size 10 and cache size 100
    jest.clearAllMocks();
  });

  // test('gatherTextNodes should gather all text nodes, and enforce exclusions', async () => {
  //         document.body.innerHTML = '<div>Text1<span>Text2</span><p>Text3</p><script>execute js</script></div>';
  //         const nodes = await gatherTextNodes(document.body, state);
  //
  //         expect(nodes.size).toBe(3);
  // });
});
