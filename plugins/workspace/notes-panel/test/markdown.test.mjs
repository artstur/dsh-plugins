import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';

async function loadMarkdownApi() {
  let definition = null;
  const window = {
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    __ModuleLoader__: {
      load(value) {
        definition = value;
      },
    },
  };
  let source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  const seam = '    const store = createNotesStore();';
  assert.ok(source.includes(seam), 'test seam should match the production module');
  source = source.replace(
    seam,
    `    window.__dshNotesMarkdownTest = {
      splitTableRow,
      isTableSeparator,
      parseTable,
      parseMarkdownBlocks,
      looksLikeMarkdown,
      firstTitleHeading,
      withoutTitleHeading,
      renameTitleHeading,
      rebaseMarkdown,
      serializeInlineDom,
      serializeBlockDom,
      serializeMarkdownDom,
      createMarkdownEditorController,
      MarkdownEditor,
      renderMarkdownHtml,
      renderInlineMarkdownHtml,
      buildStandaloneHtml,
    };
${seam}`,
  );
  const context = vm.createContext({
    window,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    crypto: globalThis.crypto,
    navigator: {},
    document: {},
    console,
    setTimeout,
    clearTimeout,
    Date,
    Intl,
    Math,
    Set,
    Map,
    JSON,
    Object,
    Array,
    String,
    Number,
    RegExp,
    Error,
  });
  vm.runInContext(source, context, { filename: 'client.js' });
  assert.ok(definition, 'client module should register');
  definition.factory((name) => {
    assert.equal(name, 'react');
    return { createElement() {} };
  });
  return window.__dshNotesMarkdownTest;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const SAMPLE = [
  '## 四、最近 30 天下载量最高的插件',
  '',
  '| 插件 | 类型 | npm 下载 |',
  '|---|----|---:|',
  '| billion-context | 会话 / 上下文压缩 | 2,010,311 |',
  '| dshmarket | 插件市场 | 653,177 |',
  '| modlens | 视觉理解 | 106,666 |',
].join('\n');

test('parses the GFM table from the report note', async () => {
  const api = await loadMarkdownApi();
  const blocks = plain(api.parseMarkdownBlocks(SAMPLE));
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].level, 2);
  assert.equal(blocks[0].text, '四、最近 30 天下载量最高的插件');

  const table = blocks.find((block) => block.type === 'table');
  assert.ok(table, 'the pipe table should be detected');
  assert.deepEqual(table.headers, ['插件', '类型', 'npm 下载']);
  assert.deepEqual(table.aligns, ['left', 'left', 'right']);
  assert.equal(table.rows.length, 3);
  assert.deepEqual(table.rows[0], ['billion-context', '会话 / 上下文压缩', '2,010,311']);

  const paragraph = blocks.find((block) => block.type === 'paragraph');
  assert.equal(paragraph, undefined, 'the whole section should be heading + table');
});

test('accepts tables without outer pipes and with escaped pipes', async () => {
  const api = await loadMarkdownApi();
  const blocks = plain(
    api.parseMarkdownBlocks(['A | B', '--- | :---:', 'x \\| y | z'].join('\n')),
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'table');
  assert.deepEqual(blocks[0].headers, ['A', 'B']);
  assert.deepEqual(blocks[0].aligns, ['left', 'center']);
  assert.deepEqual(blocks[0].rows[0], ['x | y', 'z']);
});

test('separator detection rejects ordinary pipe text', async () => {
  const api = await loadMarkdownApi();
  assert.equal(api.isTableSeparator('|---|:---:|---:|'), true);
  assert.equal(api.isTableSeparator('| --- | text |'), false);
  assert.equal(api.isTableSeparator('---'), false);
  assert.equal(api.isTableSeparator('|--|--|'), false);
});

test('a pipe line without a separator stays a paragraph', async () => {
  const api = await loadMarkdownApi();
  const blocks = plain(api.parseMarkdownBlocks('a | b\nplain text'));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');
});

test('mixed markdown blocks keep their order', async () => {
  const api = await loadMarkdownApi();
  const blocks = plain(
    api.parseMarkdownBlocks(
    [
      '# Title',
      '',
      'First paragraph',
      'continues here',
      '',
      '| H1 | H2 |',
      '|---|---:|',
      '| a | 1 |',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '> quoted',
      '> lines',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      '---',
      '',
      'Tail paragraph',
    ].join('\n'),
  ));
  assert.deepEqual(
    blocks.map((block) => block.type),
    ['heading', 'paragraph', 'table', 'list', 'list', 'quote', 'code', 'hr', 'paragraph'],
  );
  assert.equal(blocks[1].text, 'First paragraph\ncontinues here');
  assert.equal(blocks[3].ordered, false);
  assert.equal(blocks[4].ordered, true);
  assert.equal(blocks[5].text, 'quoted\nlines');
  assert.equal(blocks[6].text, 'const x = 1;');
});

test('row width is normalized to the header width', async () => {
  const api = await loadMarkdownApi();
  const blocks = plain(
    api.parseMarkdownBlocks(
      ['| A | B | C |', '|---|---|---|', '| only-one |', '| a | b | c | extra |'].join('\n'),
    ),
  );
  assert.equal(blocks[0].type, 'table');
  assert.deepEqual(blocks[0].rows[0], ['only-one', '', '']);
  assert.deepEqual(blocks[0].rows[1], ['a', 'b', 'c']);
});

test('empty body yields no blocks', async () => {
  const api = await loadMarkdownApi();
  assert.deepEqual(plain(api.parseMarkdownBlocks('')), []);
  assert.deepEqual(plain(api.parseMarkdownBlocks('   \n\n')), []);
});

test('detects markdown bodies for the edit-mode hint', async () => {
  const api = await loadMarkdownApi();
  assert.equal(api.looksLikeMarkdown('| a | b |\n|---|---|\n| 1 | 2 |'), true);
  assert.equal(api.looksLikeMarkdown('# Heading\n\ntext'), true);
  assert.equal(api.looksLikeMarkdown('- one\n- two'), true);
  assert.equal(api.looksLikeMarkdown('1. first'), true);
  assert.equal(api.looksLikeMarkdown('plain text with a | pipe'), false);
  assert.equal(api.looksLikeMarkdown(''), false);
});

test('旧模式 key、按钮和正文 textarea 不再驱动编辑', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /loadViewMode|saveViewMode|VIEW_MODE_STORAGE_KEY|previewBody|setViewMode|dsh-notes-body-input|dsh-notes-viewmode/);
  assert.match(source, /h\(MarkdownEditor,/);
  assert.match(source, /contentEditable: true/);
  assert.doesNotMatch(source, /\.innerText\b/);
});

test('renders tables and inline markdown to HTML for H5 export', async () => {
  const api = await loadMarkdownApi();
  const html = api.renderMarkdownHtml(
    ['## 标题', '', '**bold** and `code`', '', '| A | B |', '|---|---:|', '| 1 | 2 |'].join(
      '\n',
    ),
  );
  assert.ok(html.includes('<h2>标题</h2>'), html);
  assert.ok(html.includes('<strong>bold</strong>'), html);
  assert.ok(html.includes('<code>code</code>'), html);
  assert.ok(html.includes('<table>'), html);
  assert.ok(html.includes('<th style="text-align:right">B</th>'), html);
  assert.ok(html.includes('<td style="text-align:right">2</td>'), html);
});

test('H5 markdown rendering escapes html and drops unsafe links', async () => {
  const api = await loadMarkdownApi();
  const html = api.renderMarkdownHtml('| <script>x</script> |\n|---|\n| [bad](javascript:alert(1)) |');
  assert.ok(html.includes('&lt;script&gt;'), html);
  assert.ok(html.indexOf('<script>') === -1, html);
  assert.ok(html.indexOf('javascript:alert') === -1 || html.indexOf('<a ') === -1, html);
});

test('standalone H5 page embeds a rendered table instead of raw pipes', async () => {
  const api = await loadMarkdownApi();
  const html = api.buildStandaloneHtml(
    {
      title: 'Report',
      body: '| 插件 | 下载 |\n|---|---:|\n| billion-context | 2,010,311 |',
      images: [],
      sharedAt: 1700000000000,
      senderName: '',
    },
    (key) => key,
    'zh',
  );
  assert.ok(html.indexOf('<table>') !== -1, 'table should be rendered');
  assert.ok(html.indexOf('<td style="text-align:right">2,010,311</td>') !== -1, html);
  assert.ok(html.indexOf('| 插件 |') === -1, 'raw table source should not be echoed');
  assert.ok(html.indexOf('Content-Security-Policy') !== -1);
});

// 仅提供序列化函数需要的 DOM 接口，不模拟浏览器编辑行为。
function dom(tag, children = [], attributes = {}) {
  if (tag === '#text') return { nodeType: 3, nodeValue: children, textContent: children };
  const node = {
    nodeType: 1, tagName: tag.toUpperCase(),
    childNodes: children.map((child) => typeof child === 'string' ? dom('#text', child) : child),
    style: { textAlign: attributes.align || '' },
    getAttribute(name) { return attributes[name] ?? null; },
    querySelectorAll(selector) {
      const result = [];
      const visit = (parent) => parent.children.forEach((child) => {
        if (child.tagName.toLowerCase() === selector) result.push(child);
        visit(child);
      });
      visit(this);
      return result;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
  };
  Object.defineProperties(node, {
    children: { get: () => node.childNodes.filter((child) => child.nodeType === 1) },
    textContent: { get: () => node.childNodes.map((child) => child.textContent).join('') },
    outerHTML: { get: () => '<' + tag + '>' + node.childNodes.map((child) => child.outerHTML || child.nodeValue).join('') + '</' + tag + '>' },
  });
  return node;
}

test('首 h1 只去重首个有效块，支持空行 CRLF 和闭合标记', async () => {
  const api = await loadMarkdownApi();
  for (const body of ['# 标题\n\n正文', '\r\n  # 标题 ###  \r\n\r\n正文', '# 标题']) {
    assert.ok(api.firstTitleHeading(body, ' 标题 '), body);
    assert.equal(api.parseMarkdownBlocks(api.withoutTitleHeading(body, '标题'))[0]?.type === 'heading', false);
  }
  for (const body of ['# 不同\n\n正文', '## 标题', '前文\n\n# 标题', '```\n# 标题\n```', '    # 标题', '> # 标题']) {
    assert.equal(api.firstTitleHeading(body, '标题'), null, body);
    assert.equal(api.withoutTitleHeading(body, '标题'), body);
  }
  assert.equal(api.firstTitleHeading('# 标题', ''), null);
  const repeated = '# 标题\n\n正文\n\n# 标题';
  assert.equal(api.withoutTitleHeading(repeated, '标题'), '\n\n正文\n\n# 标题');
});

test('标题重命名只同步原同名首行，保持间隔 CRLF 与其他标题', async () => {
  const api = await loadMarkdownApi();
  const body = '\r\n  #  原标题 ###  \r\n\r\n**格式**\r\n# 原标题\r\n';
  assert.equal(api.renameTitleHeading(body, '原标题', '新标题'), body.replace('#  原标题', '#  新标题'));
  assert.equal(api.renameTitleHeading(body, '不匹配', '新标题'), body);
  assert.equal(api.renameTitleHeading('## 原标题\n# 原标题', '原标题', '新标题'), '## 原标题\n# 原标题');
});

test('源码区间是原文偏移，默认 parser 不增加元数据', async () => {
  const api = await loadMarkdownApi();
  const source = '\r\n# 标题\r\n\r\n段落  \r\n续行\r\n\r\n```js\r\nconst x = 1;\r\n```\r\n  \r\n';
  const ordinary = plain(api.parseMarkdownBlocks(source));
  const blocks = plain(api.parseMarkdownBlocks(source, { sourceRanges: true }));
  assert.equal(blocks.map((block) => block.source.raw).join(''), source);
  blocks.forEach((block, index) => {
    const range = block.source;
    assert.equal(range.raw, source.slice(range.start, range.end));
    assert.equal(range.prefix + source.slice(range.contentStart, range.contentEnd) + range.suffix, range.raw);
    const { source: ignored, ...semantic } = block;
    assert.deepEqual(semantic, ordinary[index]);
  });
  assert.equal(blocks[2].language, 'js');
  assert.deepEqual(plain(api.parseMarkdownBlocks('```js\nconst x = 1;')), [{ type: 'code', language: 'js', text: 'const x = 1;' }]);
});

test('未编辑块逐字复用，编辑段落不改旁边格式、列表与代码', async () => {
  const api = await loadMarkdownApi();
  const source = '\r\n# 标题\r\n\r\n原段落\r\n\r\n* a\r\n* b\r\n\r\n```javascript\r\nconst x = 1;\r\n```\r\n';
  const blocks = api.parseMarkdownBlocks(source, { sourceRanges: true });
  const nodes = blocks.map((block) => dom(block.type === 'heading' ? 'h1' : block.type === 'list' ? 'ul' : block.type === 'code' ? 'pre' : 'p', [block.text || '列表']));
  const records = new Map(nodes.map((node, index) => [node, { block: blocks[index], fingerprint: node.outerHTML }]));
  assert.equal(api.serializeMarkdownDom(nodes, records), source);
  nodes[1].childNodes = [dom('#text', '新段落')];
  assert.equal(api.serializeMarkdownDom(nodes, records), source.replace('原段落', '新段落'));
  const changed = dom('p', ['**粗体** ', dom('a', ['链接'], { href: 'https://example.com' })]);
  nodes.push(changed);
  const result = api.serializeMarkdownDom(nodes, records);
  assert.ok(result.startsWith(source.replace('原段落', '新段落')));
  assert.ok(result.endsWith('**粗体** [链接](https://example.com)'));
});

test('粘贴产生的新源码块与原文相邻块保留分隔，不拼接丢段落', async () => {
  const api = await loadMarkdownApi();
  const before = api.parseMarkdownBlocks('前段\n\n后段', { sourceRanges: true });
  const pasted = api.parseMarkdownBlocks('## 新小节\n\n粘贴文字', { sourceRanges: true });
  const blocks = [...pasted, before[1]];
  const nodes = blocks.map((block) => dom(block.type === 'heading' ? 'h2' : 'p', [block.text]));
  const records = new Map(nodes.map((node, index) => [node, { block: blocks[index], fingerprint: node.outerHTML }]));
  assert.equal(api.serializeMarkdownDom(nodes, records), '## 新小节\n\n粘贴文字\n\n后段');
});

test('编辑块序列化保留 heading、bold、em、code 和安全链接', async () => {
  const api = await loadMarkdownApi();
  const formatted = [dom('strong', ['粗体']), ' ', dom('em', ['斜体']), ' ', dom('code', ['x * y']), ' ', dom('a', ['链接'], { href: 'https://example.com/path' })];
  assert.equal(api.serializeBlockDom(dom('p', formatted)), '**粗体** *斜体* `x * y` [链接](https://example.com/path)');
  assert.equal(api.serializeBlockDom(dom('h2', formatted)), '## **粗体** *斜体* `x * y` [链接](https://example.com/path)');
  assert.equal(api.serializeInlineDom(dom('a', ['坏链接'], { href: 'javascript:alert(1)' })), '坏链接');
  assert.equal(api.serializeInlineDom(dom('script', ['alert(1)'])), '');
  assert.equal(api.serializeInlineDom(dom('code', ['a`b'])), '``a`b``');
});

test('编辑列表 quote 表格和代码块不降为纯文本', async () => {
  const api = await loadMarkdownApi();
  assert.equal(api.serializeBlockDom(dom('ul', [dom('li', [dom('strong', ['一'])]), dom('li', ['二'])])), '- **一**\n- 二');
  assert.equal(api.serializeBlockDom(dom('ol', [dom('li', ['一']), dom('li', ['二'])], { start: '3' })), '3. 一\n4. 二');
  assert.equal(api.serializeBlockDom(dom('blockquote', ['引用', dom('br'), dom('em', ['续行'])])), '> 引用\n> *续行*');
  const table = dom('div', [dom('table', [dom('thead', [dom('tr', [dom('th', ['A']), dom('th', ['B'], { align: 'right' })])]), dom('tbody', [dom('tr', [dom('td', [dom('strong', ['x|y'])]), dom('td', ['2'])])])])]);
  assert.equal(api.serializeBlockDom(table), '| A | B |\n| --- | ---: |\n| **x\\|y** | 2 |');
  assert.equal(api.serializeBlockDom(dom('pre', [dom('code', ['a\n\tb'])]), { block: { type: 'code', language: 'js' } }), '```js\na\n\tb\n```');
  assert.equal(api.serializeBlockDom(dom('pre', [dom('code', ['```\nend'])]), { block: { type: 'code', language: 'text' } }), '````text\n```\nend\n````');
});

test('外部非重叠修改与末尾追加合并，重叠与同点插入拒绝覆盖', async () => {
  const api = await loadMarkdownApi();
  const base = '# 标题\n\n旧日志\n\n手写记录';
  const latest = base.replace('旧日志', '新日志\n\n旧日志');
  const draft = base.replace('手写记录', '**手写补充**');
  assert.deepEqual(plain(api.rebaseMarkdown(base, latest, draft)), { ok: true, body: latest.replace('手写记录', '**手写补充**') });
  assert.equal(api.rebaseMarkdown(base, base + '\n自动日志', draft).body, draft + '\n自动日志');
  assert.equal(api.rebaseMarkdown(base, latest, base).body, latest);
  assert.equal(api.rebaseMarkdown(base, base.replace('手写记录', '外部修改'), draft).ok, false);
  assert.equal(api.rebaseMarkdown('abc', 'aXbc', 'aYbc').ok, false);
  assert.equal(api.rebaseMarkdown(base, latest, latest).body, latest);
});

test('H5 同名首 h1 仅展示一次，不修改快照正文', async () => {
  const api = await loadMarkdownApi();
  const payload = { title: '标题', body: '# 标题\r\n\r\n**正文**\r\n\r\n## 小标题', images: [] };
  const original = payload.body;
  const html = api.buildStandaloneHtml(payload, (key) => key, 'zh');
  assert.equal((html.match(/<h1>标题<\/h1>/g) || []).length, 1);
  assert.ok(html.includes('<h2>小标题</h2>'));
  assert.equal(payload.body, original);
  payload.body = '# 不同标题\n\n# 标题';
  const different = api.buildStandaloneHtml(payload, (key) => key, 'zh');
  assert.equal((different.match(/<h1>/g) || []).length, 3);
});

test('安全 inline 渲染不会在 code 内容或链接属性内部转换格式', async () => {
  const api = await loadMarkdownApi();
  assert.equal(api.renderInlineMarkdownHtml('`**literal** <img onerror=x>`'), '<code>**literal** &lt;img onerror=x&gt;</code>');
  const html = api.renderInlineMarkdownHtml('[链接](https://example.com/**path**)');
  assert.ok(html.includes('href="https://example.com/**path**"'));
  assert.doesNotMatch(html, /href="[^\"]*<strong>/);
});
